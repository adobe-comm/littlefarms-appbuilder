const { Core } = require('@adobe/aio-sdk')
const libDb = require('@adobe/aio-lib-db')

const { resolveEnvironmentId } = require('../../block/lib/app-scope')
const {
  CATEGORIES_COLLECTION,
  TAGS_COLLECTION,
  POSTS_COLLECTION,
  PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  CATEGORY_DISPLAY_MODES
} = require('./constants')
const { slugify, uniqueSlug } = require('./slug')

const READ_BATCH = 100

function httpError (statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function isAlreadyExists (error) {
  return error?.httpStatusCode === 409 || error?.statusCode === 409 || error?.status === 409 ||
    /already exists|namespaceexists|index.*exists|E11000|duplicate key/i.test(String(error?.message || ''))
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

async function openDb (params, collectionName) {
  const token = await Core.AuthClient.generateAccessToken(params)
  const db = await libDb.init({
    token: token.access_token,
    region: params.DB_REGION || 'amer'
  })
  const client = await db.connect()
  const collection = await ensureCollection(client, collectionName)
  return { client, collection }
}

function text (value) {
  return String(value ?? '').trim()
}

function clipped (value, max) {
  return text(value).slice(0, max)
}

function pageSizeOf (value) {
  const size = Number(value)
  return PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE
}

function includesText (value, query) {
  const needle = text(query).toLowerCase()
  if (!needle) return true
  return text(value).toLowerCase().includes(needle)
}

function bool (value, defaultValue = false) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  return defaultValue
}

function imageUrl (value, label) {
  const url = text(value)
  if (!url) return ''
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || url.length > 2000) throw httpError(400, `${label} address is not valid.`)
  } catch (error) {
    if (error.statusCode) throw error
    throw httpError(400, `${label} address is not valid.`)
  }
  return url
}

async function findOneOrNull (collection, filter) {
  try {
    return await collection.findOne(filter)
  } catch (error) {
    if (error?.statusCode === 404 || error?.httpStatusCode === 404 || /not found/i.test(String(error?.message || ''))) return null
    throw error
  }
}

function toForm (doc, variant) {
  const base = {
    tagId: doc.taxonomyId,
    categoryId: doc.taxonomyId,
    title: text(doc.title),
    url_key: text(doc.url_key),
    is_active: doc.is_active !== false,
    meta_title: text(doc.meta_title),
    meta_keywords: text(doc.meta_keywords),
    meta_description: text(doc.meta_description),
    meta_prefix: text(doc.meta_prefix),
    meta_suffix: text(doc.meta_suffix),
    createdAt: text(doc.createdAt),
    updatedAt: text(doc.updatedAt)
  }
  if (variant !== 'category') return base
  return {
    ...base,
    parent_id: doc.parent_id == null || doc.parent_id === '' ? null : Number(doc.parent_id),
    sort_order: Number.isFinite(Number(doc.sort_order)) ? Number(doc.sort_order) : 0,
    status: doc.is_active !== false ? 'enabled' : 'disabled',
    image: text(doc.image),
    image_title: text(doc.image_title),
    image_alt: text(doc.image_alt),
    display_mode: CATEGORY_DISPLAY_MODES.includes(doc.display_mode) ? doc.display_mode : 'blog_posts_only',
    enable_description: doc.enable_description === true,
    description: text(doc.description)
  }
}

function publicListItem (doc, usedInPosts, variant) {
  if (variant === 'category') {
    return {
      id: String(doc.taxonomyId),
      categoryId: doc.taxonomyId,
      title: text(doc.title),
      url_key: text(doc.url_key),
      meta_title: text(doc.meta_title),
      meta_keywords: text(doc.meta_keywords),
      meta_description: text(doc.meta_description),
      status: doc.is_active !== false ? 'enabled' : 'disabled',
      sort_order: Number.isFinite(Number(doc.sort_order)) ? Number(doc.sort_order) : 0,
      parent_id: doc.parent_id == null || doc.parent_id === '' ? null : Number(doc.parent_id),
      usedInPosts,
      createdAt: text(doc.createdAt),
      updatedAt: text(doc.updatedAt)
    }
  }
  return {
    id: String(doc.taxonomyId),
    tagId: doc.taxonomyId,
    title: text(doc.title),
    url_key: text(doc.url_key),
    is_active: doc.is_active !== false,
    usedInPosts,
    createdAt: text(doc.createdAt),
    updatedAt: text(doc.updatedAt)
  }
}

