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
  mapCsvRowToTagFields,
  mapCsvRowToPostFields,
  buildCategoryTitleIndex,
  buildTagTitleIndex,
  buildTagLegacyIdSet,
  buildPostTagsFromTagExport,
  mergeTaxonomyIdLists,
  resolvePostCategoryIds,
  resolvePostTagIds,
  hasImportableFields
} = require('./lib/map-blog-csv-row')
const {
  assignUniqueTagUrlKey,
  collectTakenTagUrlKeys,
  findTaxonomyByLegacyOrUrlKey,
  loadCategories,
  loadTags,
  loadPosts,
  upsertCategories,
  upsertTags,
  upsertPosts,
  bumpCategoryCounter,
  bumpTagCounter,
  bumpPostCounter,
  buildCategoryDocument,
  buildTagDocument,
  buildPostDocument,
  categoryComparable,
  tagComparable,
  postComparable,
  DEFAULT_PROGRESS_EVERY
} = require('./lib/blog-db')

const DEFAULT_CATEGORY_CSV = path.join(__dirname, 'stage', 'Blog_category.csv')
const DEFAULT_TAG_CSV = path.join(__dirname, 'stage', 'Blog_post_tag.csv')
const DEFAULT_POST_CSV = path.join(__dirname, 'stage', 'Blog.csv')
const OUT_DIR = path.join(__dirname, 'out')

