const { Core } = require('@adobe/aio-sdk')
const libDb = require('@adobe/aio-lib-db')
const {
  POSTS_COLLECTION,
  CATEGORIES_COLLECTION,
  TAGS_COLLECTION,
  CATEGORY_DISPLAY_MODES
} = require('../../../actions/blog/lib/constants')
const {
  loadDocumentsViaCli,
  aioUpdateDocument,
  aioInsertDocuments,
  aioReplaceDocument,
  stripInternalFields,
  BLOG_POSTS_COLLECTION,
  BLOG_CATEGORIES_COLLECTION,
  BLOG_TAGS_COLLECTION
} = require('./aio-db-cli')
const { slugify, uniqueSlug } = require('../../../actions/blog/lib/slug')

const BLOG_POST_COUNTER_ID = 'blog-post-counter'
const BLOG_CATEGORY_COUNTER_ID = 'blog-category-counter'
const BLOG_TAG_COUNTER_ID = 'blog-tag-counter'
const READ_BATCH = 100
const DEFAULT_PROGRESS_EVERY = 25

function trimmed (value) {
  return String(value ?? '').trim()
}

function idList (value) {
  const source = Array.isArray(value) ? value : []
  return [...new Set(source.map(id => trimmed(id)).filter(Boolean))].slice(0, 50)
}

async function ensureCollection (client, name) {
  const collections = await client.listCollections({ name })
  if (collections.some(collection => collection.name === name)) return client.collection(name)
  return client.createCollection(name)
}

async function openBlogPostsDb (params) {
  const token = await Core.AuthClient.generateAccessToken(params)
  const db = await libDb.init({
    token: token.access_token,
    region: params.DB_REGION || 'amer'
  })
  const client = await db.connect()
  const posts = await ensureCollection(client, POSTS_COLLECTION)
  return { client, collection: posts }
}

async function openBlogCategoriesDb (params) {
  const token = await Core.AuthClient.generateAccessToken(params)
  const db = await libDb.init({
    token: token.access_token,
    region: params.DB_REGION || 'amer'
  })
  const client = await db.connect()
  const collection = await ensureCollection(client, CATEGORIES_COLLECTION)
  return { client, collection }
}

async function openBlogTagsDb (params) {
  const token = await Core.AuthClient.generateAccessToken(params)
  const db = await libDb.init({
    token: token.access_token,
    region: params.DB_REGION || 'amer'
  })
  const client = await db.connect()
  const collection = await ensureCollection(client, TAGS_COLLECTION)
  return { client, collection }
}

function indexCategories (docs) {
  const byLegacyId = new Map()
  const byUrlKey = new Map()
  for (const doc of docs) {
    if (doc.type !== 'blog_category') continue
    byLegacyId.set(Number(doc.taxonomyId), doc)
    const urlKey = trimmed(doc.url_key).toLowerCase()
    if (urlKey && !byUrlKey.has(urlKey)) byUrlKey.set(urlKey, doc)
  }
  return { byLegacyId, byUrlKey }
}

function indexTags (docs) {
  const byLegacyId = new Map()
  const byUrlKey = new Map()
  for (const doc of docs) {
    if (doc.type !== 'blog_tag') continue
    byLegacyId.set(Number(doc.taxonomyId), doc)
    const urlKey = trimmed(doc.url_key).toLowerCase()
    if (urlKey && !byUrlKey.has(urlKey)) byUrlKey.set(urlKey, doc)
  }
  return { byLegacyId, byUrlKey }
}

function findTaxonomyByLegacyOrUrlKey ({ byLegacyId, byUrlKey }, legacyId, urlKey) {
  const byId = byLegacyId.get(Number(legacyId))
  if (byId) return byId
  const normalized = trimmed(urlKey).toLowerCase()
  if (!normalized) return undefined
  return byUrlKey.get(normalized)
}

function isDuplicateKeyError (error) {
  const message = String(error?.message || error || '')
  return message.includes('E11000') || message.includes('duplicate key') || message.includes('code 409')
}