function createTaxonomyStore (params, { collectionName, type, counterKey, variant }) {
  const environmentId = resolveEnvironmentId(params)

  async function withCollection (callback) {
    const opened = await openDb(params, collectionName)
    try {
      return await callback(opened.collection)
    } finally {
      await opened.client.close()
    }
  }

  async function withPosts (callback) {
    const opened = await openDb(params, POSTS_COLLECTION)
    try {
      return await callback(opened.collection)
    } finally {
      await opened.client.close()
    }
  }

  async function readAllDocs () {
    return withCollection(async collection => {
      const docs = []
      let skip = 0
      for (;;) {
        const batch = await collection.find({ environmentId, type }).skip(skip).limit(READ_BATCH).toArray()
        docs.push(...batch)
        if (batch.length < READ_BATCH) break
        skip += batch.length
      }
      return docs
    })
  }

  async function usageCounts () {
    const counts = new Map()
    await withPosts(async posts => {
      let skip = 0
      for (;;) {
        const batch = await posts.find({ environmentId, type: 'blog_post' }).skip(skip).limit(READ_BATCH).toArray()
        for (const doc of batch) {
          const field = type === 'blog_tag' ? 'tag_ids' : 'category_ids'
          const ids = Array.isArray(doc[field]) ? doc[field] : []
          for (const id of ids) {
            const key = String(id)
            counts.set(key, (counts.get(key) || 0) + 1)
          }
        }
        if (batch.length < READ_BATCH) break
        skip += batch.length
      }
    })
    return counts
  }

  async function takenUrlKeys (exceptId) {
    const docs = await readAllDocs()
    const taken = new Set()
    for (const doc of docs) {
      if (exceptId && doc.taxonomyId === exceptId) continue
      const key = text(doc.url_key)
      if (key) taken.add(key)
    }
    return taken
  }

  function matchesFilters (doc, filters) {
    if (!includesText(doc.title, filters.title)) return false
    if (!includesText(doc.url_key, filters.url_key)) return false
    return true
  }

  function sortDocs (matched, sortDir) {
    const direction = sortDir === 'asc' ? 1 : -1
    if (variant === 'category') {
      matched.sort((left, right) => {
        const leftOrder = Number.isFinite(Number(left.sort_order)) ? Number(left.sort_order) : 0
        const rightOrder = Number.isFinite(Number(right.sort_order)) ? Number(right.sort_order) : 0
        if (leftOrder !== rightOrder) return (leftOrder - rightOrder) * direction
        return (left.taxonomyId - right.taxonomyId) * direction
      })
      return
    }
    matched.sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || 0)
      const rightTime = Date.parse(right.createdAt || 0)
      if (leftTime !== rightTime) return (leftTime - rightTime) * direction
      return (left.taxonomyId - right.taxonomyId) * direction
    })
  }

  async function sanitize (fields, taxonomyId) {
    const title = clipped(fields.title, 255)
    if (!title) throw httpError(400, 'Name is required.')
    let urlKey = clipped(fields.url_key, 255)
    const taken = await takenUrlKeys(taxonomyId)
    if (!urlKey) urlKey = uniqueSlug(title, taken)
    else {
      urlKey = slugify(urlKey)
      if (!urlKey) throw httpError(400, 'URL key is not valid.')
      if (taken.has(urlKey)) throw httpError(400, 'URL key must be unique.')
    }

    let isActive = fields.is_active !== false && fields.is_active !== 'false'
    if (variant === 'category' && fields.status != null) {
      isActive = text(fields.status) !== 'disabled'
    }

    const record = {
      title,
      url_key: urlKey,
      is_active: isActive,
      meta_title: clipped(fields.meta_title, 255),
      meta_keywords: clipped(fields.meta_keywords, 500),
      meta_description: clipped(fields.meta_description, 500),
      meta_prefix: clipped(fields.meta_prefix, 255),
      meta_suffix: clipped(fields.meta_suffix, 255)
    }

    if (variant !== 'category') return record

    const docs = await readAllDocs()
    let parent_id = null
    const parentRaw = fields.parent_id
    if (parentRaw !== null && parentRaw !== undefined && text(parentRaw) !== '') {
      parent_id = Number(parentRaw)
      if (!Number.isInteger(parent_id) || parent_id <= 0) throw httpError(400, 'Parent category is not valid.')
      if (taxonomyId && parent_id === taxonomyId) throw httpError(400, 'A category cannot be its own parent.')
      const parent = docs.find(doc => doc.taxonomyId === parent_id)
      if (!parent) throw httpError(400, 'Parent category was not found.')
    }

    const sortRaw = text(fields.sort_order)
    let sort_order = 0
    if (sortRaw) {
      if (!/^-?\d+$/.test(sortRaw)) throw httpError(400, 'Sort Order must be a whole number.')
      sort_order = Math.trunc(Number(sortRaw))
    }

    const display_mode = CATEGORY_DISPLAY_MODES.includes(fields.display_mode)
      ? fields.display_mode
      : 'blog_posts_only'

    return {
      ...record,
      parent_id,
      sort_order,
      image: imageUrl(fields.image, 'Category image'),
      image_title: clipped(fields.image_title, 255),
      image_alt: clipped(fields.image_alt, 255),
      display_mode,
      enable_description: bool(fields.enable_description),
      description: clipped(fields.description, 100000)
    }
  }

  return {
    async list ({ page, pageSize, sortDir, filters = {}, listAll = false }) {
      const [docs, usage] = await Promise.all([readAllDocs(), usageCounts()])
      const matched = docs.filter(doc => matchesFilters(doc, filters))
      sortDocs(matched, sortDir)
      const items = matched.map(doc => publicListItem(doc, usage.get(String(doc.taxonomyId)) || 0, variant))
      if (listAll) {
        return { items, total: items.length, page: 1, pageSize: items.length }
      }
      const size = pageSizeOf(pageSize)
      const pageCount = Math.max(1, Math.ceil(items.length / size))
      const current = Math.min(Math.max(1, Number(page) || 1), pageCount)
      const start = (current - 1) * size
      return {
        items: items.slice(start, start + size),
        total: items.length,
        page: current,
        pageSize: size
      }
    },

    async get (taxonomyId) {
      const id = Number(taxonomyId)
      if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Id is not valid.')
      return withCollection(async collection => {
        const doc = await findOneOrNull(collection, { environmentId, type, taxonomyId: id })
        return doc ? toForm(doc, variant) : null
      })
    },

    async save (fields, taxonomyId) {
      const id = Number(taxonomyId)
      const record = await sanitize(fields, Number.isInteger(id) && id > 0 ? id : null)
      const now = new Date().toISOString()
      return withCollection(async collection => {
        if (Number.isInteger(id) && id > 0) {
          const existing = await findOneOrNull(collection, { environmentId, type, taxonomyId: id })
          if (!existing) throw httpError(404, 'Record not found.')
          const document = {
            ...existing,
            ...record,
            id: existing.id,
            type,
            environmentId,
            taxonomyId: id,
            updatedAt: now
          }
          await collection.replaceOne({ id: existing.id }, document)
          return toForm(document, variant)
        }
        const counterId = `${counterKey}:${environmentId}`
        const counter = await findOneOrNull(collection, { id: counterId })
        const nextId = Number(counter?.nextId) > 0 ? Number(counter.nextId) : 1
        const counterDoc = { id: counterId, type: 'counter', environmentId, nextId: nextId + 1 }
        if (counter) await collection.replaceOne({ id: counterId }, counterDoc)
        else await collection.insertOne(counterDoc)
        const prefix = type === 'blog_tag' ? 'tag' : 'cat'
        const document = {
          ...record,
          id: `${prefix}:${environmentId}:${nextId}`,
          type,
          environmentId,
          taxonomyId: nextId,
          createdAt: now,
          updatedAt: now
        }
        await collection.insertOne(document)
        return toForm(document, variant)
      })
    },

    async remove (ids) {
      const taxonomyIds = [...new Set((Array.isArray(ids) ? ids : []).map(value => Number(value)).filter(id => Number.isInteger(id) && id > 0))]
      if (!taxonomyIds.length) throw httpError(400, "You haven't selected any items!")
      if (variant === 'category') {
        const docs = await readAllDocs()
        for (const taxonomyId of taxonomyIds) {
          const hasChild = docs.some(doc => Number(doc.parent_id) === taxonomyId)
          if (hasChild) throw httpError(400, 'Delete child categories before deleting this category.')
        }
      }
      return withCollection(async collection => {
        const result = await collection.deleteMany({
          environmentId,
          type,
          taxonomyId: { $in: taxonomyIds }
        })
        return { affected: result.deletedCount || 0 }
      })
    },

    async validateIds (ids) {
      const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(id => text(id)).filter(Boolean))]
      if (!wanted.length) return []
      const docs = await readAllDocs()
      const known = new Set(docs.filter(doc => doc.is_active !== false).map(doc => String(doc.taxonomyId)))
      for (const id of wanted) {
        if (!known.has(id)) throw httpError(400, `Unknown ${type} id: ${id}`)
      }
      return wanted
    }
  }
}

function createCategoryStore (params) {
  return createTaxonomyStore(params, {
    collectionName: CATEGORIES_COLLECTION,
    type: 'blog_category',
    counterKey: 'blog-category-counter',
    variant: 'category'
  })
}

function createTagStore (params) {
  return createTaxonomyStore(params, {
    collectionName: TAGS_COLLECTION,
    type: 'blog_tag',
    counterKey: 'blog-tag-counter',
    variant: 'tag'
  })
}

module.exports = {
  createCategoryStore,
  createTagStore,
  toForm
}
