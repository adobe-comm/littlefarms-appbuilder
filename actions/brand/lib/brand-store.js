const { Core } = require('@adobe/aio-sdk')
const libDb = require('@adobe/aio-lib-db')

const { ATTRIBUTE_CODE } = require('../../block/lib/constants')
const { resolveEnvironmentId } = require('../../block/lib/app-scope')
const {
  BRANDS_COLLECTION,
  BRAND_SETTINGS_COLLECTION,
  ALL_STORE_VIEWS,
  PAGE_SIZE,
  MAX_PAGE_SIZE,
  BOOLEAN_FIELDS,
  TEXT_FIELDS,
  USE_DEFAULT_FIELDS,
  FIELD_DEFAULTS
} = require('./constants')
const { slugify, uniqueSlug, normalizeName } = require('./slug')
const { createBrandCache } = require('./brand-cache')

const SLIM_FIELDS = [
  'optionValue',
  'optionLabel',
  'attributeCode',
  'url_alias',
  'is_active',
  'is_new_brand',
  'is_top_brand',
  'is_featured',
  'show_in_brand_list_widget',
  'show_in_brand_slider_widget',
  'slider_position',
  'small_image',
  'small_image_alt',
  'hidden',
  'optionRemoved',
  'storeViewCode'
]

const PAGE_FIELDS = [
  ...SLIM_FIELDS,
  'meta_title',
  'meta_title_use_default',
  'meta_description',
  'meta_keywords',
  'page_title',
  'page_title_use_default',
  'description',
  'short_description',
  'image',
  'image_alt'
]

function httpError (statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function isMissing (error) {
  return error?.httpStatusCode === 404 || error?.statusCode === 404 || error?.status === 404 ||
    /not found|does not exist|no document|namespacenotfound|ns not found/i.test(String(error?.message || ''))
}

function isAlreadyExists (error) {
  return error?.httpStatusCode === 409 || error?.statusCode === 409 || error?.status === 409 ||
    /already exists|namespaceexists|index.*exists|E11000|duplicate key/i.test(String(error?.message || ''))
}

function dedupeOptions (options) {
  const byValue = new Map()
  for (const option of options || []) {
    const optionValue = String(option?.value ?? '').trim()
    if (!optionValue) continue
    const optionLabel = String(option?.label ?? '').trim() || optionValue
    const current = byValue.get(optionValue)
    if (!current || (current.label === current.value && optionLabel !== optionValue)) {
      byValue.set(optionValue, { value: optionValue, label: optionLabel })
    }
  }
  return [...byValue.values()]
}

const READ_BATCH = 100
const WRITE_BATCH = 40
const SEARCH_FIELDS = ['optionLabel', 'url_alias', 'optionValue']

function searchClause (search) {
  const term = String(search || '').trim()
  if (!term) return {}
  const pattern = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return {
    $or: SEARCH_FIELDS.map(field => ({
      [field]: { $regex: pattern, $options: 'i' }
    }))
  }
}

function chunks (items, size) {
  const groups = []
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size))
  return groups
}

async function insertFresh (collection, documents) {
  if (!documents.length) return 0
  let inserted = 0
  for (const group of chunks(documents, WRITE_BATCH)) {
    inserted += await insertGroup(collection, group)
  }
  return inserted
}

async function insertGroup (collection, documents) {
  try {
    await collection.insertMany(documents, { ordered: false })
    return documents.length
  } catch (error) {
    if (!isAlreadyExists(error)) throw error
    if (documents.length === 1) return 0
    const mid = Math.ceil(documents.length / 2)
    const left = await insertGroup(collection, documents.slice(0, mid))
    const right = await insertGroup(collection, documents.slice(mid))
    return left + right
  }
}

async function readMatches (collection, filter, fields) {
  const docs = []
  const seen = new Set()
  let skip = 0
  for (;;) {
    const batch = await collection.find(filter).project(projection(fields)).skip(skip).limit(READ_BATCH).toArray()
    let added = 0
    for (const doc of batch) {
      const key = doc.id || `${doc.attributeCode}:${doc.optionValue}`
      if (seen.has(key)) continue
      seen.add(key)
      docs.push(doc)
      added += 1
    }
    if (added === 0 || batch.length < READ_BATCH || docs.length >= 20000) break
    skip += batch.length
  }
  return docs
}