function indexPosts (docs) {
  const byLegacyId = new Map()
  for (const doc of docs) {
    if (doc.type !== 'blog_post') continue
    byLegacyId.set(Number(doc.postId), doc)
  }
  return byLegacyId
}

async function loadCategoriesViaSdk (params) {
  const opened = await openBlogCategoriesDb(params)
  try {
    const docs = await opened.collection.find({ type: 'blog_category' }).toArray()
    return { docs, ...indexCategories(docs) }
  } finally {
    await opened.client.close()
  }
}

async function loadCategories (params, { preferSdk = false } = {}) {
  if (preferSdk) {
    try {
      return await loadCategoriesViaSdk(params)
    } catch (error) {
      console.warn(`SDK category read failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  const docs = loadDocumentsViaCli(BLOG_CATEGORIES_COLLECTION, { type: 'blog_category' })
  return { docs, ...indexCategories(docs) }
}

async function loadTagsViaSdk (params) {
  const opened = await openBlogTagsDb(params)
  try {
    const docs = await opened.collection.find({ type: 'blog_tag' }).toArray()
    return { docs, ...indexTags(docs) }
  } finally {
    await opened.client.close()
  }
}

async function loadTags (params, { preferSdk = false } = {}) {
  if (preferSdk) {
    try {
      return await loadTagsViaSdk(params)
    } catch (error) {
      console.warn(`SDK tag read failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  const docs = loadDocumentsViaCli(BLOG_TAGS_COLLECTION, { type: 'blog_tag' })
  return { docs, ...indexTags(docs) }
}

async function loadPostsViaSdk (params) {
  const opened = await openBlogPostsDb(params)
  try {
    const docs = []
    let skip = 0
    for (;;) {
      const batch = await opened.collection.find({ type: 'blog_post' })
        .skip(skip)
        .limit(READ_BATCH)
        .toArray()
      docs.push(...batch)
      if (batch.length < READ_BATCH) break
      skip += batch.length
    }
    return { docs, byLegacyId: indexPosts(docs) }
  } finally {
    await opened.client.close()
  }
}

async function loadPosts (params, { preferSdk = false } = {}) {
  if (preferSdk) {
    try {
      return await loadPostsViaSdk(params)
    } catch (error) {
      console.warn(`SDK post read failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  const docs = loadDocumentsViaCli(BLOG_POSTS_COLLECTION, { type: 'blog_post' })
  return { docs, byLegacyId: indexPosts(docs) }
}

function normalizeCategoryRecord (rawFields) {
  const title = trimmed(rawFields.title).slice(0, 255)
  const url_key = trimmed(rawFields.url_key).slice(0, 255)
  const is_active = rawFields.status !== 'disabled'
  let parent_id = null
  if (rawFields.parent_id != null && trimmed(rawFields.parent_id) !== '') {
    parent_id = Number(rawFields.parent_id)
    if (!Number.isInteger(parent_id) || parent_id <= 0) parent_id = null
  }
  const sortRaw = trimmed(rawFields.sort_order)
  const sort_order = sortRaw ? Math.trunc(Number(sortRaw)) : 0
  const display_mode = CATEGORY_DISPLAY_MODES.includes(rawFields.display_mode)
    ? rawFields.display_mode
    : 'blog_posts_only'
  return {
    title,
    url_key,
    is_active,
    parent_id,
    sort_order: Number.isFinite(sort_order) ? sort_order : 0,
    image: trimmed(rawFields.image).slice(0, 2000),
    image_title: trimmed(rawFields.image_title).slice(0, 255),
    image_alt: trimmed(rawFields.image_alt).slice(0, 255),
    display_mode,
    enable_description: rawFields.enable_description === true,
    description: trimmed(rawFields.description).slice(0, 100000),
    meta_title: trimmed(rawFields.meta_title).slice(0, 255),
    meta_keywords: trimmed(rawFields.meta_keywords).slice(0, 500),
    meta_description: trimmed(rawFields.meta_description).slice(0, 500),
    meta_prefix: trimmed(rawFields.meta_prefix).slice(0, 255),
    meta_suffix: trimmed(rawFields.meta_suffix).slice(0, 255)
  }
}

function collectTakenTagUrlKeys (docs) {
  const taken = new Set()
  for (const doc of docs || []) {
    if (doc?.type !== 'blog_tag') continue
    const key = trimmed(doc.url_key).toLowerCase()
    if (key) taken.add(key)
  }
  return taken
}

function assignUniqueTagUrlKey (document, takenUrlKeys) {
  const taken = takenUrlKeys || new Set()
  const title = trimmed(document.title)
  let urlKey = trimmed(document.url_key)
  if (urlKey) {
    urlKey = slugify(urlKey)
    if (!urlKey) urlKey = uniqueSlug(title, taken)
    else if (taken.has(urlKey.toLowerCase())) urlKey = uniqueSlug(urlKey, taken)
  } else {
    urlKey = uniqueSlug(title, taken)
  }
  taken.add(urlKey.toLowerCase())
  return { ...document, url_key: urlKey.slice(0, 255) }
}

function normalizeTagRecord (rawFields) {
  return {
    title: trimmed(rawFields.title).slice(0, 255),
    url_key: trimmed(rawFields.url_key).slice(0, 255),
    is_active: rawFields.is_active !== false,
    meta_title: trimmed(rawFields.meta_title).slice(0, 255),
    meta_keywords: trimmed(rawFields.meta_keywords).slice(0, 500),
    meta_description: trimmed(rawFields.meta_description).slice(0, 500),
    meta_prefix: trimmed(rawFields.meta_prefix).slice(0, 255),
    meta_suffix: trimmed(rawFields.meta_suffix).slice(0, 255)
  }
}

function buildTagDocument (legacyTagId, rawFields, existing) {
  const taxonomyId = Number(legacyTagId)
  if (!Number.isInteger(taxonomyId) || taxonomyId <= 0) {
    throw new Error(`Invalid legacy tag id: ${legacyTagId}`)
  }
  const now = new Date().toISOString()
  const record = normalizeTagRecord(rawFields)
  if (!record.title) throw new Error(`Tag ${taxonomyId} requires a title.`)
  if (existing) {
    return {
      ...existing,
      ...record,
      id: `tag:${taxonomyId}`,
      type: 'blog_tag',
      taxonomyId,
      updatedAt: now
    }
  }
  return {
    id: `tag:${taxonomyId}`,
    type: 'blog_tag',
    taxonomyId,
    ...record,
    createdAt: now,
    updatedAt: now
  }
}

function buildCategoryDocument (legacyCategoryId, rawFields, existing) {
  const taxonomyId = Number(legacyCategoryId)
  if (!Number.isInteger(taxonomyId) || taxonomyId <= 0) {
    throw new Error(`Invalid legacy category id: ${legacyCategoryId}`)
  }
  const now = new Date().toISOString()
  const record = normalizeCategoryRecord(rawFields)
  if (!record.title) throw new Error(`Category ${taxonomyId} requires a title.`)
  if (existing) {
    return {
      ...existing,
      ...record,
      id: `cat:${taxonomyId}`,
      type: 'blog_category',
      taxonomyId,
      updatedAt: now
    }
  }
  return {
    id: `cat:${taxonomyId}`,
    type: 'blog_category',
    taxonomyId,
    ...record,
    createdAt: now,
    updatedAt: now
  }
}

function normalizePostRecord (rawFields) {
  const viewRaw = Number(rawFields.view_count)
  return {
    title: trimmed(rawFields.title).slice(0, 255),
    url_key: trimmed(rawFields.url_key).slice(0, 255),
    use_short_content: rawFields.use_short_content === true,
    short_content: trimmed(rawFields.short_content).slice(0, 50000),
    content: String(rawFields.content ?? '').slice(0, 500000),
    featured_products_widget: rawFields.featured_products_widget === true,
    recommended_products_widget: rawFields.recommended_products_widget === true,
    featured_image: trimmed(rawFields.featured_image).slice(0, 2000),
    mobile_image: trimmed(rawFields.mobile_image).slice(0, 2000),
    featured_image_title: trimmed(rawFields.featured_image_title).slice(0, 255),
    featured_image_alt: trimmed(rawFields.featured_image_alt).slice(0, 255),
    featured_image_link: trimmed(rawFields.featured_image_link).slice(0, 2000),
    listing_image: trimmed(rawFields.listing_image).slice(0, 2000),
    listing_image_title: trimmed(rawFields.listing_image_title).slice(0, 255),
    listing_image_alt: trimmed(rawFields.listing_image_alt).slice(0, 255),
    status: rawFields.status === 'published' ? 'published' : 'draft',
    publish_at: trimmed(rawFields.publish_at),
    end_at: trimmed(rawFields.end_at),
    is_featured: rawFields.is_featured === true,
    is_recipe: rawFields.is_recipe === true,
    category_ids: idList(rawFields.category_ids),
    tag_ids: idList(rawFields.tag_ids),
    customer_group_ids: idList(rawFields.customer_group_ids),
    meta_title: trimmed(rawFields.meta_title).slice(0, 255),
    meta_keywords: trimmed(rawFields.meta_keywords).slice(0, 500),
    meta_description: trimmed(rawFields.meta_description).slice(0, 500),
    meta_prefix: trimmed(rawFields.meta_prefix).slice(0, 255),
    meta_suffix: trimmed(rawFields.meta_suffix).slice(0, 255),
    view_count: Number.isFinite(viewRaw) && viewRaw >= 0 ? Math.trunc(viewRaw) : 0
  }
}

function buildPostDocument (legacyPostId, rawFields, existing) {
  const postId = Number(legacyPostId)
  if (!Number.isInteger(postId) || postId <= 0) {
    throw new Error(`Invalid legacy post id: ${legacyPostId}`)
  }
  const now = new Date().toISOString()
  const record = normalizePostRecord(rawFields)
  if (!record.title) throw new Error(`Post ${postId} requires a title.`)
  if (existing) {
    return {
      ...existing,
      ...record,
      view_count: record.view_count > 0 ? record.view_count : (existing.view_count || 0),
      updatedAt: now
    }
  }
  return {
    id: `post:${postId}`,
    type: 'blog_post',
    postId,
    ...record,
    createdAt: now,
    updatedAt: now
  }
}

function tagUpsertSet (existing, document) {
  const set = { updatedAt: document.updatedAt }
  for (const key of [
    'title', 'url_key', 'is_active',
    'meta_title', 'meta_keywords', 'meta_description', 'meta_prefix', 'meta_suffix'
  ]) {
    if (document[key] !== undefined) set[key] = document[key]
  }
  return set
}

function categoryUpsertSet (existing, document) {
  const set = { updatedAt: document.updatedAt }
  for (const key of [
    'title', 'url_key', 'is_active', 'parent_id', 'sort_order', 'image', 'image_title', 'image_alt',
    'display_mode', 'enable_description', 'description',
    'meta_title', 'meta_keywords', 'meta_description', 'meta_prefix', 'meta_suffix'
  ]) {
    if (document[key] !== undefined) set[key] = document[key]
  }
  return set
}

function postUpsertSet (existing, document) {
  const set = { updatedAt: document.updatedAt }
  for (const key of [
    'title', 'url_key', 'use_short_content', 'short_content', 'content',
    'featured_products_widget', 'recommended_products_widget',
    'featured_image', 'mobile_image', 'featured_image_title', 'featured_image_alt', 'featured_image_link',
    'listing_image', 'listing_image_title', 'listing_image_alt',
    'status', 'publish_at', 'end_at', 'is_featured', 'is_recipe',
    'category_ids', 'tag_ids', 'customer_group_ids',
    'meta_title', 'meta_keywords', 'meta_description', 'meta_prefix', 'meta_suffix', 'view_count'
  ]) {
    if (document[key] !== undefined) set[key] = document[key]
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

async function upsertDocumentsViaSdk (params, collectionOpener, upserts, upsertSetFn, options = {}) {
  const opened = await collectionOpener(params)
  const documentType = options.documentType
  try {
    let written = 0
    const total = upserts.length
    const { onProgress, progressEvery = DEFAULT_PROGRESS_EVERY, verbose = false } = options
    for (const item of upserts) {
      const document = stripInternalFields(item.document)
      if (item.existing) {
        await opened.collection.replaceOne({ id: item.existing.id }, document)
      } else {
        try {
          await opened.collection.insertOne(document)
        } catch (error) {
          if (!isDuplicateKeyError(error) || !document.url_key || !documentType) throw error
          const found = await opened.collection.findOne({
            type: documentType,
            url_key: document.url_key
          })
          if (!found) throw error
          await opened.collection.replaceOne({ id: found.id }, document)
        }
      }
      written += 1
      reportProgress(onProgress, written, total, item, verbose, progressEvery)
    }
    return written
  } finally {
    await opened.client.close()
  }
}

function upsertDocumentsViaCli (collectionName, upserts, upsertSetFn, options = {}) {
  let written = 0
  const total = upserts.length
  const { onProgress, progressEvery = DEFAULT_PROGRESS_EVERY, verbose = false } = options
  for (const item of upserts) {
    if (item.existing) {
      aioUpdateDocument(
        collectionName,
        { id: item.existing.id },
        upsertSetFn(item.existing, item.document)
      )
    } else {
      aioInsertDocuments(collectionName, item.document)
    }
    written += 1
    reportProgress(onProgress, written, total, item, verbose, progressEvery)
  }
  return written
}

async function upsertTags (params, upserts, options = {}) {
  const { preferSdk = false } = options
  if (preferSdk) {
    try {
      return await upsertDocumentsViaSdk(
        params,
        openBlogTagsDb,
        upserts,
        tagUpsertSet,
        { ...options, documentType: 'blog_tag' }
      )
    } catch (error) {
      if (options.preferSdk) throw error
      console.warn(`SDK tag write failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  return upsertDocumentsViaCli(BLOG_TAGS_COLLECTION, upserts, tagUpsertSet, options)
}

async function upsertCategories (params, upserts, options = {}) {
  const { preferSdk = false } = options
  if (preferSdk) {
    try {
      return await upsertDocumentsViaSdk(
        params,
        openBlogCategoriesDb,
        upserts,
        categoryUpsertSet,
        { ...options, documentType: 'blog_category' }
      )
    } catch (error) {
      if (options.preferSdk) throw error
      console.warn(`SDK category write failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  return upsertDocumentsViaCli(BLOG_CATEGORIES_COLLECTION, upserts, categoryUpsertSet, options)
}

async function upsertPosts (params, upserts, options = {}) {
  const { preferSdk = false } = options
  if (preferSdk) {
    try {
      return await upsertDocumentsViaSdk(
        params,
        openBlogPostsDb,
        upserts,
        postUpsertSet,
        { ...options, documentType: 'blog_post' }
      )
    } catch (error) {
      if (options.preferSdk) throw error
      console.warn(`SDK post write failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  return upsertDocumentsViaCli(BLOG_POSTS_COLLECTION, upserts, postUpsertSet, options)
}

async function bumpCategoryCounter (params, minimumNextId, { preferSdk = false } = {}) {
  const nextId = Math.max(1, Number(minimumNextId) || 1)
  if (preferSdk) {
    const opened = await openBlogCategoriesDb(params)
    try {
      const existing = await opened.collection.findOne({ id: BLOG_CATEGORY_COUNTER_ID })
      const counterDoc = {
        id: BLOG_CATEGORY_COUNTER_ID,
        type: 'counter',
        nextId: Math.max(Number(existing?.nextId) || 1, nextId)
      }
      if (existing) await opened.collection.replaceOne({ id: BLOG_CATEGORY_COUNTER_ID }, counterDoc)
      else await opened.collection.insertOne(counterDoc)
      return
    } finally {
      await opened.client.close()
    }
  }
  const filter = { id: BLOG_CATEGORY_COUNTER_ID }
  const existing = loadDocumentsViaCli(BLOG_CATEGORIES_COLLECTION, filter)[0]
  const counterDoc = {
    id: BLOG_CATEGORY_COUNTER_ID,
    type: 'counter',
    nextId: Math.max(Number(existing?.nextId) || 1, nextId)
  }
  if (existing) aioReplaceDocument(BLOG_CATEGORIES_COLLECTION, filter, counterDoc)
  else aioInsertDocuments(BLOG_CATEGORIES_COLLECTION, counterDoc)
}

async function bumpTagCounter (params, minimumNextId, { preferSdk = false } = {}) {
  const nextId = Math.max(1, Number(minimumNextId) || 1)
  if (preferSdk) {
    const opened = await openBlogTagsDb(params)
    try {
      const existing = await opened.collection.findOne({ id: BLOG_TAG_COUNTER_ID })
      const counterDoc = {
        id: BLOG_TAG_COUNTER_ID,
        type: 'counter',
        nextId: Math.max(Number(existing?.nextId) || 1, nextId)
      }
      if (existing) await opened.collection.replaceOne({ id: BLOG_TAG_COUNTER_ID }, counterDoc)
      else await opened.collection.insertOne(counterDoc)
      return
    } finally {
      await opened.client.close()
    }
  }
  const filter = { id: BLOG_TAG_COUNTER_ID }
  const existing = loadDocumentsViaCli(BLOG_TAGS_COLLECTION, filter)[0]
  const counterDoc = {
    id: BLOG_TAG_COUNTER_ID,
    type: 'counter',
    nextId: Math.max(Number(existing?.nextId) || 1, nextId)
  }
  if (existing) aioReplaceDocument(BLOG_TAGS_COLLECTION, filter, counterDoc)
  else aioInsertDocuments(BLOG_TAGS_COLLECTION, counterDoc)
}

async function bumpPostCounter (params, minimumNextId, { preferSdk = false } = {}) {
  const nextId = Math.max(1, Number(minimumNextId) || 1)
  if (preferSdk) {
    const opened = await openBlogPostsDb(params)
    try {
      const existing = await opened.collection.findOne({ id: BLOG_POST_COUNTER_ID })
      const counterDoc = {
        id: BLOG_POST_COUNTER_ID,
        type: 'counter',
        nextId: Math.max(Number(existing?.nextId) || 1, nextId)
      }
      if (existing) await opened.collection.replaceOne({ id: BLOG_POST_COUNTER_ID }, counterDoc)
      else await opened.collection.insertOne(counterDoc)
      return
    } finally {
      await opened.client.close()
    }
  }
  const filter = { id: BLOG_POST_COUNTER_ID }
  const existing = loadDocumentsViaCli(BLOG_POSTS_COLLECTION, filter)[0]
  const counterDoc = {
    id: BLOG_POST_COUNTER_ID,
    type: 'counter',
    nextId: Math.max(Number(existing?.nextId) || 1, nextId)
  }
  if (existing) aioReplaceDocument(BLOG_POSTS_COLLECTION, filter, counterDoc)
  else aioInsertDocuments(BLOG_POSTS_COLLECTION, counterDoc)
}

function tagComparable (doc) {
  return JSON.stringify(normalizeTagRecord(doc))
}

function categoryComparable (doc) {
  return JSON.stringify(normalizeCategoryRecord({
    title: doc.title,
    url_key: doc.url_key,
    status: doc.is_active === false ? 'disabled' : 'enabled',
    parent_id: doc.parent_id,
    sort_order: doc.sort_order,
    image: doc.image,
    image_title: doc.image_title,
    image_alt: doc.image_alt,
    display_mode: doc.display_mode,
    enable_description: doc.enable_description,
    description: doc.description,
    meta_title: doc.meta_title,
    meta_keywords: doc.meta_keywords,
    meta_description: doc.meta_description,
    meta_prefix: doc.meta_prefix,
    meta_suffix: doc.meta_suffix
  }))
}

function postComparable (doc) {
  return JSON.stringify(normalizePostRecord(doc))
}

module.exports = {
  openBlogCategoriesDb,
  openBlogTagsDb,
  openBlogPostsDb,
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
}
