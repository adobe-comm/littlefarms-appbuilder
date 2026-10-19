#!/usr/bin/env node
/**
 * Import legacy Aheadworks Store Locator data from CSV into App Builder DB.
 *
 * Usage (repo root, workspace selected via `aio where`):
 *   node migration/data/import-locations.js
 *   node migration/data/import-locations.js --apply
 *   node migration/data/import-locations.js --apply --create-missing --import-services
 *   node migration/data/import-locations.js --apply --migrate-assets
 */

const fs = require('fs')
const path = require('path')

const { createLocationCache } = require('../../actions/location/lib/location-cache')
const { readCsv } = require('./lib/parse-csv')
const { loadRuntimeParams } = require('./lib/load-params')
const { DEFAULT_LOCATION_MEDIA_BASE } = require('./lib/legacy-media-urls')
const {
  mapCsvRowToLocationFields,
  mapCsvRowToServiceFields,
  mapCsvRowToTeamFields,
  buildTeamLinksByLocationId,
  hasImportableFields,
  stripLegacyMediaUrls
} = require('./lib/map-location-csv-row')
const {
  loadLocations,
  loadServices,
  loadTeamProfiles,
  applyLocationPatches,
  insertLocations,
  upsertServices,
  upsertTeamProfiles,
  bumpLocationCounter,
  bumpServiceCounter,
  bumpTeamCounter,
  buildNewLocationDocument,
  buildServiceDocument,
  buildTeamDocument,
  locationFormDiff,
  normalizeStoreUrl,
  DEFAULT_PROGRESS_EVERY
} = require('./lib/location-db')
const {
  initLocationAssetUploader,
  applyLocationAssetFieldsFromCsv,
  migrateServiceIconFromCsv,
  migrateTeamImageFromCsv
} = require('./lib/location-asset-migrate')

const DEFAULT_LOCATION_CSV = path.join(__dirname, 'stage', 'Location_data_1.csv')
const DEFAULT_SERVICE_CSV = path.join(__dirname, 'stage', 'Location_service_data.csv')
const DEFAULT_TEAM_CSV = path.join(__dirname, 'stage', 'Team_data_store_locator.csv')
const OUT_DIR = path.join(__dirname, 'out')