function parseArgs (argv) {
  const options = {
    categoryCsv: DEFAULT_CATEGORY_CSV,
    tagCsv: DEFAULT_TAG_CSV,
    postCsv: DEFAULT_POST_CSV,
    apply: false,
    limit: 0,
    preferSdk: false,
    updateAll: false,
    mediaBase: DEFAULT_BLOG_MEDIA_BASE,
    progressEvery: DEFAULT_PROGRESS_EVERY,
    verbose: false,
    importCategories: false,
    importTags: false,
    importPosts: false,
    categoryCsvText: '',
    tagCsvText: '',
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
    else if (arg === '--csv-tags') options.tagCsv = argv[++i]
    else if (arg === '--csv-posts') options.postCsv = argv[++i]
    else if (arg === '--limit') options.limit = Number(argv[++i]) || 0
    else if (arg === '--use-db-sdk') options.preferSdk = true
    else if (arg === '--update-all') options.updateAll = true
    else if (arg === '--media-base') options.mediaBase = argv[++i]
    else if (arg === '--progress-every') options.progressEvery = Math.max(1, Number(argv[++i]) || DEFAULT_PROGRESS_EVERY)
    else if (arg === '--verbose') options.verbose = true
    else if (arg === '--import-categories') options.importCategories = true
    else if (arg === '--import-tags') options.importTags = true
    else if (arg === '--import-posts') options.importPosts = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function printHelp () {
  console.log(`Import blog categories, tags, and posts from legacy CSV exports.

Options:
  --csv-categories <path>  Category export (default: migration/data/stage/Blog_category.csv)
  --csv-tags <path>        Tag export (default: migration/data/stage/Blog_post_tag.csv)
  --csv-posts <path>       Post export (default: migration/data/stage/Blog.csv)
  --import-categories      Upsert categories (legacy CSV id → taxonomyId)
  --import-tags            Upsert tags; post_ids column links posts to tag_ids
  --import-posts           Upsert posts (legacy CSV id → postId)
  --dry-run                Report only (default)
  --apply                  Write to App Builder Database
  --update-all             Apply CSV mapping for every row (skip diff check)
  --media-base <url>       Legacy Commerce media root for relative image paths
  --use-db-sdk             Use @adobe/aio-lib-db (IMS from .env or aio workspace)
  --limit <n>              Cap pending upserts in apply mode
  --progress-every <n>     Log apply progress every n rows (default: 25)
  --verbose                Log each row as it is written

Post tag_ids come from Blog_post_tag.csv post_ids and/or Blog.csv tag_names.
`)
}

function ensureOutDir () {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
}

async function planCategories ({ options, params, categoryRows }) {
  const categoryIndex = await loadCategories(params, { preferSdk: options.preferSdk })
  const { byLegacyId, byUrlKey } = categoryIndex
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
    let existing
    try {
      existing = findTaxonomyByLegacyOrUrlKey(
        { byLegacyId, byUrlKey },
        legacyId,
        mapped.fields.url_key
      )
      document = buildCategoryDocument(legacyId, mapped.fields, existing)
    } catch (error) {
      plan.noImportableFields += 1
      if (plan.samples.length < 5) {
        plan.samples.push({ legacyCategoryId: legacyId, error: error.message })
      }
      continue
    }

    existing = findTaxonomyByLegacyOrUrlKey(
      { byLegacyId, byUrlKey },
      legacyId,
      document.url_key
    )
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

async function planTags ({ options, params, tagRows }) {
  const tagIndex = await loadTags(params, { preferSdk: options.preferSdk })
  const { byLegacyId, byUrlKey, docs: tagDocs } = tagIndex
  const takenTagUrlKeys = collectTakenTagUrlKeys(tagDocs)
  const plan = {
    csvRows: tagRows.length,
    dbTags: byLegacyId.size,
    wouldUpsert: 0,
    noChanges: 0,
    noImportableFields: 0,
    upserts: [],
    samples: []
  }

  for (const row of tagRows) {
    const legacyId = String(row.id || '').trim()
    if (!legacyId) continue

    const mapped = mapCsvRowToTagFields(row)
    if (!hasImportableFields(mapped)) {
      plan.noImportableFields += 1
      continue
    }

    let document
    let existing
    try {
      existing = findTaxonomyByLegacyOrUrlKey(
        { byLegacyId, byUrlKey },
        legacyId,
        mapped.fields.url_key
      )
      document = buildTagDocument(legacyId, mapped.fields, existing)
      document = assignUniqueTagUrlKey(document, takenTagUrlKeys)
    } catch (error) {
      plan.noImportableFields += 1
      if (plan.samples.length < 5) {
        plan.samples.push({ legacyTagId: legacyId, error: error.message })
      }
      continue
    }

    existing = findTaxonomyByLegacyOrUrlKey(
      { byLegacyId, byUrlKey },
      legacyId,
      document.url_key
    )
    const hasChanges = !existing || tagComparable(existing) !== tagComparable(document)
    if (!hasChanges && !options.updateAll) {
      plan.noChanges += 1
      continue
    }

    plan.wouldUpsert += 1
    plan.upserts.push({ existing, document })
    if (plan.samples.length < 5) {
      plan.samples.push({
        legacyTagId: legacyId,
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
  tagRows,
  categoryIndex,
  tagIndex,
  postTagsByPostId
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
    unresolvedTags: 0,
    upserts: [],
    samples: []
  }

  const csvTagTitleIndex = buildTagTitleIndex(tagRows)
  const csvTagLegacyIds = buildTagLegacyIdSet(tagRows)

  for (const row of postRows) {
    const legacyId = String(row.id || '').trim()
    if (!legacyId) continue

    const mapped = mapCsvRowToPostFields(row, options.mediaBase)
    if (!hasImportableFields(mapped)) {
      plan.noImportableFields += 1
      continue
    }

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

    const tagIdsFromNames = resolvePostTagIds({
      tagNames: mapped.tagNames,
      byLegacyId: tagIndex.byLegacyId,
      csvTitleIndex: csvTagTitleIndex,
      csvLegacyIds: csvTagLegacyIds
    })
    const tagIdsFromExport = postTagsByPostId.get(legacyId) || []
    const tagIds = mergeTaxonomyIdLists(tagIdsFromNames, tagIdsFromExport)
    if (mapped.tagNames.length && !tagIdsFromNames.length) {
      plan.unresolvedTags += 1
    }
    mapped.fields.tag_ids = tagIds

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
        tagIds,
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

  if (!options.importCategories && !options.importTags && !options.importPosts) {
    throw new Error('Enable categories, tags, and/or posts for blog import.')
  }

  const categoryRows = options.importCategories
    ? loadCsvSource(options, {
      pathKey: 'categoryCsv',
      textKey: 'categoryCsvText',
      label: 'Category',
      required: true
    })
    : []
  const tagRows = options.importTags
    ? loadCsvSource(options, {
      pathKey: 'tagCsv',
      textKey: 'tagCsvText',
      label: 'Tag',
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
  const postTagRows = options.importPosts
    ? loadCsvSource(options, {
      pathKey: 'tagCsv',
      textKey: 'tagCsvText',
      label: 'Tag',
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
  if (options.importPosts && !postTagRows.length && !options.importTags) {
    console.warn('Warning: tag CSV missing; tag name / post_ids resolution uses DB tags only.')
  }

  if (!params) {
    params = loadRuntimeParams({ withIms: options.preferSdk })
  }
  if (options.preferSdk && params.imsCredentialSource) {
    console.log(`IMS credentials: ${params.imsCredentialSource}`)
  }

  let categoryPlan = null
  if (options.importCategories) {
    categoryPlan = await planCategories({ options, params, categoryRows })
  }

  let tagPlan = null
  if (options.importTags) {
    tagPlan = await planTags({ options, params, tagRows })
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

  // Write categories before planning posts so category_ids resolve against DB when both run together.
  if (options.apply && options.importCategories && categoryPlan?.wouldUpsert) {
    onPhase('categories', { done: 0, total: categoryPlan.wouldUpsert, label: 'Categories' })
    let upserts = categoryPlan.upserts
    if (options.limit > 0) upserts = upserts.slice(0, options.limit)
    console.log(`\nApplying ${upserts.length} category upsert(s) before posts...`)
    await upsertCategories(params, upserts, progressOptions)
    const maxId = Math.max(
      ...upserts.map(item => Number(item.document.taxonomyId)).filter(Number.isFinite),
      1
    )
    await bumpCategoryCounter(params, maxId + 1, { preferSdk: options.preferSdk })
  }

  if (options.apply && options.importTags && tagPlan?.wouldUpsert) {
    onPhase('tags', { done: 0, total: tagPlan.wouldUpsert, label: 'Tags' })
    let upserts = tagPlan.upserts
    if (options.limit > 0) upserts = upserts.slice(0, options.limit)
    console.log(`\nApplying ${upserts.length} tag upsert(s) before posts...`)
    await upsertTags(params, upserts, progressOptions)
    const maxId = Math.max(
      ...upserts.map(item => Number(item.document.taxonomyId)).filter(Number.isFinite),
      1
    )
    await bumpTagCounter(params, maxId + 1, { preferSdk: options.preferSdk })
  }

  let categoryIndex = { byLegacyId: new Map(), byUrlKey: new Map() }
  if (options.importPosts || options.importCategories) {
    categoryIndex = await loadCategories(params, { preferSdk: options.preferSdk })
  }

  let tagIndex = { byLegacyId: new Map(), byUrlKey: new Map() }
  if (options.importPosts || options.importTags) {
    tagIndex = await loadTags(params, { preferSdk: options.preferSdk })
  }

  const tagRowsForPosts = postTagRows.length ? postTagRows : (tagRows.length ? tagRows : [])
  const postTagsByPostId = buildPostTagsFromTagExport(tagRowsForPosts)

  let postPlan = null
  if (options.importPosts) {
    postPlan = await planPosts({
      options,
      params,
      postRows,
      categoryRows: postCategoryRows.length ? postCategoryRows : (categoryRows.length ? categoryRows : []),
      tagRows: tagRowsForPosts,
      categoryIndex,
      tagIndex,
      postTagsByPostId
    })
  }

  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    updateAll: options.updateAll,
    mediaBase: options.mediaBase,
    importCategories: options.importCategories,
    importTags: options.importTags,
    importPosts: options.importPosts,
    categoryCsv: options.importCategories ? options.categoryCsv : null,
    tagCsv: options.importTags ? options.tagCsv : null,
    postCsv: options.importPosts ? options.postCsv : null,
    categories: categoryPlan,
    tags: tagPlan,
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
  if (tagPlan) {
    console.log(`Tags CSV: ${tagPlan.csvRows} | DB: ${tagPlan.dbTags} | Would upsert: ${tagPlan.wouldUpsert}`)
  }
  if (postPlan) {
    console.log(`Posts CSV: ${postPlan.csvRows} | DB: ${postPlan.dbPosts} | Would upsert: ${postPlan.wouldUpsert}`)
    if (postPlan.unresolvedCategories) {
      console.log(`Posts with category_names not resolved: ${postPlan.unresolvedCategories}`)
    }
    if (postPlan.unresolvedTags) {
      console.log(`Posts with tag_names not resolved: ${postPlan.unresolvedTags}`)
    }
  }
  if (reportPath) console.log(`Report: ${reportPath}`)

  const summary = {
    mode: report.mode,
    categories: categoryPlan
      ? { wouldUpsert: categoryPlan.wouldUpsert, csvRows: categoryPlan.csvRows }
      : null,
    tags: tagPlan
      ? { wouldUpsert: tagPlan.wouldUpsert, csvRows: tagPlan.csvRows }
      : null,
    posts: postPlan
      ? {
        wouldUpsert: postPlan.wouldUpsert,
        csvRows: postPlan.csvRows,
        unresolvedCategories: postPlan.unresolvedCategories || 0,
        unresolvedTags: postPlan.unresolvedTags || 0
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
    tags: options.importTags ? tagPlan?.wouldUpsert || 0 : 0,
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
  if (!options.importCategories && !options.importTags && !options.importPosts) {
    throw new Error('Pass --import-categories, --import-tags, and/or --import-posts.')
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
