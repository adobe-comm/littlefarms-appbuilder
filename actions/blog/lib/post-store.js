const { Core } = require('@adobe/aio-sdk')
const libDb = require('@adobe/aio-lib-db')

const { resolveEnvironmentId } = require('../../block/lib/app-scope')
const { POSTS_COLLECTION, PAGE_SIZES, DEFAULT_PAGE_SIZE, MAX_POSTS, POST_STATUSES } = require('./constants')
const { slugify, uniqueSlug } = require('./slug')
const { createCategoryStore, createTagStore } = require('./taxonomy-store')

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

async function openPostDb (params) {
  const token = await Core.AuthClient.generateAccessToken(params)
  const db = await libDb.init({
    token: token.access_token,
    region: params.DB_REGION || 'amer'
  })
  const client = await db.connect()
  const posts = await ensureCollection(client, POSTS_COLLECTION)
  return { client, posts }
}

function text (value) {
  return String(value ?? '').trim()
}

function clipped (value, max) {
  return text(value).slice(0, max)
}

function bool (value, defaultValue = false) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  return defaultValue
}

function idList (value) {
  const source = Array.isArray(value) ? value : []
  return [...new Set(source.map(id => text(id)).filter(Boolean))].slice(0, 50)
}

/** Empty array = visible to all customer groups (Aheadworks parity). */
function customerGroupIds (value) {
  const source = Array.isArray(value) ? value : []
  const ids = [...new Set(source.map(id => text(id)).filter(Boolean))].slice(0, 32)
  if (ids.includes('all')) return []
  return ids.filter(id => /^\d+$/.test(id))
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

function isoDateTime (value) {
  const raw = text(value)
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) throw httpError(400, 'Date/time is not valid.')
  return date.toISOString()
}

function includesText (value, query) {
  const needle = text(query).toLowerCase()
  if (!needle) return true
  return text(value).toLowerCase().includes(needle)
}

function pageSizeOf (value) {
  const size = Number(value)
  return PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE
}

function publicPost (doc) {
  return {
    postId: doc.postId,
    title: text(doc.title),
    url_key: text(doc.url_key),
    status: POST_STATUSES.includes(doc.status) ? doc.status : 'draft',
    publish_at: text(doc.publish_at),
    end_at: text(doc.end_at),
    is_featured: doc.is_featured === true,
    is_recipe: doc.is_recipe === true,
    category_ids: idList(doc.category_ids),
    tag_ids: idList(doc.tag_ids),
    customer_group_ids: customerGroupIds(doc.customer_group_ids),
    updatedAt: text(doc.updatedAt)
  }
}

function toForm (doc) {
  return {
    postId: doc.postId,
    title: text(doc.title),
    url_key: text(doc.url_key),
    use_short_content: doc.use_short_content === true,
    short_content: text(doc.short_content),
    content: text(doc.content),
    featured_products_widget: doc.featured_products_widget === true,
    recommended_products_widget: doc.recommended_products_widget === true,
    featured_image: text(doc.featured_image),
    mobile_image: text(doc.mobile_image),
    featured_image_title: text(doc.featured_image_title),
    featured_image_alt: text(doc.featured_image_alt),
    featured_image_link: text(doc.featured_image_link),
    listing_image: text(doc.listing_image),
    listing_image_title: text(doc.listing_image_title),
    listing_image_alt: text(doc.listing_image_alt),
    status: POST_STATUSES.includes(doc.status) ? doc.status : 'draft',
    publish_at: text(doc.publish_at),
    end_at: text(doc.end_at),
    is_featured: doc.is_featured === true,
    is_recipe: doc.is_recipe === true,
    category_ids: idList(doc.category_ids),
    tag_ids: idList(doc.tag_ids),
    customer_group_ids: customerGroupIds(doc.customer_group_ids),
    meta_title: text(doc.meta_title),
    meta_keywords: text(doc.meta_keywords),
    meta_description: text(doc.meta_description),
    meta_prefix: text(doc.meta_prefix),
    meta_suffix: text(doc.meta_suffix),
    createdAt: text(doc.createdAt),
    updatedAt: text(doc.updatedAt)
  }
}

function matchesFilters (doc, filters) {
  if (filters.status && text(doc.status) !== text(filters.status)) return false
  if (!includesText(doc.title, filters.title)) return false
  if (!includesText(doc.url_key, filters.url_key)) return false
  const categoryId = text(filters.categoryId)
  if (categoryId && !idList(doc.category_ids).includes(categoryId)) return false
  const tagId = text(filters.tagId)
  if (tagId && !idList(doc.tag_ids).includes(tagId)) return false
  return true
}

async function findOneOrNull (collection, filter) {
  try {
    return await collection.findOne(filter)
  } catch (error) {
    if (error?.statusCode === 404 || error?.httpStatusCode === 404 || /not found/i.test(String(error?.message || ''))) return null
    throw error
  }
}

async function readPosts (collection, environmentId) {
  const docs = []
  let skip = 0
  for (;;) {
    const batch = await collection.find({ environmentId, type: 'blog_post' }).skip(skip).limit(READ_BATCH).toArray()
    docs.push(...batch)
    if (batch.length < READ_BATCH || docs.length >= MAX_POSTS) break
    skip += batch.length
  }
  return docs
}