function brandDocumentId (environmentId, attributeCode, optionValue, storeViewCode) {
  return [environmentId, attributeCode, optionValue, storeViewCode]
    .map(part => encodeURIComponent(String(part)))
    .join(':')
}

function settingsDocumentId (environmentId) {
  return `settings:${encodeURIComponent(environmentId)}`
}

function pageArgs (page, pageSize) {
  const current = Math.max(1, Number(page) || 1)
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || PAGE_SIZE))
  return { page: current, pageSize: size, skip: (current - 1) * size }
}

function emptySettings (environmentId) {
  return {
    id: settingsDocumentId(environmentId),
    environmentId,
    brandAttributeCode: '',
    updatedAt: null
  }
}

function choiceFrom (saved) {
  return {
    id: saved.id,
    environmentId: saved.environmentId,
    brandAttributeCode: saved.brandAttributeCode || '',
    updatedAt: saved.updatedAt || null
  }
}

function applyUseDefaultTitles (doc) {
  const next = { ...doc }
  if (next.meta_title_use_default !== false) next.meta_title = next.optionLabel || ''
  if (next.page_title_use_default !== false) next.page_title = next.optionLabel || ''
  return next
}

function mergeBrand (base, override, storeViewCode) {
  if (!base) return null
  const resolved = applyUseDefaultTitles({ ...base, storeViewCode })
  if (!override) return resolved
  for (const field of [...BOOLEAN_FIELDS, ...TEXT_FIELDS, 'slider_position']) {
    if (override[field] !== undefined && override[field] !== null) resolved[field] = override[field]
  }
  for (const field of USE_DEFAULT_FIELDS) {
    const flag = `${field}_use_default`
    if (override[flag] === true) resolved[field] = resolved.optionLabel || ''
    if (override[flag] === false && override[field] != null) resolved[field] = override[field]
    if (override[flag] !== undefined) resolved[flag] = override[flag]
  }
  resolved.storeViewCode = storeViewCode
  return applyUseDefaultTitles(resolved)
}

function isActiveValue (value) {
  return value !== false && value !== 'false' && value !== 0 && value !== '0'
}

function isVisible (doc) {
  return Boolean(doc) && doc.hidden !== true && doc.optionRemoved !== true && isActiveValue(doc.is_active)
}

function matchesCriteria (doc, criteria = {}) {
  const name = String(criteria.name || '').trim().toLowerCase()
  if (name && !String(doc.optionLabel || '').toLowerCase().includes(name)) return false
  const flags = {
    isActive: isActiveValue(doc.is_active),
    isNewBrand: doc.is_new_brand === true,
    isTopBrand: doc.is_top_brand === true,
    isFeatured: doc.is_featured === true,
    showInBrandListWidget: doc.show_in_brand_list_widget !== false,
    showInBrandSliderWidget: doc.show_in_brand_slider_widget === true
  }
  for (const key of Object.keys(flags)) {
    if (criteria[key] == null) continue
    if (flags[key] !== criteria[key]) return false
  }
  return true
}

function criteriaDbFilter (criteria = {}, widget) {
  const filter = {}
  const flags = {
    isActive: 'is_active',
    isNewBrand: 'is_new_brand',
    isTopBrand: 'is_top_brand',
    isFeatured: 'is_featured',
    showInBrandListWidget: 'show_in_brand_list_widget',
    showInBrandSliderWidget: 'show_in_brand_slider_widget'
  }
  for (const [key, field] of Object.entries(flags)) {
    if (criteria[key] === true || criteria[key] === false) filter[field] = criteria[key]
  }
  if (criteria.isActive == null && filter.is_active === undefined) filter.is_active = { $ne: false }
  if (widget === 'LIST' && filter.show_in_brand_list_widget === undefined) {
    filter.show_in_brand_list_widget = { $ne: false }
  }
  if (widget === 'SLIDER' && filter.show_in_brand_slider_widget === undefined) {
    filter.show_in_brand_slider_widget = true
  }
  return filter
}

function matchesWidget (doc, widget) {
  if (widget === 'LIST') return doc.show_in_brand_list_widget !== false
  if (widget === 'SLIDER') return doc.show_in_brand_slider_widget === true
  return true
}

