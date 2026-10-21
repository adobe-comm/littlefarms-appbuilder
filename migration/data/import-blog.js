#!/usr/bin/env node
/**
 * Import legacy Aheadworks Blog CSV exports into App Builder blog collections.
 *
 * Usage (repo root, workspace selected via `aio where`):
 *   node migration/data/import-blog.js --import-categories --import-posts
 *   node migration/data/import-blog.js --apply --import-categories --import-posts
 */

const fs = require('fs')
const path = require('path')

const { readCsv, parseCsv } = require('./lib/parse-csv')
const { loadRuntimeParams } = require('./lib/load-params')
const { DEFAULT_BLOG_MEDIA_BASE } = require('./lib/legacy-media-urls')
const {
  mapCsvRowToCategoryFields,
  mapCsvRowToPostFields,
  buildCategoryTitleIndex,
  resolvePostCategoryIds,
  hasImportableFields
} = require('./lib/map-blog-csv-row')
const {
  loadCategories,
  loadPosts,
  upsertCategories,
  upsertPosts,
  bumpCategoryCounter,
  bumpPostCounter,
  buildCategoryDocument,
  buildPostDocument,
  categoryComparable,
  postComparable,
  DEFAULT_PROGRESS_EVERY
} = require('./lib/blog-db')

const DEFAULT_CATEGORY_CSV = path.join(__dirname, 'stage', 'Blog_category.csv')
const DEFAULT_POST_CSV = path.join(__dirname, 'stage', 'Blog.csv')
const OUT_DIR = path.join(__dirname, 'out')

