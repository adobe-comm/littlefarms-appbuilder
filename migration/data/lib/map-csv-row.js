const { slugify } = require('../../../actions/brand/lib/slug')

function trimmed (value) {
  return String(value ?? '').trim()
}

function csvBool (value) {
  const text = trimmed(value)
  if (text === '') return undefined
  return text === '1' || text.toLowerCase() === 'true'
}

function mapCsvRowToBrandFields (row) {
  const fields = {}
  const skipped = []

  if (trimmed(row.top_cms_block_id) || trimmed(row.bottom_cms_block_id) ||
      trimmed(row.top_cms_identifier) || trimmed(row.bottom_cms_identifier)) {
    skipped.push('cms_blocks')
  }

  const textMap = [
    ['description', 'description'],
    ['short_description', 'short_description'],
    ['meta_description', 'meta_description'],
    ['meta_keywords', 'meta_keywords'],
    ['image', 'image'],
    ['image_alt', 'image_alt'],
    ['slider_image', 'small_image'],
    ['small_image_alt', 'small_image_alt']
  ]

  for (const [csvKey, brandKey] of textMap) {
    const value = trimmed(row[csvKey])
    if (value) fields[brandKey] = value
  }

  const metaTitle = trimmed(row.meta_title)
  if (metaTitle) {
    fields.meta_title = metaTitle
    fields.meta_title_use_default = false
  }

  const pageTitle = trimmed(row.title)
  if (pageTitle) {
    fields.page_title = pageTitle
    fields.page_title_use_default = false
  }

  const urlAlias = trimmed(row.url_alias)
  if (urlAlias) fields.url_alias = slugify(urlAlias)

  const boolMap = [
    ['is_active', 'is_active'],
    ['is_featured', 'is_featured'],
    ['is_new_brand', 'is_new_brand'],
    ['is_top_brand', 'is_top_brand'],
    ['is_show_in_widget', 'show_in_brand_list_widget'],
    ['is_show_in_slider', 'show_in_brand_slider_widget']
  ]

  for (const [csvKey, brandKey] of boolMap) {
    const value = csvBool(row[csvKey])
    if (value !== undefined) fields[brandKey] = value
  }

  const sliderPosition = trimmed(row.slider_position)
  if (sliderPosition !== '' && sliderPosition !== '0') {
    const position = Number(sliderPosition)
    if (Number.isFinite(position)) fields.slider_position = Math.trunc(position)
  }

  return { fields, skipped }
}

function hasImportableFields ({ fields }) {
  return Object.keys(fields).length > 0
}

function fieldDiff (current, fields) {
  const changes = {}
  for (const [key, nextValue] of Object.entries(fields)) {
    const prevValue = current[key]
    if (typeof nextValue === 'boolean') {
      if (prevValue !== nextValue) changes[key] = { from: prevValue, to: nextValue }
      continue
    }
    if (typeof nextValue === 'number') {
      if (Number(prevValue) !== nextValue) changes[key] = { from: prevValue, to: nextValue }
      continue
    }
    if (String(prevValue ?? '').trim() !== String(nextValue ?? '').trim()) {
      changes[key] = { from: prevValue ?? '', to: nextValue }
    }
  }
  return changes
}

function stripLegacyMediaFilenames (fields) {
  for (const key of ['image', 'small_image']) {
    const value = String(fields[key] ?? '').trim()
    if (value && !/^https?:\/\//i.test(value)) delete fields[key]
  }
}

module.exports = {
  mapCsvRowToBrandFields,
  hasImportableFields,
  fieldDiff,
  stripLegacyMediaFilenames
}