function parseArgs (argv) {
  const options = {
    locationCsv: DEFAULT_LOCATION_CSV,
    serviceCsv: DEFAULT_SERVICE_CSV,
    teamCsv: DEFAULT_TEAM_CSV,
    apply: false,
    limit: 0,
    preferSdk: false,
    skipCacheFlush: false,
    updateAll: false,
    migrateAssets: false,
    mediaBase: DEFAULT_LOCATION_MEDIA_BASE,
    progressEvery: DEFAULT_PROGRESS_EVERY,
    verbose: false,
    createMissing: false,
    importServices: false,
    importTeam: false,
    help: false
  }

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--apply') options.apply = true
    else if (arg === '--dry-run') options.apply = false
    else if (arg === '--csv-locations') options.locationCsv = argv[++i]
    else if (arg === '--csv-services') options.serviceCsv = argv[++i]
    else if (arg === '--csv-team') options.teamCsv = argv[++i]
    else if (arg === '--limit') options.limit = Number(argv[++i]) || 0
    else if (arg === '--use-db-sdk') options.preferSdk = true
    else if (arg === '--skip-cache-flush') options.skipCacheFlush = true
    else if (arg === '--update-all') options.updateAll = true
    else if (arg === '--migrate-assets') options.migrateAssets = true
    else if (arg === '--media-base') options.mediaBase = argv[++i]
    else if (arg === '--progress-every') options.progressEvery = Math.max(1, Number(argv[++i]) || DEFAULT_PROGRESS_EVERY)
    else if (arg === '--verbose') options.verbose = true
    else if (arg === '--create-missing') options.createMissing = true
    else if (arg === '--import-services') options.importServices = true
    else if (arg === '--import-team') options.importTeam = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function printHelp () {
  console.log(`Import store locations (and optional services) from legacy CSV exports.

Options:
  --csv-locations <path>   Location export (default: migration/data/stage/Location_data_1.csv)
  --csv-services <path>    Service export (default: migration/data/stage/Location_service_data.csv)
  --csv-team <path>        Team profile export (default: migration/data/stage/Team_data_store_locator.csv)
  --dry-run                Report only (default)
  --apply                  Write to App Builder Database
  --import-services        Upsert services from service CSV (preserves legacy numeric ids)
  --import-team            Upsert team profiles and link teamProfiles on locations (via location_ids)
  --create-missing         Insert locations not found in DB (uses legacy location_id)
  --update-all             Apply CSV mapping for every matched row (skip diff check)
  --migrate-assets         Download legacy Commerce media and upload via location-asset action
  --media-base <url>       Legacy media root (default: mcstaging aheadworks/store_locator)
  --use-db-sdk             Use @adobe/aio-lib-db (IMS from .env or aio workspace)
  --skip-cache-flush       Skip storefront location cache invalidation after apply
  --limit <n>              Cap pending location updates/inserts in apply mode
  --progress-every <n>     Log apply progress every n rows (default: 25)
  --verbose                Log each row as it is written
`)
}

function ensureOutDir () {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
}

function resolveLocationDoc ({ byId, byStoreUrl }, row) {
  const legacyId = Number(row.location_id)
  if (Number.isInteger(legacyId) && legacyId > 0 && byId.has(legacyId)) {
    return byId.get(legacyId)
  }
  const storeUrlKey = normalizeStoreUrl(row.store_url)
  if (storeUrlKey && byStoreUrl.has(storeUrlKey)) {
    return byStoreUrl.get(storeUrlKey)
  }
  return null
}

async function planServices ({
  options,
  params,
  serviceRows,
  assetUploader,
  assetCache
}) {
  const { byLegacyId } = await loadServices(params, { preferSdk: options.preferSdk })
  const plan = {
    csvRows: serviceRows.length,
    dbServices: byLegacyId.size,
    wouldUpsert: 0,
    noChanges: 0,
    noImportableFields: 0,
    assetJobs: 0,
    assetErrors: 0,
    upserts: [],
    samples: []
  }

  for (const row of serviceRows) {
    const legacyId = String(row.id || '').trim()
    if (!legacyId) continue

    const mapped = mapCsvRowToServiceFields(row, options.mediaBase)
    if (!hasImportableFields(mapped)) {
      plan.noImportableFields += 1
      continue
    }

    let serviceAssets = []
    if (options.migrateAssets) {
      const { assets, fieldUpdates } = await migrateServiceIconFromCsv({
        row,
        serviceId: legacyId,
        mediaBase: options.mediaBase,
        dryRun: !options.apply,
        assetUploader,
        cache: assetCache
      })
      serviceAssets = assets
      if (assets.length) {
        plan.assetJobs += assets.length
        plan.assetErrors += assets.filter(item => item.error).length
      }
      stripLegacyMediaUrls(mapped.fields)
      Object.assign(mapped.fields, fieldUpdates)
    }

    const existing = byLegacyId.get(Number(legacyId))
    const document = buildServiceDocument(legacyId, mapped.fields, existing)
    const hasChanges = !existing || JSON.stringify({
      title: existing.title,
      serviceUrl: existing.serviceUrl,
      icon: existing.icon,
      status: existing.status
    }) !== JSON.stringify({
      title: document.title,
      serviceUrl: document.serviceUrl,
      icon: document.icon,
      status: document.status
    })

    if (!hasChanges && !options.updateAll) {
      plan.noChanges += 1
      continue
    }

    plan.wouldUpsert += 1
    const entry = {
      legacyServiceId: legacyId,
      title: document.title,
      forced: options.updateAll && !hasChanges,
      skipped: mapped.skipped,
      assets: serviceAssets
    }
    plan.upserts.push({ existing, document })
    if (plan.samples.length < 5) plan.samples.push(entry)
  }

  return plan
}

async function planTeamProfiles ({
  options,
  params,
  teamRows,
  assetUploader,
  assetCache
}) {
  const { byLegacyId } = await loadTeamProfiles(params, { preferSdk: options.preferSdk })
  const plan = {
    csvRows: teamRows.length,
    dbProfiles: byLegacyId.size,
    wouldUpsert: 0,
    noChanges: 0,
    noImportableFields: 0,
    assetJobs: 0,
    assetErrors: 0,
    upserts: [],
    samples: []
  }

  for (const row of teamRows) {
    const legacyId = String(row.id || '').trim()
    if (!legacyId) continue

    const mapped = mapCsvRowToTeamFields(row, options.mediaBase)
    if (!hasImportableFields(mapped)) {
      plan.noImportableFields += 1
      continue
    }

    let teamAssets = []
    if (options.migrateAssets) {
      const { assets, fieldUpdates } = await migrateTeamImageFromCsv({
        row,
        profileId: legacyId,
        mediaBase: options.mediaBase,
        dryRun: !options.apply,
        assetUploader,
        cache: assetCache
      })
      teamAssets = assets
      if (assets.length) {
        plan.assetJobs += assets.length
        plan.assetErrors += assets.filter(item => item.error).length
      }
      stripLegacyMediaUrls(mapped.fields)
      Object.assign(mapped.fields, fieldUpdates)
    }

    const existing = byLegacyId.get(Number(legacyId))
    const document = buildTeamDocument(legacyId, mapped.fields, existing)
    const hasChanges = !existing || JSON.stringify({
      name: existing.name,
      jobTitle: existing.jobTitle,
      image: existing.image,
      status: existing.status,
      sortOrder: existing.sortOrder
    }) !== JSON.stringify({
      name: document.name,
      jobTitle: document.jobTitle,
      image: document.image,
      status: document.status,
      sortOrder: document.sortOrder
    })

    if (!hasChanges && !options.updateAll) {
      plan.noChanges += 1
      continue
    }

    plan.wouldUpsert += 1
    const entry = {
      legacyProfileId: legacyId,
      name: document.name,
      locationIds: String(row.location_ids || '').trim(),
      forced: options.updateAll && !hasChanges,
      skipped: mapped.skipped,
      assets: teamAssets
    }
    plan.upserts.push({ existing, document })
    if (plan.samples.length < 5) plan.samples.push(entry)
  }

  return plan
}

async function planLocations ({
  options,
  params,
  locationRows,
  assetUploader,
  assetCache,
  locationIndex,
  teamByLocation
}) {
  const plan = {
    csvRows: locationRows.length,
    dbLocations: locationIndex.byId.size,
    matched: 0,
    unmatched: [],
    noImportableFields: 0,
    noChanges: 0,
    wouldUpdate: 0,
    wouldCreate: 0,
    deferredFields: 0,
    assetJobs: 0,
    assetErrors: 0,
    updates: [],
    creates: [],
    samples: []
  }

  for (const row of locationRows) {
    const legacyId = String(row.location_id || '').trim()
    const title = String(row.title || '').trim()
    if (!legacyId || !title) continue

    const base = resolveLocationDoc(locationIndex, row)
    const mapped = mapCsvRowToLocationFields(row, { mediaBase: options.mediaBase })
    if (mapped.skipped.includes('store_gallery')) {
      plan.deferredFields += 1
    }

    if (teamByLocation) {
      const linked = teamByLocation.get(Number(legacyId))
      if (linked?.length) {
        mapped.fields.teamProfiles = linked
      }
    }

    const locationKey = normalizeStoreUrl(row.store_url) || legacyId

    if (options.migrateAssets) {
      const { assets, fieldUpdates } = await applyLocationAssetFieldsFromCsv({
        row,
        locationKey,
        mediaBase: options.mediaBase,
        dryRun: !options.apply,
        assetUploader,
        cache: assetCache
      })
      if (assets.length) {
        plan.assetJobs += assets.length
        plan.assetErrors += assets.filter(item => item.error).length
      }
      stripLegacyMediaUrls(mapped.fields)
      Object.assign(mapped.fields, fieldUpdates)
    }

    if (!hasImportableFields(mapped)) {
      plan.noImportableFields += 1
      continue
    }

    if (!base) {
      plan.unmatched.push({ legacyLocationId: legacyId, title, storeUrl: row.store_url })
      if (!options.createMissing) continue
      plan.wouldCreate += 1
      const entry = {
        legacyLocationId: legacyId,
        title,
        storeUrl: row.store_url,
        skipped: mapped.skipped,
        changes: mapped.fields
      }
      plan.creates.push({ legacyLocationId: legacyId, fields: mapped.fields })
      if (plan.samples.length < 5) plan.samples.push(entry)
      continue
    }

    plan.matched += 1
    const changes = locationFormDiff(base, mapped.fields)
    const hasChanges = Object.keys(changes).length > 0
    if (!hasChanges && !options.updateAll) {
      plan.noChanges += 1
      continue
    }

    plan.wouldUpdate += 1
    const entry = {
      legacyLocationId: legacyId,
      locationId: base.locationId,
      title,
      storeUrl: row.store_url,
      skipped: mapped.skipped,
      forced: options.updateAll && !hasChanges,
      changes: hasChanges ? changes : locationFormDiff(base, mapped.fields)
    }
    plan.updates.push({ base, fields: mapped.fields })
    if (plan.samples.length < 5) plan.samples.push(entry)
  }

  return plan
}

async function main () {
  const options = parseArgs(process.argv)
  if (options.help) {
    printHelp()
    return
  }

  if (!fs.existsSync(options.locationCsv)) {
    throw new Error(`Location CSV not found: ${options.locationCsv}`)
  }
  if (options.importServices && !fs.existsSync(options.serviceCsv)) {
    throw new Error(`Service CSV not found: ${options.serviceCsv}`)
  }
  if (options.importTeam && !fs.existsSync(options.teamCsv)) {
    throw new Error(`Team CSV not found: ${options.teamCsv}`)
  }

  const locationRows = readCsv(options.locationCsv)
  const serviceRows = options.importServices ? readCsv(options.serviceCsv) : []
  const teamRows = options.importTeam ? readCsv(options.teamCsv) : []
  const teamByLocation = options.importTeam ? buildTeamLinksByLocationId(teamRows) : null

  const params = loadRuntimeParams({ withIms: options.preferSdk })
  if (options.preferSdk && params.imsCredentialSource) {
    console.log(`IMS credentials: ${params.imsCredentialSource}`)
  }

  let assetUploader = null
  let assetUploadSource = ''
  if (options.migrateAssets && options.apply) {
    assetUploader = await initLocationAssetUploader()
    assetUploadSource = assetUploader.runtimeSource
    console.log(`Asset upload: ${assetUploadSource}`)
  }
  const assetCache = new Map()

  const locationIndex = await loadLocations(params, { preferSdk: options.preferSdk })

  let servicePlan = null
  if (options.importServices) {
    servicePlan = await planServices({
      options,
      params,
      serviceRows,
      assetUploader,
      assetCache
    })
  }

  let teamPlan = null
  if (options.importTeam) {
    teamPlan = await planTeamProfiles({
      options,
      params,
      teamRows,
      assetUploader,
      assetCache
    })
  }

  const locationPlan = await planLocations({
    options,
    params,
    locationRows,
    assetUploader,
    assetCache,
    locationIndex,
    teamByLocation
  })

  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    updateAll: options.updateAll,
    migrateAssets: options.migrateAssets,
    mediaBase: options.mediaBase,
    assetUploadSource: assetUploadSource || null,
    createMissing: options.createMissing,
    importServices: options.importServices,
    importTeam: options.importTeam,
    locationCsv: options.locationCsv,
    serviceCsv: options.importServices ? options.serviceCsv : null,
    teamCsv: options.importTeam ? options.teamCsv : null,
    teamLinksByLocation: teamByLocation
      ? Object.fromEntries([...teamByLocation.entries()].map(([key, value]) => [String(key), value]))
      : null,
    services: servicePlan,
    team: teamPlan,
    locations: locationPlan
  }

  ensureOutDir()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(OUT_DIR, `location-import-plan-${stamp}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  if (options.importServices && servicePlan) {
    console.log(`Services CSV: ${servicePlan.csvRows} | DB: ${servicePlan.dbServices} | Would upsert: ${servicePlan.wouldUpsert}`)
  }
  if (options.importTeam && teamPlan) {
    console.log(`Team CSV: ${teamPlan.csvRows} | DB: ${teamPlan.dbProfiles} | Would upsert: ${teamPlan.wouldUpsert}`)
    if (teamByLocation?.size) {
      console.log(`Team links: ${teamByLocation.size} location(s) with profile lists`)
    }
  }

  console.log(`Locations CSV: ${locationPlan.csvRows} | DB: ${locationPlan.dbLocations}`)
  console.log(`Matched: ${locationPlan.matched} | Would update: ${locationPlan.wouldUpdate} | Would create: ${locationPlan.wouldCreate}`)
  const unmatchedLabel = options.createMissing
    ? 'CSV-only rows'
    : 'Unmatched (pass --create-missing to insert)'
  console.log(`No changes: ${locationPlan.noChanges} | ${unmatchedLabel}: ${locationPlan.unmatched.length}`)
  if (locationPlan.deferredFields) {
    console.log(`Rows with store_gallery deferred (awaiting gallery CSV): ${locationPlan.deferredFields}`)
  }
  if (options.migrateAssets) {
    const jobs = (servicePlan?.assetJobs || 0) + (teamPlan?.assetJobs || 0) + locationPlan.assetJobs
    const errors = (servicePlan?.assetErrors || 0) + (teamPlan?.assetErrors || 0) + locationPlan.assetErrors
    console.log(`Assets: ${jobs} job(s)${errors ? `, ${errors} error(s)` : ''} (base: ${options.mediaBase})`)
  }
  console.log(`Report: ${reportPath}`)

  if (!options.apply) {
    console.log('\nDry run only. Re-run with --apply to write changes.')
    if (!options.createMissing && locationPlan.unmatched.length) {
      console.log('Tip: use --create-missing to insert locations that are only in CSV.')
    }
    if (!options.importServices) {
      console.log('Tip: use --import-services to migrate Location_service_data.csv first.')
    }
    if (!options.importTeam) {
      console.log('Tip: use --import-team to migrate Team_data_store_locator.csv and link profiles.')
    }
    return
  }

  const progressOptions = {
    preferSdk: options.preferSdk,
    progressEvery: options.progressEvery,
    verbose: options.verbose,
    onProgress: ({ done, total, item }) => {
      if (options.verbose && item?.document?.title) {
        console.log(`  ${done}/${total} — ${item.document.title}`)
        return
      }
      if (options.verbose && item?.document?.name) {
        console.log(`  ${done}/${total} — ${item.document.name}`)
        return
      }
      if (options.verbose && item?.base?.title) {
        console.log(`  ${done}/${total} — ${item.base.title}`)
        return
      }
      console.log(`  ${done}/${total} rows written`)
    }
  }

  if (options.importServices && servicePlan?.wouldUpsert) {
    let serviceUpserts = servicePlan.upserts
    if (options.limit > 0) serviceUpserts = serviceUpserts.slice(0, options.limit)
    console.log(`\nApplying ${serviceUpserts.length} service upsert(s)...`)
    await upsertServices(params, serviceUpserts, progressOptions)
    const maxServiceId = Math.max(
      ...serviceUpserts.map(item => Number(item.document.serviceId)).filter(Number.isFinite),
      1
    )
    await bumpServiceCounter(params, maxServiceId + 1, {
      preferSdk: options.preferSdk
    })
  }

  if (options.importTeam && teamPlan?.wouldUpsert) {
    let teamUpserts = teamPlan.upserts
    if (options.limit > 0) teamUpserts = teamUpserts.slice(0, options.limit)
    console.log(`\nApplying ${teamUpserts.length} team profile upsert(s)...`)
    await upsertTeamProfiles(params, teamUpserts, progressOptions)
    const maxProfileId = Math.max(
      ...teamUpserts.map(item => Number(item.document.profileId)).filter(Number.isFinite),
      1
    )
    await bumpTeamCounter(params, maxProfileId + 1, {
      preferSdk: options.preferSdk
    })
  }

  let updates = locationPlan.updates
  let creates = locationPlan.creates
  if (options.limit > 0) {
    updates = updates.slice(0, options.limit)
    const remaining = Math.max(0, options.limit - updates.length)
    creates = creates.slice(0, remaining)
  }

  if (updates.length) {
    console.log(`\nApplying ${updates.length} location update(s)...`)
    await applyLocationPatches(params, updates, progressOptions)
  }

  if (creates.length) {
    console.log(`\nInserting ${creates.length} location(s)...`)
    const documents = creates.map(item =>
      buildNewLocationDocument(item.legacyLocationId, item.fields)
    )
    await insertLocations(params, documents, progressOptions)
    const maxLocationId = Math.max(
      ...documents.map(doc => Number(doc.locationId)).filter(Number.isFinite),
      1
    )
    await bumpLocationCounter(params, maxLocationId + 1, {
      preferSdk: options.preferSdk
    })
  }

  if (!options.skipCacheFlush) {
    try {
      const cache = await createLocationCache(params)
      await cache.invalidateDirectory()
      console.log('\nStorefront location cache invalidated.')
    } catch (error) {
      console.warn(`\nCould not flush location cache (${error.message}).`)
    }
  }

  console.log('\nLocation import apply finished.')
}

main().catch(error => {
  console.error(error.message || error)
  process.exit(1)
})
