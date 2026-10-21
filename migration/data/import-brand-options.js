#!/usr/bin/env node
/**
 * Import legacy brand option settings from CSV into littlefarms_brands (App Builder DB).
 *
 * Join key: brand_name (CSV) ↔ optionLabel (DB). Legacy brand_option_id is not used.
 *
 * Usage (repo root, Stage workspace + .env with DB/IMS credentials):
 *   node migration/data/import-brand-options.js
 *   node migration/data/import-brand-options.js --apply
 *   node migration/data/import-brand-options.js --apply --limit 10
 */

const fs = require('fs')
const path = require('path')

const { normalizeName } = require('../../actions/brand/lib/slug')
const { createBrandCache } = require('../../actions/brand/lib/brand-cache')
const { readCsv, parseCsv } = require('./lib/parse-csv')
const { loadRuntimeParams } = require('./lib/load-params')
const { mapCsvRowToBrandFields, hasImportableFields, fieldDiff, stripLegacyMediaFilenames } = require('./lib/map-csv-row')
const { loadBaseBrands, applyBrandPatches, DEFAULT_PROGRESS_EVERY } = require('./lib/brand-db')
const { DEFAULT_MEDIA_BASE } = require('./lib/legacy-media-urls')
const { initAssetUploader, applyAssetFieldsFromCsv } = require('./lib/brand-asset-migrate')

const DEFAULT_CSV = path.join(__dirname, 'stage', 'Brand_Option_data.csv')
const OUT_DIR = path.join(__dirname, 'out')

