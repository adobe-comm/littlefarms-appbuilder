const { openBrandDb, sanitizeFields } = require('../../../actions/brand/lib/brand-store')
const { normalizeName } = require('../../../actions/brand/lib/slug')
const { ALL_STORE_VIEWS, USE_DEFAULT_FIELDS } = require('../../../actions/brand/lib/constants')
const { loadBaseBrandsViaCli, aioUpdateDocument } = require('./aio-db-cli')

const READ_BATCH = 100
const WRITE_BATCH = 40
const DEFAULT_PROGRESS_EVERY = 100

function indexByName (docs) {
  const byName = new Map()
  for (const doc of docs) {
    byName.set(normalizeName(doc.optionLabel), doc)
  }
  return byName
}

function chunks (items, size) {
  const groups = []
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size))
  }
  return groups
}

async function loadBaseBrandsViaSdk (params, attributeCode) {
  const opened = await openBrandDb(params)
  try {
    const { brands } = opened
    const filter = {
      attributeCode,
      storeViewCode: ALL_STORE_VIEWS,
      hidden: false,
      optionRemoved: false
    }
    const docs = []
    let skip = 0
    for (;;) {
      const batch = await brands.find(filter).skip(skip).limit(READ_BATCH).toArray()
      docs.push(...batch)
      if (batch.length < READ_BATCH) break
      skip += batch.length
    }
    return { docs, byName: indexByName(docs) }
  } finally {
    await opened.client.close()
  }
}

async function loadBaseBrands (params, attributeCode, { preferSdk = false } = {}) {
  if (preferSdk) {
    try {
      return await loadBaseBrandsViaSdk(params, attributeCode)
    } catch (error) {
      console.warn(`SDK DB read failed (${error.message}). Falling back to aio CLI.`)
    }
  }

  const docs = await loadBaseBrandsViaCli(attributeCode)
  return { docs, byName: indexByName(docs) }
}

function mergePatch (base, rawFields) {
  const patch = sanitizeFields(rawFields)
  for (const field of USE_DEFAULT_FIELDS) {
    const flag = `${field}_use_default`
    if (rawFields[flag] === false) patch[flag] = false
    if (rawFields[flag] === true) patch[flag] = true
  }
  const next = { ...base, ...patch, updatedAt: new Date().toISOString() }
  if (next.meta_title_use_default !== false) next.meta_title = next.optionLabel || ''
  if (next.page_title_use_default !== false) next.page_title = next.optionLabel || ''
  return next
}

/** Fields to $set — never includes Mongo `_id`. */
function patchToSet (base, rawFields) {
  const next = mergePatch(base, rawFields)
  const set = { updatedAt: next.updatedAt }
  for (const [key, value] of Object.entries(next)) {
    if (key === '_id' || key === 'id') continue
    if (JSON.stringify(value) !== JSON.stringify(base[key])) set[key] = value
  }
  return set
}

function shouldReportProgress (done, total, progressEvery, verbose) {
  if (verbose) return true
  return done === total || done % progressEvery === 0
}

function reportProgress (onProgress, done, total, item, verbose, progressEvery) {
  if (!onProgress || !shouldReportProgress(done, total, progressEvery, verbose)) return
  onProgress({ done, total, item: verbose ? item : undefined })
}

async function applyBrandPatchesViaSdk (params, patches, {
  onProgress,
  progressEvery = DEFAULT_PROGRESS_EVERY,
  verbose = false
} = {}) {
  const opened = await openBrandDb(params)
  try {
    const { brands } = opened
    let updated = 0
    const total = patches.length
    for (const group of chunks(patches, WRITE_BATCH)) {
      await brands.bulkWrite(group.map(item => ({
        updateOne: {
          filter: { id: item.base.id },
          update: { $set: patchToSet(item.base, item.fields) }
        }
      })), { ordered: false })
      updated += group.length
      reportProgress(onProgress, updated, total, group[group.length - 1], verbose, progressEvery)
    }
    return updated
  } finally {
    await opened.client.close()
  }
}

function applyBrandPatchesViaCli (patches, { onProgress, progressEvery = DEFAULT_PROGRESS_EVERY, verbose = false } = {}) {
  let updated = 0
  const total = patches.length
  for (const item of patches) {
    const set = patchToSet(item.base, item.fields)
    aioUpdateDocument('littlefarms_brands', { id: item.base.id }, set)
    updated += 1
    reportProgress(onProgress, updated, total, item, verbose, progressEvery)
  }
  return updated
}

async function applyBrandPatches (params, patches, {
  preferSdk = false,
  onProgress,
  progressEvery = DEFAULT_PROGRESS_EVERY,
  verbose = false
} = {}) {
  const options = { onProgress, progressEvery, verbose }
  if (preferSdk) {
    try {
      return await applyBrandPatchesViaSdk(params, patches, options)
    } catch (error) {
      console.warn(`SDK DB write failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  return applyBrandPatchesViaCli(patches, options)
}

module.exports = {
  loadBaseBrands,
  applyBrandPatches,
  mergePatch,
  patchToSet,
  WRITE_BATCH,
  DEFAULT_PROGRESS_EVERY
}