function slimBrand (doc) {
  return {
    id: doc.optionValue,
    name: doc.optionLabel,
    attributeCode: doc.attributeCode,
    urlAlias: doc.url_alias || '',
    isActive: isActiveValue(doc.is_active),
    isNewBrand: doc.is_new_brand === true,
    isTopBrand: doc.is_top_brand === true,
    isFeatured: doc.is_featured === true,
    showInBrandListWidget: doc.show_in_brand_list_widget !== false,
    showInBrandSliderWidget: doc.show_in_brand_slider_widget === true,
    sliderPosition: Number(doc.slider_position) || 0,
    smallImage: doc.small_image || '',
    smallImageAlt: doc.small_image_alt || '',
    storeViewCode: doc.storeViewCode
  }
}

function storefrontBrand (doc) {
  return {
    ...slimBrand(doc),
    metaTitle: doc.meta_title || '',
    metaDescription: doc.meta_description || '',
    metaKeywords: doc.meta_keywords || '',
    pageTitle: doc.page_title || '',
    description: doc.description || '',
    shortDescription: doc.short_description || '',
    image: doc.image || '',
    imageAlt: doc.image_alt || ''
  }
}

function newBrandDocument (environmentId, attributeCode, option, alias) {
  const now = new Date().toISOString()
  const optionValue = String(option.value)
  const optionLabel = option.label || optionValue
  return {
    ...FIELD_DEFAULTS,
    id: brandDocumentId(environmentId, attributeCode, optionValue, ALL_STORE_VIEWS),
    environmentId,
    attributeCode,
    optionValue,
    optionLabel,
    normalizedLabel: normalizeName(optionLabel),
    storeViewCode: ALL_STORE_VIEWS,
    hidden: false,
    optionRemoved: false,
    url_alias: alias,
    meta_title: optionLabel,
    page_title: optionLabel,
    updatedAt: now
  }
}

function sanitizeFields (fields = {}) {
  const patch = {}
  for (const field of BOOLEAN_FIELDS) {
    if (fields[field] === undefined) continue
    patch[field] = fields[field] === true || fields[field] === 'true' || fields[field] === 1 || fields[field] === '1'
  }
  for (const field of TEXT_FIELDS) {
    if (fields[field] === undefined) continue
    patch[field] = String(fields[field] ?? '').trim()
  }
  if (fields.slider_position !== undefined) {
    const position = Number(fields.slider_position)
    if (!Number.isFinite(position)) throw httpError(400, 'Position in Slider must be a number.')
    patch.slider_position = Math.trunc(position)
  }
  for (const field of USE_DEFAULT_FIELDS) {
    const flag = `${field}_use_default`
    if (fields[flag] === undefined) continue
    patch[flag] = fields[flag] === true || fields[flag] === 'true'
  }
  if (patch.url_alias) patch.url_alias = slugify(patch.url_alias)
  return patch
}

async function ensureCollection (client, name) {
  const collections = await client.listCollections({ name })
  if (collections.some(collection => collection.name === name)) return client.collection(name)
  try {
    return await client.createCollection(name)
  } catch (error) {
    if (isAlreadyExists(error)) return client.collection(name)
    throw error
  }
}