function parseArgs (argv) {
  const options = {
    csv: DEFAULT_CSV,
    attributeCode: '',
    apply: false,
    limit: 0,
    preferSdk: false,
    skipCacheFlush: false,
    updateAll: false,
    migrateAssets: false,
    mediaBase: DEFAULT_MEDIA_BASE,
    progressEvery: DEFAULT_PROGRESS_EVERY,
    verbose: false,
    csvText: '',
    skipReportFile: false,
    help: false
  }

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--apply') options.apply = true
    else if (arg === '--dry-run') options.apply = false
    else if (arg === '--csv') options.csv = argv[++i]
    else if (arg === '--attribute') options.attributeCode = argv[++i]
    else if (arg === '--limit') options.limit = Number(argv[++i]) || 0
    else if (arg === '--use-db-sdk') options.preferSdk = true
    else if (arg === '--skip-cache-flush') options.skipCacheFlush = true
    else if (arg === '--update-all') options.updateAll = true
    else if (arg === '--migrate-assets') options.migrateAssets = true
    else if (arg === '--media-base') options.mediaBase = argv[++i]
    else if (arg === '--progress-every') options.progressEvery = Math.max(1, Number(argv[++i]) || DEFAULT_PROGRESS_EVERY)
    else if (arg === '--verbose') options.verbose = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function printHelp () {
  console.log(`Import brand content from CSV into App Builder Database.

Options:
  --csv <path>       CSV file (default: migration/data/stage/Brand_Option_data.csv)
  --attribute <code> Product attribute code (default: from CSV or lf_brand)
  --dry-run          Report only (default)
  --apply            Write patches to littlefarms_brands
  --limit <n>        Process at most n pending updates (apply mode)
  --update-all       Apply CSV mapping for every matched brand (skip diff check)
  --migrate-assets   Download legacy Commerce media and upload to App Builder Files
  --media-base <url> Legacy media root (default: mcstaging Amasty option_images)
  --use-db-sdk       Use @adobe/aio-lib-db with bulkWrite (IMS from .env or aio workspace)
  --skip-cache-flush Skip brand State cache invalidation after apply
  --progress-every <n> Log apply progress every n brands (default: 100)
  --verbose          Log each brand as it is written
`)
}

function ensureOutDir () {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
}

function loadBrandRows (options) {
  const text = String(options.csvText || '').trim()
  if (text) return parseCsv(text)
  if (options.csv && fs.existsSync(options.csv)) return readCsv(options.csv)
  throw new Error(`CSV not found${options.csv ? `: ${options.csv}` : ''}.`)
}

async function runBrandImport (params, options, hooks = {}) {
  const onPhase = typeof hooks.onPhase === 'function' ? hooks.onPhase : () => {}

  const rows = loadBrandRows(options)
  const attributeCodes = [...new Set(rows.map(row => String(row.attribute_code || '').trim()).filter(Boolean))]
  const attributeCode = options.attributeCode ||
    (attributeCodes.length === 1 ? attributeCodes[0] : '') ||
    'lf_brand'

  if (attributeCodes.length > 1 && !options.attributeCode) {
    throw new Error(`CSV has multiple attribute_code values (${attributeCodes.join(', ')}). Pass --attribute.`)
  }

  if (!params) {
    params = loadRuntimeParams({ withIms: options.preferSdk })
  }
  if (options.preferSdk && params.imsCredentialSource) {
    console.log(`IMS credentials: ${params.imsCredentialSource} (server-to-server token for DB SDK)`)
  }
  const { byName } = await loadBaseBrands(params, attributeCode, { preferSdk: options.preferSdk })

  let assetUploader = null
  let assetUploadSource = ''
  if (options.migrateAssets && options.apply) {
    assetUploader = await initAssetUploader()
    assetUploadSource = assetUploader.runtimeSource
    console.log(`Asset upload: ${assetUploadSource}`)
  }
  const assetCache = new Map()

  const plan = {
    mode: options.apply ? 'apply' : 'dry-run',
    updateAll: options.updateAll,
    migrateAssets: options.migrateAssets,
    mediaBase: options.mediaBase,
    assetUploadSource: assetUploadSource || null,
    csv: options.csv,
    attributeCode,
    csvRows: rows.length,
    dbBrands: byName.size,
    matchedByName: 0,
    unmatchedCsvNames: [],
    noImportableFields: 0,
    noChanges: 0,
    wouldUpdate: 0,
    cmsRowsSkippedOnly: 0,
    assetJobs: 0,
    assetErrors: 0,
    samples: [],
    updates: []
  }

  const pending = []

  for (const row of rows) {
    const brandName = String(row.brand_name || '').trim()
    if (!brandName) continue

    const key = normalizeName(brandName)
    const base = byName.get(key)
    if (!base) {
      plan.unmatchedCsvNames.push(brandName)
      continue
    }
    plan.matchedByName += 1

    const mapped = mapCsvRowToBrandFields(row)

    if (options.migrateAssets) {
      const { assets, fieldUpdates } = await applyAssetFieldsFromCsv({
        row,
        attributeCode,
        optionValue: String(base.optionValue),
        mediaBase: options.mediaBase,
        dryRun: !options.apply,
        assetUploader,
        cache: assetCache
      })
      if (assets.length) {
        plan.assetJobs += assets.length
        plan.assetErrors += assets.filter(item => item.error).length
      }
      stripLegacyMediaFilenames(mapped.fields)
      Object.assign(mapped.fields, fieldUpdates)
      if (assets.length) {
        mapped.assets = assets
      }
    }

    if (!hasImportableFields(mapped)) {
      if (mapped.skipped.includes('cms_blocks')) plan.cmsRowsSkippedOnly += 1
      plan.noImportableFields += 1
      continue
    }

    const changes = fieldDiff(base, mapped.fields)
    const hasChanges = Object.keys(changes).length > 0
    if (!hasChanges && !options.updateAll) {
      plan.noChanges += 1
      continue
    }

    plan.wouldUpdate += 1
    const entry = {
      brandName,
      optionValue: String(base.optionValue),
      legacyOptionId: String(row.brand_option_id || ''),
      skipped: mapped.skipped,
      assets: mapped.assets,
      forced: options.updateAll && !hasChanges,
      changes: hasChanges ? changes : fieldDiff(base, mapped.fields)
    }
    plan.updates.push(entry)
    pending.push({ base, fields: mapped.fields })

    if (plan.samples.length < 5) plan.samples.push(entry)
  }

  let reportPath = null
  if (!options.skipReportFile) {
    ensureOutDir()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    reportPath = path.join(OUT_DIR, `brand-import-plan-${stamp}.json`)
    fs.writeFileSync(reportPath, JSON.stringify(plan, null, 2))
  }

  console.log(`Attribute: ${attributeCode}`)
  console.log(`CSV rows: ${plan.csvRows} | DB brands: ${plan.dbBrands}`)
  console.log(`Matched by name: ${plan.matchedByName}`)
  const modeNote = options.updateAll ? ' (update-all: every matched row with CSV fields)' : ''
  console.log(`Would update: ${plan.wouldUpdate} | No changes: ${plan.noChanges} | CSV-only CMS/no fields: ${plan.noImportableFields}${modeNote}`)
  if (options.migrateAssets) {
    console.log(`Assets: ${plan.assetJobs} job(s) planned${plan.assetErrors ? `, ${plan.assetErrors} error(s)` : ''} (base: ${options.mediaBase})`)
  }
  if (plan.unmatchedCsvNames.length) {
    console.log(`Unmatched CSV names: ${plan.unmatchedCsvNames.length} (see report)`)
  }
  if (reportPath) console.log(`Report: ${reportPath}`)

  const summary = {
    mode: plan.mode,
    attributeCode,
    wouldUpdate: plan.wouldUpdate,
    csvRows: plan.csvRows,
    matchedByName: plan.matchedByName,
    unmatchedCsvNames: plan.unmatchedCsvNames.length,
    reportPath
  }

  if (!options.apply) {
    console.log('\nDry run only. Re-run with --apply to write changes.')
    return summary
  }

  if (!plan.wouldUpdate) {
    console.log('Nothing to apply.')
    summary.applied = 0
    return summary
  }

  let toApply = pending
  if (options.limit > 0) toApply = pending.slice(0, options.limit)

  const total = toApply.length
  console.log(`\nApplying ${total} brand update(s)...`)
  onPhase('brands', { done: 0, total, label: 'Brand options' })

  const updated = await applyBrandPatches(params, toApply, {
    preferSdk: options.preferSdk,
    progressEvery: options.progressEvery,
    verbose: options.verbose,
    onProgress: ({ done, total: goal, item }) => {
      onPhase('brands', {
        done,
        total: goal,
        label: item?.base?.optionLabel || 'Brand options'
      })
      if (item?.base?.optionLabel && options.verbose) {
        console.log(`  ${done}/${goal} — ${item.base.optionLabel} (${item.base.optionValue})`)
        return
      }
      console.log(`  ${done}/${goal} brands updated`)
    }
  })

  if (!options.skipCacheFlush) {
    try {
      const cache = await createBrandCache(params)
      await cache.invalidateAll()
      console.log('\nStorefront brand cache invalidated.')
    } catch (error) {
      console.warn(`\nCould not flush brand cache (${error.message}). Run app Settings → flush storefront or redeploy.`)
    }
  }

  console.log(`Applied ${updated} brand document(s).`)
  if (options.limit > 0 && pending.length > options.limit) {
    console.log(`Stopped at --limit ${options.limit}; ${pending.length - options.limit} remaining.`)
  }
  summary.applied = updated
  return summary
}

async function main () {
  const options = parseArgs(process.argv)
  if (options.help) {
    printHelp()
    return
  }
  await runBrandImport(undefined, options)
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message || error)
    process.exit(1)
  })
}

module.exports = {
  runBrandImport
}