function createPostStore (params, opener = openPostDb) {
  const environmentId = resolveEnvironmentId(params)
  const categories = createCategoryStore(params)
  const tags = createTagStore(params)

  async function withDb (callback) {
    const opened = await opener(params)
    try {
      return await callback(opened)
    } finally {
      await opened.client.close()
    }
  }

  async function loadAll () {
    return withDb(async ({ posts }) => readPosts(posts, environmentId))
  }

  async function takenUrlKeys (exceptPostId) {
    const docs = await loadAll()
    const taken = new Set()
    for (const doc of docs) {
      if (exceptPostId && doc.postId === exceptPostId) continue
      const key = text(doc.url_key)
      if (key) taken.add(key)
    }
    return taken
  }

  async function sanitize (fields, postId) {
    const title = clipped(fields.title, 255)
    if (!title) throw httpError(400, 'Title is required.')
    let urlKey = clipped(fields.url_key, 255)
    const taken = await takenUrlKeys(postId)
    if (!urlKey) urlKey = uniqueSlug(title, taken)
    else {
      urlKey = slugify(urlKey)
      if (!urlKey) throw httpError(400, 'URL key is not valid.')
      if (taken.has(urlKey)) throw httpError(400, 'URL key must be unique.')
    }
    const status = POST_STATUSES.includes(fields.status) ? fields.status : 'draft'
    const content = String(fields.content ?? '')
    const plainContent = text(content.replace(/<[^>]*>/g, ''))
    if (status === 'published' && !plainContent) {
      throw httpError(400, 'Content is required for published posts.')
    }
    const categoryIds = await categories.validateIds(fields.category_ids)
    const tagIds = await tags.validateIds(fields.tag_ids)
    return {
      title,
      url_key: urlKey,
      use_short_content: bool(fields.use_short_content),
      short_content: clipped(fields.short_content, 50000),
      content: content.slice(0, 500000),
      featured_products_widget: bool(fields.featured_products_widget),
      recommended_products_widget: bool(fields.recommended_products_widget),
      featured_image: imageUrl(fields.featured_image, 'Featured image'),
      mobile_image: imageUrl(fields.mobile_image, 'Mobile image'),
      featured_image_title: clipped(fields.featured_image_title, 255),
      featured_image_alt: clipped(fields.featured_image_alt, 255),
      featured_image_link: (() => {
        const link = text(fields.featured_image_link)
        if (!link) return ''
        return imageUrl(link, 'Image link')
      })(),
      listing_image: imageUrl(fields.listing_image, 'Listing image'),
      listing_image_title: clipped(fields.listing_image_title, 255),
      listing_image_alt: clipped(fields.listing_image_alt, 255),
      status,
      publish_at: isoDateTime(fields.publish_at),
      end_at: isoDateTime(fields.end_at),
      is_featured: bool(fields.is_featured),
      is_recipe: bool(fields.is_recipe),
      category_ids: categoryIds,
      tag_ids: tagIds,
      customer_group_ids: customerGroupIds(fields.customer_group_ids),
      meta_title: clipped(fields.meta_title, 255),
      meta_keywords: clipped(fields.meta_keywords, 500),
      meta_description: clipped(fields.meta_description, 500),
      meta_prefix: clipped(fields.meta_prefix, 255),
      meta_suffix: clipped(fields.meta_suffix, 255)
    }
  }

  return {
    environmentId,

    async list ({ page, pageSize, sortDir, filters = {} }) {
      const docs = await loadAll()
      const matched = docs.filter(doc => matchesFilters(doc, filters))
      const direction = sortDir === 'asc' ? 1 : -1
      matched.sort((left, right) => {
        const leftTime = Date.parse(left.updatedAt || left.createdAt || 0)
        const rightTime = Date.parse(right.updatedAt || right.createdAt || 0)
        if (leftTime !== rightTime) return (leftTime - rightTime) * direction
        return (left.postId - right.postId) * direction
      })
      const items = matched.map(publicPost)
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

    async get (postId) {
      const id = Number(postId)
      if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Post id is not valid.')
      return withDb(async ({ posts }) => {
        const doc = await findOneOrNull(posts, { environmentId, type: 'blog_post', postId: id })
        return doc ? toForm(doc) : null
      })
    },

    async save (fields, postId) {
      const id = Number(postId)
      const record = await sanitize(fields, Number.isInteger(id) && id > 0 ? id : null)
      const now = new Date().toISOString()
      return withDb(async ({ posts }) => {
        if (Number.isInteger(id) && id > 0) {
          const existing = await findOneOrNull(posts, { environmentId, type: 'blog_post', postId: id })
          if (!existing) throw httpError(404, 'Post not found.')
          const document = {
            ...existing,
            ...record,
            id: existing.id,
            type: 'blog_post',
            environmentId,
            postId: id,
            updatedAt: now
          }
          await posts.replaceOne({ id: existing.id }, document)
          return toForm(document)
        }
        const counterId = `blog-post-counter:${environmentId}`
        const counter = await findOneOrNull(posts, { id: counterId })
        const nextId = Number(counter?.nextId) > 0 ? Number(counter.nextId) : 1
        const counterDoc = { id: counterId, type: 'counter', environmentId, nextId: nextId + 1 }
        if (counter) await posts.replaceOne({ id: counterId }, counterDoc)
        else await posts.insertOne(counterDoc)
        const document = {
          ...record,
          id: `post:${environmentId}:${nextId}`,
          type: 'blog_post',
          environmentId,
          postId: nextId,
          createdAt: now,
          updatedAt: now
        }
        await posts.insertOne(document)
        return toForm(document)
      })
    },

    async remove (postIds) {
      const ids = [...new Set((Array.isArray(postIds) ? postIds : []).map(value => Number(value)).filter(id => Number.isInteger(id) && id > 0))]
      if (!ids.length) throw httpError(400, "You haven't selected any items!")
      return withDb(async ({ posts }) => {
        const result = await posts.deleteMany({
          environmentId,
          type: 'blog_post',
          postId: { $in: ids }
        })
        return { affected: result.deletedCount || 0 }
      })
    }
  }
}

module.exports = {
  createPostStore,
  toForm,
  publicPost
}