function parseArgs (argv) {
  const options = {
    categoryCsv: DEFAULT_CATEGORY_CSV,
    postCsv: DEFAULT_POST_CSV,
    apply: false,
    limit: 0,
    preferSdk: false,
    updateAll: false,
    mediaBase: DEFAULT_BLOG_MEDIA_BASE,
    progressEvery: DEFAULT_PROGRESS_EVERY,
    verbose: false,
    importCategories: false,
    importPosts: false,
    categoryCsvText: '',
    postCsvText: '',
    skipReportFile: false,
    help: false
  }

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--apply') options.apply = true
    else if (arg === '--dry-run') options.apply = false
    else if (arg === '--csv-categories') options.categoryCsv = argv[++i]
    else if (arg === '--csv-posts') options.postCsv = argv[++i]
    else if (arg === '--limit') options.limit = Number(argv[++i]) || 0
    else if (arg === '--use-db-sdk') options.preferSdk = true
    else if (arg === '--update-all') options.updateAll = true
    else if (arg === '--media-base') options.mediaBase = argv[++i]
    else if (arg === '--progress-every') options.progressEvery = Math.max(1, Number(argv[++i]) || DEFAULT_PROGRESS_EVERY)
    else if (arg === '--verbose') options.verbose = true
    else if (arg === '--import-categories') options.importCategories = true
    else if (arg === '--import-posts') options.importPosts = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function printHelp () {
  console.log(`Import blog categories and posts from legacy CSV exports.

Options:
  --csv-categories <path>  Category export (default: migration/data/stage/Blog_category.csv)
  --csv-posts <path>       Post export (default: migration/data/stage/Blog.csv)
  --import-categories      Upsert categories (legacy CSV id → taxonomyId)
  --import-posts           Upsert posts (legacy CSV id → postId); run categories first
  --dry-run                Report only (default)
  --apply                  Write to App Builder Database
  --update-all             Apply CSV mapping for every row (skip diff check)
  --media-base <url>       Legacy Commerce media root for relative image paths
  --use-db-sdk             Use @adobe/aio-lib-db (IMS from .env or aio workspace)
  --limit <n>              Cap pending upserts in apply mode
  --progress-every <n>     Log apply progress every n rows (default: 25)
  --verbose                Log each row as it is written

Tags: post CSV tag_names are reported as deferred until a tag CSV import is added.
`)
}

function ensureOutDir () {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
}

async function planCategories ({ options, params, categoryRows }) {
  const { byLegacyId } = await loadCategories(params, { preferSdk: options.preferSdk })
  const plan = {
    csvRows: categoryRows.length,
    dbCategories: byLegacyId.size,
    wouldUpsert: 0,
    noChanges: 0,
    noImportableFields: 0,
    upserts: [],
    samples: []
  }

  for (const row of categoryRows) {
    const legacyId = String(row.id || '').trim()
    if (!legacyId) continue

    const mapped = mapCsvRowToCategoryFields(row, options.mediaBase)
    if (!hasImportableFields(mapped)) {
      plan.noImportableFields += 1
      continue
    }

    let document
    try {
      const existing = byLegacyId.get(Number(legacyId))
      document = buildCategoryDocument(legacyId, mapped.fields, existing)
    } catch (error) {
      plan.noImportableFields += 1
      if (plan.samples.length < 5) {
        plan.samples.push({ legacyCategoryId: legacyId, error: error.message })
      }
      continue
    }

    const existing = byLegacyId.get(Number(legacyId))
    const hasChanges = !existing || categoryComparable(existing) !== categoryComparable(document)
    if (!hasChanges && !options.updateAll) {
      plan.noChanges += 1
      continue
    }

    plan.wouldUpsert += 1
    plan.upserts.push({ existing, document })
    if (plan.samples.length < 5) {
      plan.samples.push({
        legacyCategoryId: legacyId,
        title: document.title,
        forced: options.updateAll && !hasChanges
      })
    }
  }

  return plan
}

async function planPosts ({
  options,
  params,
  postRows,
  categoryRows,
  categoryIndex
}) {
  const { byLegacyId } = await loadPosts(params, { preferSdk: options.preferSdk })
  const csvTitleIndex = buildCategoryTitleIndex(categoryRows)
  const plan = {
    csvRows: postRows.length,
    dbPosts: byLegacyId.size,
    wouldUpsert: 0,
    noChanges: 0,
    noImportableFields: 0,
    unresolvedCategories: 0,
    deferredTags: 0,
    upserts: [],
    samples: []
  }

  for (const row of postRows) {
    const legacyId = String(row.id || '').trim()
    if (!legacyId) continue

    const mapped = mapCsvRowToPostFields(row, options.mediaBase)
    if (!hasImportableFields(mapped)) {
      plan.noImportableFields += 1
      continue
    }

    if (mapped.tagNames.length) plan.deferredTags += 1

    const categoryIds = resolvePostCategoryIds({
      categoryNames: mapped.categoryNames,
      canonicalCategoryId: mapped.canonicalCategoryId,
      byLegacyId: categoryIndex.byLegacyId,
      csvTitleIndex
    })
    if (mapped.categoryNames.length && !categoryIds.length) {
      plan.unresolvedCategories += 1
    }
    mapped.fields.category_ids = categoryIds
    mapped.fields.tag_ids = []

    let document
    try {
      const existing = byLegacyId.get(Number(legacyId))
      document = buildPostDocument(legacyId, mapped.fields, existing)
    } catch (error) {
      plan.noImportableFields += 1
      if (plan.samples.length < 5) {
        plan.samples.push({ legacyPostId: legacyId, error: error.message })
      }
      continue
    }

    const existing = byLegacyId.get(Number(legacyId))
    const hasChanges = !existing || postComparable(existing) !== postComparable(document)
    if (!hasChanges && !options.updateAll) {
      plan.noChanges += 1
      continue
    }

    plan.wouldUpsert += 1
    plan.upserts.push({ existing, document })
    if (plan.samples.length < 5) {
      plan.samples.push({
        legacyPostId: legacyId,
        title: document.title,
        categoryIds,
        tagNames: mapped.tagNames,
        forced: options.updateAll && !hasChanges
      })
    }
  }

  return plan
}

function loadCsvSource (options, { pathKey, textKey, label, required }) {
  const text = String(options[textKey] || '').trim()
  if (text) return parseCsv(text)
  const filePath = options[pathKey]
  if (filePath && fs.existsSync(filePath)) return readCsv(filePath)
  if (required) {
    throw new Error(`${label} CSV not found${filePath ? `: ${filePath}` : ''}.`)
  }
  return []
}

async function runBlogImport (params, options, hooks = {}) {
  const onPhase = typeof hooks.onPhase === 'function' ? hooks.onPhase : () => {}

  if (!options.importCategories && !options.importPosts) {
    throw new Error('Enable categories and/or posts for blog import.')
  }

  const categoryRows = options.importCategories
    ? loadCsvSource(options, {
      pathKey: 'categoryCsv',
      textKey: 'categoryCsvText',
      label: 'Category',
      required: true
    })
    : []
  const postCategoryRows = options.importPosts
    ? loadCsvSource(options, {
      pathKey: 'categoryCsv',
      textKey: 'categoryCsvText',
      label: 'Category',
      required: false
    })
    : []
  const postRows = options.importPosts
    ? loadCsvSource(options, {
      pathKey: 'postCsv',
      textKey: 'postCsvText',
      label: 'Post',
      required: true
    })
    : []

  if (options.importPosts && !postCategoryRows.length && !options.importCategories) {
    console.warn('Warning: category CSV missing; category name resolution uses DB categories only.')
  }

  if (!params) {
    params = loadRuntimeParams({ withIms: options.preferSdk })
  }
  if (options.preferSdk && params.imsCredentialSource) {
    console.log(`IMS credentials: ${params.imsCredentialSource}`)
  }

  let categoryPlan = null
  let categoryIndex = { byLegacyId: new Map() }
  if (options.importCategories) {
    categoryPlan = await planCategories({ options, params, categoryRows })
    categoryIndex = await loadCategories(params, { preferSdk: options.preferSdk })
  } else if (options.importPosts) {
    categoryIndex = await loadCategories(params, { preferSdk: options.preferSdk })
  }

  let postPlan = null
  if (options.importPosts) {
    postPlan = await planPosts({
      options,
      params,
      postRows,
      categoryRows: postCategoryRows.length ? postCategoryRows : (categoryRows.length ? categoryRows : []),
      categoryIndex
    })
  }

  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    updateAll: options.updateAll,
    mediaBase: options.mediaBase,
    importCategories: options.importCategories,
    importPosts: options.importPosts,
    categoryCsv: options.importCategories ? options.categoryCsv : null,
    postCsv: options.importPosts ? options.postCsv : null,
    categories: categoryPlan,
    posts: postPlan
  }

  let reportPath = null
  if (!options.skipReportFile) {
    ensureOutDir()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    reportPath = path.join(OUT_DIR, `blog-import-plan-${stamp}.json`)
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  }

  if (categoryPlan) {
    console.log(`Categories CSV: ${categoryPlan.csvRows} | DB: ${categoryPlan.dbCategories} | Would upsert: ${categoryPlan.wouldUpsert}`)
  }
  if (postPlan) {
    console.log(`Posts CSV: ${postPlan.csvRows} | DB: ${postPlan.dbPosts} | Would upsert: ${postPlan.wouldUpsert}`)
    if (postPlan.unresolvedCategories) {
      console.log(`Posts with category_names not resolved (import categories first): ${postPlan.unresolvedCategories}`)
    }
    if (postPlan.deferredTags) {
      console.log(`Posts with tag_names deferred (tag CSV import not wired yet): ${postPlan.deferredTags}`)
    }
  }
  if (reportPath) console.log(`Report: ${reportPath}`)

  const summary = {
    mode: report.mode,
    categories: categoryPlan
      ? { wouldUpsert: categoryPlan.wouldUpsert, csvRows: categoryPlan.csvRows }
      : null,
    posts: postPlan
      ? {
        wouldUpsert: postPlan.wouldUpsert,
        csvRows: postPlan.csvRows,
        unresolvedCategories: postPlan.unresolvedCategories || 0,
        deferredTags: postPlan.deferredTags || 0
      }
      : null,
    reportPath
  }

  if (!options.apply) {
    console.log('\nDry run only. Re-run with --apply to write changes.')
    if (options.importPosts && !options.importCategories) {
      console.log('Tip: run --import-categories before or with --import-posts so category_names resolve.')
    }
    return summary
  }

  const progressOptions = {
    preferSdk: options.preferSdk,
    progressEvery: options.progressEvery,
    verbose: options.verbose,
    onProgress: ({ done, total, item }) => {
      onPhase('apply', {
        done,
        total,
        label: item?.document?.title || 'Writing rows'
      })
      if (options.verbose && item?.document?.title) {
        console.log(`  ${done}/${total} — ${item.document.title}`)
        return
      }
      console.log(`  ${done}/${total} rows written`)
    }
  }

  if (options.importCategories && categoryPlan?.wouldUpsert) {
    onPhase('categories', { done: 0, total: categoryPlan.wouldUpsert, label: 'Categories' })
    let upserts = categoryPlan.upserts
    if (options.limit > 0) upserts = upserts.slice(0, options.limit)
    console.log(`\nApplying ${upserts.length} category upsert(s)...`)
    await upsertCategories(params, upserts, progressOptions)
    const maxId = Math.max(
      ...upserts.map(item => Number(item.document.taxonomyId)).filter(Number.isFinite),
      1
    )
    await bumpCategoryCounter(params, maxId + 1, { preferSdk: options.preferSdk })
  }

  if (options.importPosts && postPlan?.wouldUpsert) {
    onPhase('posts', { done: 0, total: postPlan.wouldUpsert, label: 'Posts' })
    let upserts = postPlan.upserts
    if (options.limit > 0) upserts = upserts.slice(0, options.limit)
    console.log(`\nApplying ${upserts.length} post upsert(s)...`)
    await upsertPosts(params, upserts, progressOptions)
    const maxId = Math.max(
      ...upserts.map(item => Number(item.document.postId)).filter(Number.isFinite),
      1
    )
    await bumpPostCounter(params, maxId + 1, { preferSdk: options.preferSdk })
  }

  summary.applied = {
    categories: options.importCategories ? categoryPlan?.wouldUpsert || 0 : 0,
    posts: options.importPosts ? postPlan?.wouldUpsert || 0 : 0
  }
  return summary
}

async function main () {
  const options = parseArgs(process.argv)
  if (options.help) {
    printHelp()
    return
  }
  if (!options.importCategories && !options.importPosts) {
    throw new Error('Pass --import-categories and/or --import-posts.')
  }
  await runBlogImport(undefined, options)
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message || error)
    process.exit(1)
  })
}

module.exports = {
  runBlogImport
}
