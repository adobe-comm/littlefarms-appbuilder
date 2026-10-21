const { CATEGORY_DISPLAY_MODES } = require('../../../actions/blog/lib/constants')
const { legacyBlogMediaUrl, isAbsoluteUrl } = require('./legacy-media-urls')

function trimmed (value) {
  return String(value ?? '').trim()
}

function csvBool (value) {
  const text = trimmed(value)
  if (text === '') return undefined
  return text === '1' || text.toLowerCase() === 'true'
}

function parseLegacyDateTime (value) {
  const raw = trimmed(value)
  if (!raw) return ''
  const date = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function blogImageField (row, urlKey, fileKey, mediaBase) {
  const url = trimmed(row[urlKey])
  if (url && isAbsoluteUrl(url)) return url.replace(/\/\/media\//, '/media/')
  const file = trimmed(row[fileKey])
  if (file) return legacyBlogMediaUrl(file, mediaBase)
  return ''
}

function splitCsvNames (value) {
  return [...new Set(
    trimmed(value)
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
  )]
}

function mapCsvRowToCategoryFields (row, mediaBase) {
  const fields = {}
  const skipped = []

  const title = trimmed(row.name)
  if (title) fields.title = title

  const urlKey = trimmed(row.url_key)
  if (urlKey) fields.url_key = urlKey

  const statusFlag = csvBool(row.status)
  if (statusFlag !== undefined) {
    fields.status = statusFlag ? 'enabled' : 'disabled'
  }

  const sortOrder = trimmed(row.sort_order)
  if (sortOrder !== '') fields.sort_order = String(Math.trunc(Number(sortOrder)))

  const parentId = trimmed(row.parent_id)
  if (parentId !== '' && parentId !== '0') fields.parent_id = String(Math.trunc(Number(parentId)))

  const displayMode = trimmed(row.display_mode)
  if (displayMode && CATEGORY_DISPLAY_MODES.includes(displayMode)) {
    fields.display_mode = displayMode
  }

  const enableDescription = csvBool(row.is_description_enabled)
  if (enableDescription !== undefined) fields.enable_description = enableDescription

  const description = trimmed(row.description)
  if (description) fields.description = description

  fields.image = blogImageField(row, 'image_url', 'image_file_name', mediaBase)
  const imageTitle = trimmed(row.image_title)
  if (imageTitle) fields.image_title = imageTitle
  const imageAlt = trimmed(row.image_alt)
  if (imageAlt) fields.image_alt = imageAlt

  for (const [csvKey, fieldKey] of [
    ['meta_title', 'meta_title'],
    ['meta_keywords', 'meta_keywords'],
    ['meta_description', 'meta_description'],
    ['meta_prefix', 'meta_prefix'],
    ['meta_suffix', 'meta_suffix']
  ]) {
    const value = trimmed(row[csvKey])
    if (value) fields[fieldKey] = value
  }

  if (!title && !urlKey) skipped.push('empty_row')

  return { fields, skipped, legacyCategoryId: trimmed(row.id) }
}

function mapLegacyPostStatus (value) {
  const raw = trimmed(value).toLowerCase()
  if (raw === 'publication' || raw === 'published' || raw === 'publish') return 'published'
  if (raw === 'draft' || raw === 'disabled') return 'draft'
  return raw ? 'draft' : undefined
}

function mapCsvRowToPostFields (row, mediaBase) {
  const fields = {}
  const skipped = []

  const title = trimmed(row.title)
  if (title) fields.title = title

  const urlKey = trimmed(row.url_key)
  if (urlKey) fields.url_key = urlKey

  const content = trimmed(row.content)
  if (content) fields.content = content

  const shortContent = trimmed(row.short_content)
  if (shortContent) fields.short_content = shortContent

  const status = mapLegacyPostStatus(row.status)
  if (status) fields.status = status

  const publishAt = parseLegacyDateTime(row.publish_date)
  if (publishAt) fields.publish_at = publishAt

  const endAt = parseLegacyDateTime(row.end_date)
  if (endAt) fields.end_at = endAt

  const featured = csvBool(row.is_featured)
  if (featured !== undefined) fields.is_featured = featured

  const recipe = csvBool(row.is_recipe)
  if (recipe !== undefined) fields.is_recipe = recipe

  const viewCount = trimmed(row.post_view)
  if (viewCount !== '') {
    const count = Math.trunc(Number(viewCount))
    if (Number.isFinite(count) && count >= 0) fields.view_count = count
  }

  fields.featured_image = blogImageField(row, 'featured_image_url', 'featured_image_file', mediaBase)
  fields.listing_image = blogImageField(row, 'listing_image_url', 'listing_image_file', mediaBase)
  fields.mobile_image = blogImageField(row, 'featured_image_mobile_url', 'featured_image_mobile_file', mediaBase)

  for (const [csvKey, fieldKey] of [
    ['featured_image_title', 'featured_image_title'],
    ['featured_image_alt', 'featured_image_alt'],
    ['featured_image_link', 'featured_image_link'],
    ['listing_image_title', 'listing_image_title'],
    ['listing_image_alt', 'listing_image_alt'],
    ['meta_title', 'meta_title'],
    ['meta_keywords', 'meta_keywords'],
    ['meta_description', 'meta_description'],
    ['meta_prefix', 'meta_prefix'],
    ['meta_suffix', 'meta_suffix']
  ]) {
    const value = trimmed(row[csvKey])
    if (value) fields[fieldKey] = value
  }

  const customerGroups = trimmed(row.customer_groups).toLowerCase()
  if (customerGroups === 'all' || customerGroups === '') {
    fields.customer_group_ids = []
  } else if (customerGroups) {
    fields.customer_group_ids = splitCsvNames(row.customer_groups).filter(id => /^\d+$/.test(id))
  }

  fields.featured_products_widget = Boolean(trimmed(row.featured_products))
  fields.recommended_products_widget = Boolean(trimmed(row.recommended_products))
  fields.use_short_content = false

  if (!title && !urlKey) skipped.push('empty_row')

  return {
    fields,
    skipped,
    legacyPostId: trimmed(row.id),
    categoryNames: splitCsvNames(row.category_names),
    tagNames: splitCsvNames(row.tag_names),
    canonicalCategoryId: trimmed(row.canonical_category_id)
  }
}

function buildCategoryTitleIndex (categoryRows) {
  const byTitle = new Map()
  for (const row of categoryRows) {
    const id = trimmed(row.id)
    const title = trimmed(row.name).toLowerCase()
    if (id && title) byTitle.set(title, id)
  }
  return byTitle
}

/**
 * Post CSV: category_names (comma-separated titles) and optional canonical_category_id.
 * Legacy Blog_category.csv id → taxonomyId in DB, so ids from the category CSV are trusted.
 */
function mapCsvRowToTagFields (row) {
  const fields = {}
  const skipped = []

  const title = trimmed(row.name)
  if (title) fields.title = title

  const urlKey = trimmed(row.url_key)
  if (urlKey) fields.url_key = urlKey

  fields.is_active = true

  for (const [csvKey, fieldKey] of [
    ['meta_title', 'meta_title'],
    ['meta_keywords', 'meta_keywords'],
    ['meta_description', 'meta_description'],
    ['meta_prefix', 'meta_prefix'],
    ['meta_suffix', 'meta_suffix']
  ]) {
    const value = trimmed(row[csvKey])
    if (value) fields[fieldKey] = value
  }

  if (!title) skipped.push('empty_row')

  return { fields, skipped, legacyTagId: trimmed(row.id) }
}

function buildTagTitleIndex (tagRows) {
  const byTitle = new Map()
  for (const row of tagRows) {
    const id = trimmed(row.id)
    const title = trimmed(row.name).toLowerCase()
    if (id && title) byTitle.set(title, id)
  }
  return byTitle
}

/** Legacy tag ids present in Blog_post_tag.csv (for numeric tokens in Blog.csv tag_names). */
function buildTagLegacyIdSet (tagRows) {
  const ids = new Set()
  for (const row of tagRows) {
    const id = trimmed(row.id)
    if (id && /^\d+$/.test(id)) ids.add(id)
  }
  return ids
}

/** Legacy tag CSV post_ids column → postId → [tag legacy ids]. */
function buildPostTagsFromTagExport (tagRows) {
  const byPostId = new Map()
  for (const row of tagRows) {
    const tagLegacyId = trimmed(row.id)
    if (!tagLegacyId) continue
    for (const postId of splitCsvNames(row.post_ids)) {
      if (!/^\d+$/.test(postId)) continue
      const list = byPostId.get(postId) || []
      if (!list.includes(tagLegacyId)) list.push(tagLegacyId)
      byPostId.set(postId, list)
    }
  }
  return byPostId
}

function mergeTaxonomyIdLists (...lists) {
  const out = []
  const seen = new Set()
  for (const list of lists) {
    for (const raw of list || []) {
      const id = String(raw).trim()
      if (!id || id === '0' || seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

function resolvePostTagIds ({ tagNames, byLegacyId, csvTitleIndex, csvLegacyIds }) {
  const ids = []
  const seen = new Set()
  const add = (rawId) => {
    const id = String(rawId).trim()
    if (!id || id === '0' || seen.has(id)) return
    seen.add(id)
    ids.push(id)
  }

  for (const name of tagNames) {
    if (/^\d+$/.test(name)) {
      if (csvLegacyIds?.has(name) || byLegacyId.has(Number(name))) {
        add(name)
      }
      continue
    }
    const fromCsv = csvTitleIndex.get(name.toLowerCase())
    if (fromCsv) {
      add(fromCsv)
      continue
    }
    for (const [taxonomyId, doc] of byLegacyId.entries()) {
      if (trimmed(doc.title).toLowerCase() === name.toLowerCase()) {
        add(taxonomyId)
        break
      }
    }
  }

  return ids
}

function resolvePostCategoryIds ({ categoryNames, canonicalCategoryId, byLegacyId, csvTitleIndex }) {
  const ids = []
  const seen = new Set()
  const add = (rawId, { requireInDb = false } = {}) => {
    const id = String(rawId).trim()
    if (!id || id === '0' || seen.has(id)) return
    if (requireInDb && !byLegacyId.has(Number(id))) return
    seen.add(id)
    ids.push(id)
  }

  for (const name of categoryNames) {
    const fromCsv = csvTitleIndex.get(name.toLowerCase())
    if (fromCsv) {
      add(fromCsv)
      continue
    }
    for (const [taxonomyId, doc] of byLegacyId.entries()) {
      if (trimmed(doc.title).toLowerCase() === name.toLowerCase()) {
        add(taxonomyId)
        break
      }
    }
  }

  if (canonicalCategoryId) add(canonicalCategoryId)

  return ids
}

function hasImportableFields ({ fields, skipped }) {
  if (skipped.includes('empty_row')) return false
  return Object.keys(fields).length > 0
}

function stripLegacyBlogMediaUrls (fields) {
  const host = 'mcstaging.littlefarms.com'
  for (const key of [
    'featured_image',
    'listing_image',
    'mobile_image',
    'image'
  ]) {
    const value = trimmed(fields[key])
    if (value && value.includes(host)) delete fields[key]
  }
}

module.exports = {
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
  hasImportableFields,
  stripLegacyBlogMediaUrls,
  splitCsvNames
}