async function findOneOrNull (collection, filter) {
  try {
    return await collection.findOne(filter)
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

async function openBrandDb (params) {
  const token = await Core.AuthClient.generateAccessToken(params)
  const db = await libDb.init({
    token: token.access_token,
    region: params.DB_REGION || 'amer'
  })
  const client = await db.connect()
  const brands = await ensureCollection(client, BRANDS_COLLECTION)
  const settings = await ensureCollection(client, BRAND_SETTINGS_COLLECTION)
  return { client, brands, settings }
}

function createBrandStore (params, opener = openBrandDb) {
  const environmentId = resolveEnvironmentId(params)

  async function withDb (callback) {
    const opened = await opener(params)
    try {
      return await callback(opened)
    } finally {
      await opened.client.close()
    }
  }

  function baseFilter (attributeCode, extra = {}) {
    return {
      environmentId,
      attributeCode,
      storeViewCode: ALL_STORE_VIEWS,
      ...extra
    }
  }

  async function loadChoiceFromDb () {
    return withDb(async ({ settings }) => {
      const saved = await findOneOrNull(settings, { id: settingsDocumentId(environmentId) })
      return choiceFrom(saved || emptySettings(environmentId))
    })
  }

  return {
    environmentId,

    getSettings: async () => {
      const cache = await createBrandCache(params)
      const cached = await cache.getBrandChoice()
      if (cached && cached.environmentId === environmentId && typeof cached.brandAttributeCode === 'string') {
        return cached
      }
      const saved = await loadChoiceFromDb()
      await cache.putBrandChoice(saved)
      return saved
    },

    refreshChoice: async () => {
      const saved = await loadChoiceFromDb()
      await (await createBrandCache(params)).putBrandChoice(saved)
      return saved
    },

    saveAttributeCode: (brandAttributeCode, confirmAttributeChange) => withDb(async ({ brands, settings }) => {
      const next = String(brandAttributeCode || '').trim()
      if (!ATTRIBUTE_CODE.test(next)) throw httpError(400, 'Choose a dropdown attribute.')
      const current = await findOneOrNull(settings, { id: settingsDocumentId(environmentId) }) || emptySettings(environmentId)
      if (current.brandAttributeCode === next) {
        await (await createBrandCache(params)).putBrandChoice(choiceFrom(current))
        return { brandAttributeCode: next, changed: false }
      }
      if (confirmAttributeChange !== true) {
        throw httpError(409, 'Confirm the brand attribute change before saving.')
      }
      const updatedAt = new Date().toISOString()
      const document = {
        ...current,
        id: settingsDocumentId(environmentId),
        environmentId,
        brandAttributeCode: next,
        updatedAt
      }
      if (current.updatedAt) await settings.replaceOne({ id: document.id }, document)
      else await settings.insertOne(document)
      await brands.updateMany(
        { environmentId, attributeCode: { $ne: next } },
        { $set: { hidden: true, updatedAt } }
      )
      await brands.updateMany(
        { environmentId, attributeCode: next, optionRemoved: { $ne: true } },
        { $set: { hidden: false, updatedAt } }
      )
      await (await createBrandCache(params)).putBrandChoice(choiceFrom(document))
      return { brandAttributeCode: next, changed: true }
    }),

    syncOptions: (attributeCode, options) => withDb(async ({ brands }) => {
      const catalogOptions = dedupeOptions(options)
      if (!catalogOptions.length) return { inserted: 0, updated: 0, removed: 0 }
      const existing = await readMatches(brands, baseFilter(attributeCode), [
        'optionValue', 'optionLabel', 'optionRemoved', 'hidden', 'url_alias', 'attributeCode'
      ])
      const byValue = new Map(existing.map(doc => [String(doc.optionValue), doc]))
      const otherAliases = await readMatches(brands, {
        environmentId,
        storeViewCode: ALL_STORE_VIEWS,
        attributeCode: { $ne: attributeCode }
      }, ['url_alias', 'attributeCode', 'optionValue'])
      const taken = new Set(
        [...existing, ...otherAliases].map(doc => doc.url_alias).filter(Boolean)
      )
      const live = new Set(catalogOptions.map(option => option.value))
      const fresh = []
      const updates = []
      let removed = 0

      for (const option of catalogOptions) {
        const current = byValue.get(option.value)
        if (!current) {
          const alias = uniqueSlug(option.label, taken)
          taken.add(alias)
          fresh.push(newBrandDocument(environmentId, attributeCode, option, alias))
          continue
        }
        const patch = {}
        if (current.optionLabel !== option.label) {
          patch.optionLabel = option.label
          patch.normalizedLabel = normalizeName(option.label)
        }
        if (current.optionRemoved === true || current.hidden === true) {
          patch.optionRemoved = false
          patch.hidden = false
        }
        if (Object.keys(patch).length) {
          patch.updatedAt = new Date().toISOString()
          updates.push({ id: current.id, patch })
        }
      }

      const inserted = await insertFresh(brands, fresh)
      for (const group of chunks(updates, WRITE_BATCH)) {
        await brands.bulkWrite(group.map(item => ({
          updateOne: { filter: { id: item.id }, update: { $set: item.patch } }
        })))
      }

      const removedValues = existing
        .filter(doc => !live.has(String(doc.optionValue)) && doc.optionRemoved !== true)
        .map(doc => String(doc.optionValue))
      if (removedValues.length) {
        await brands.updateMany(baseFilter(attributeCode, { optionValue: { $in: removedValues } }), {
          $set: { optionRemoved: true, hidden: true, updatedAt: new Date().toISOString() }
        })
        removed = removedValues.length
      }

      return { inserted, updated: updates.length, removed }
    }),

    pageAdmin: ({ attributeCode, storeViewCode = ALL_STORE_VIEWS, page, pageSize, search }) => withDb(async ({ brands }) => {
      const paging = pageArgs(page, pageSize)
      if (!attributeCode) return { page: paging.page, pageSize: paging.pageSize, total: 0, items: [] }
      const filter = baseFilter(attributeCode, {
        hidden: false,
        optionRemoved: false,
        ...searchClause(search)
      })
      const [total, bases] = await Promise.all([
        brands.countDocuments(filter),
        brands.find(filter).sort({ optionLabel: 1 }).skip(paging.skip).limit(paging.pageSize).toArray()
      ])
      const items = await overlayPage(brands, environmentId, attributeCode, storeViewCode, bases)
      return { page: paging.page, pageSize: paging.pageSize, total, items }
    }),

    getAdminBrand: ({ attributeCode, optionValue, storeViewCode = ALL_STORE_VIEWS }) => withDb(async ({ brands }) => {
      const value = String(optionValue || '').trim()
      const scope = String(storeViewCode || ALL_STORE_VIEWS).trim() || ALL_STORE_VIEWS
      if (!attributeCode || !value) return null
      const base = await findOneOrNull(brands, baseFilter(attributeCode, { optionValue: value }))
      if (!base || base.optionRemoved === true || base.hidden === true) return null
      const override = scope === ALL_STORE_VIEWS
        ? null
        : await findOneOrNull(brands, {
          environmentId,
          attributeCode,
          storeViewCode: scope,
          optionValue: value
        })
      return mergeBrand(base, override, scope)
    }),

    findResolved: ({ attributeCode, storeViewCode = 'default', id, name, urlAlias }) => withDb(async ({ brands }) => {
      if (!attributeCode) return null
      const scope = storeViewCode || 'default'
      let base = null
      if (id) {
        base = await findOneOrNull(brands, baseFilter(attributeCode, { optionValue: String(id) }))
      } else if (name) {
        base = await findOneOrNull(brands, baseFilter(attributeCode, { normalizedLabel: normalizeName(name) }))
      } else if (urlAlias) {
        const alias = slugify(urlAlias)
        const override = scope === ALL_STORE_VIEWS
          ? null
          : await findOneOrNull(brands, {
            environmentId,
            attributeCode,
            storeViewCode: scope,
            url_alias: alias
          })
        if (override) {
          base = await findOneOrNull(brands, baseFilter(attributeCode, { optionValue: override.optionValue }))
          const resolved = mergeBrand(base, override, scope)
          return isVisible(resolved) && resolved.url_alias === alias ? resolved : null
        }
        base = await findOneOrNull(brands, baseFilter(attributeCode, { url_alias: alias }))
      }
      if (!base) return null
      const override = scope === ALL_STORE_VIEWS
        ? null
        : await findOneOrNull(brands, {
          environmentId,
          attributeCode,
          storeViewCode: scope,
          optionValue: base.optionValue
        })
      const resolved = mergeBrand(base, override, scope)
      if (urlAlias && resolved.url_alias !== slugify(urlAlias)) return null
      return isVisible(resolved) ? resolved : null
    }),

    listDirectory: ({ attributeCode, storeViewCode = 'default' }) => withDb(async ({ brands }) => {
      if (!attributeCode) return { items: [] }
      const scope = storeViewCode || 'default'
      const bases = await readMatches(brands, baseFilter(attributeCode, {
        hidden: false,
        optionRemoved: false,
        is_active: { $ne: false }
      }), [
        'optionValue', 'optionLabel', 'url_alias', 'image', 'is_active', 'hidden', 'optionRemoved'
      ])
      bases.sort((left, right) => String(left.optionLabel).localeCompare(String(right.optionLabel)))
      const merged = await overlayPage(brands, environmentId, attributeCode, scope, bases)
      const items = merged.filter(isVisible).map(doc => ({
        id: String(doc.optionValue),
        name: doc.optionLabel || '',
        slug: doc.url_alias || '',
        image: doc.image || ''
      }))
      return { items }
    }),

    pageStorefront: ({ attributeCode, storeViewCode = 'default', widget, page, pageSize, criteria = {} }) => withDb(async ({ brands }) => {
      const paging = pageArgs(page, pageSize)
      if (!attributeCode) return { page: paging.page, pageSize: paging.pageSize, total: 0, items: [] }
      const scope = storeViewCode || 'default'
      const bases = await brands.find(baseFilter(attributeCode, {
        hidden: false,
        optionRemoved: false,
        ...criteriaDbFilter(criteria, widget)
      })).project(projection(PAGE_FIELDS)).sort({ optionLabel: 1 }).toArray()
      const merged = await overlayPage(brands, environmentId, attributeCode, scope, bases)
      const visible = merged.filter(doc => {
        if (!doc || doc.hidden === true || doc.optionRemoved === true) return false
        if (criteria.isActive == null && !isVisible(doc)) return false
        return matchesWidget(doc, widget) && matchesCriteria(doc, criteria)
      })
      visible.sort((left, right) => {
        if (widget === 'SLIDER' && left.slider_position !== right.slider_position) {
          return left.slider_position - right.slider_position
        }
        return String(left.optionLabel).localeCompare(String(right.optionLabel))
      })
      return {
        page: paging.page,
        pageSize: paging.pageSize,
        total: visible.length,
        items: visible.slice(paging.skip, paging.skip + paging.pageSize).map(storefrontBrand)
      }
    }),

    writeScope: ({ attributeCode, optionValue, storeViewCode = ALL_STORE_VIEWS, fields = {}, useDefault = [] }) => withDb(async ({ brands }) => {
      const value = String(optionValue || '').trim()
      const scope = String(storeViewCode || ALL_STORE_VIEWS).trim() || ALL_STORE_VIEWS
      if (!attributeCode || !value) throw httpError(400, 'Brand option is required.')
      const base = await findOneOrNull(brands, baseFilter(attributeCode, { optionValue: value }))
      if (!base || base.optionRemoved === true) throw httpError(404, 'Brand not found.')
      const patch = sanitizeFields(fields)
      for (const field of useDefault) {
        if (USE_DEFAULT_FIELDS.includes(field)) patch[`${field}_use_default`] = true
      }
      if (patch.url_alias) await assertAliasAvailable(brands, environmentId, attributeCode, value, scope, patch.url_alias)

      const updatedAt = new Date().toISOString()
      if (scope === ALL_STORE_VIEWS) {
        const next = { ...base, ...patch, updatedAt }
        if (next.meta_title_use_default !== false) next.meta_title = next.optionLabel
        if (next.page_title_use_default !== false) next.page_title = next.optionLabel
        await brands.replaceOne({ id: base.id }, next)
        return mergeBrand(next, null, ALL_STORE_VIEWS)
      }

      const overrideId = brandDocumentId(environmentId, attributeCode, value, scope)
      const existing = await findOneOrNull(brands, { id: overrideId }) || {
        id: overrideId,
        environmentId,
        attributeCode,
        optionValue: value,
        optionLabel: base.optionLabel,
        storeViewCode: scope,
        hidden: false,
        optionRemoved: false
      }
      const next = { ...existing, ...patch, updatedAt }
      for (const field of useDefault) {
        if (!USE_DEFAULT_FIELDS.includes(field)) continue
        delete next[field]
        next[`${field}_use_default`] = true
      }
      if (existing.updatedAt) await brands.replaceOne({ id: overrideId }, next)
      else await brands.insertOne(next)
      return mergeBrand(base, next, scope)
    })
  }
}

function projection (fields) {
  return fields.reduce((spec, field) => {
    spec[field] = 1
    return spec
  }, { id: 1 })
}

async function overlayPage (brands, environmentId, attributeCode, storeViewCode, bases) {
  if (!bases.length || storeViewCode === ALL_STORE_VIEWS) {
    return bases.map(base => mergeBrand(base, null, storeViewCode || ALL_STORE_VIEWS))
  }
  const optionValues = bases.map(base => base.optionValue)
  const overrides = await brands.find({
    environmentId,
    attributeCode,
    storeViewCode,
    optionValue: { $in: optionValues }
  }).toArray()
  const byValue = new Map(overrides.map(doc => [String(doc.optionValue), doc]))
  return bases.map(base => mergeBrand(base, byValue.get(String(base.optionValue)), storeViewCode))
}

async function assertAliasAvailable (brands, environmentId, attributeCode, optionValue, storeViewCode, alias) {
  const match = await findOneOrNull(brands, {
    environmentId,
    attributeCode,
    storeViewCode,
    url_alias: alias
  })
  if (match && String(match.optionValue) !== String(optionValue)) {
    throw httpError(409, 'URL alias is already used by another brand.')
  }
}

module.exports = {
  createBrandStore,
  openBrandDb,
  mergeBrand,
  isVisible,
  matchesCriteria,
  slimBrand,
  storefrontBrand,
  sanitizeFields,
  brandDocumentId,
  settingsDocumentId
}
