const { ALL_STORE_VIEWS } = require('../../../actions/location/lib/location-store')
const { legacyLocationMediaUrl, legacyTeamProfileMediaUrl, isAbsoluteUrl } = require('./legacy-media-urls')

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_NAME_TO_KEY = {
  monday: 'monday',
  tuesday: 'tuesday',
  wednesday: 'wednesday',
  thursday: 'thursday',
  friday: 'friday',
  saturday: 'saturday',
  sunday: 'sunday'
}

function trimmed (value) {
  return String(value ?? '').trim()
}

function csvBool (value) {
  const text = trimmed(value)
  if (text === '') return undefined
  return text === '1' || text.toLowerCase() === 'true'
}

function normalizeTime24 (value) {
  const raw = trimmed(value)
  if (!raw) return ''
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return ''
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return ''
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function emptyWeekHours () {
  const hours = {}
  for (const day of DAY_KEYS) {
    hours[day] = { open: false, from: '', to: '' }
  }
  return hours
}

function dayKeyFromLegacyName (name, index) {
  const needle = trimmed(name).toLowerCase()
  if (needle && DAY_NAME_TO_KEY[needle]) return DAY_NAME_TO_KEY[needle]
  return DAY_KEYS[index] || DAY_KEYS[0]
}

function parseLegacyHours (jsonText) {
  const hours = emptyWeekHours()
  const raw = trimmed(jsonText)
  if (!raw) return hours

  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return hours
  }

  const weekdayOn = data.weekday_on && typeof data.weekday_on === 'object' ? data.weekday_on : {}
  const hoursFrom = data.hours_from && typeof data.hours_from === 'object' ? data.hours_from : {}
  const hoursTo = data.hours_to && typeof data.hours_to === 'object' ? data.hours_to : {}
  const hasWeekdayLabels = Object.keys(weekdayOn).some(key => trimmed(weekdayOn[key]))

  for (let index = 0; index < 7; index += 1) {
    const dayKey = dayKeyFromLegacyName(weekdayOn[`weekday_on${index}`], index)
    const from = normalizeTime24(hoursFrom[`hours_from${index}`])
    const to = normalizeTime24(hoursTo[`hours_to${index}`])
    const hasTimes = Boolean(from && to)
    const open = hasWeekdayLabels
      ? Boolean(trimmed(weekdayOn[`weekday_on${index}`]) && hasTimes)
      : hasTimes
    hours[dayKey] = { open, from, to }
  }

  return hours
}

function mediaField (relativePath, mediaBase) {
  const path = trimmed(relativePath)
  if (!path) return ''
  return legacyLocationMediaUrl(path, mediaBase)
}

function parseServiceIds (value) {
  return [...new Set(
    trimmed(value)
      .split(',')
      .map(part => part.trim())
      .filter(part => /^\d+$/.test(part))
  )]
}

function mapCsvRowToServiceFields (row, mediaBase) {
  const fields = {}
  const skipped = []

  const title = trimmed(row.title)
  if (title) fields.title = title

  const serviceUrl = trimmed(row.url)
  if (serviceUrl) fields.serviceUrl = serviceUrl

  const statusFlag = csvBool(row.status)
  if (statusFlag !== undefined) {
    fields.status = statusFlag ? 'enabled' : 'disabled'
  }

  const icon = mediaField(row.icon, mediaBase)
  if (icon) fields.icon = icon

  if (!title && !serviceUrl && !icon) {
    skipped.push('empty_row')
  }

  return { fields, skipped, legacyServiceId: trimmed(row.id) }
}

function mapCsvRowToTeamFields (row, mediaBase) {
  const fields = {}
  const skipped = []

  const name = trimmed(row.name)
  if (name) fields.name = name

  const jobTitle = trimmed(row.job_title)
  if (jobTitle) fields.jobTitle = jobTitle

  const statusFlag = csvBool(row.status)
  if (statusFlag !== undefined) {
    fields.status = statusFlag ? 'enabled' : 'disabled'
  }

  const sortOrder = trimmed(row.sort_order)
  if (sortOrder !== '') fields.sortOrder = String(Math.trunc(Number(sortOrder)))

  const imageUrl = trimmed(row.image_url)
  const imageFile = trimmed(row.image)
  if (imageUrl && isAbsoluteUrl(imageUrl)) {
    fields.image = imageUrl.replace(/\/\/media\//, '/media/')
  } else if (imageFile) {
    fields.image = legacyTeamProfileMediaUrl(imageFile, mediaBase)
  }

  if (!name && !jobTitle && !fields.image) {
    skipped.push('empty_row')
  }

  return { fields, skipped, legacyProfileId: trimmed(row.id) }
}

function parseLegacyIdList (value) {
  return [...new Set(
    trimmed(value)
      .split(',')
      .map(part => part.trim())
      .filter(part => /^\d+$/.test(part))
  )]
}

/** location_id → ordered profile id strings (legacy team CSV `location_ids`). */
function buildTeamLinksByLocationId (teamRows) {
  const map = new Map()
  for (const row of teamRows) {
    const profileId = trimmed(row.id)
    if (!profileId) continue
    const locationIds = parseLegacyIdList(row.location_ids)
    const sortOrder = Number(row.sort_order)
    const order = Number.isFinite(sortOrder) ? sortOrder : 0
    for (const locationId of locationIds) {
      const key = Number(locationId)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push({ profileId, order })
    }
  }
  for (const [locationId, entries] of map) {
    entries.sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order
      return Number(left.profileId) - Number(right.profileId)
    })
    map.set(locationId, entries.map(entry => entry.profileId))
  }
  return map
}

function mapCsvRowToLocationFields (row, { mediaBase = '' } = {}) {
  const fields = {}
  const skipped = []

  if (trimmed(row.store_gallery)) skipped.push('store_gallery')

  const textMap = [
    ['title', 'title'],
    ['description', 'description'],
    ['city', 'city'],
    ['street', 'street'],
    ['zip', 'zip'],
    ['phone', 'phone'],
    ['email', 'email'],
    ['store_url', 'storeUrl'],
    ['meta_title', 'metaTitle'],
    ['meta_keywords', 'metaKeywords'],
    ['meta_description', 'metaDescription'],
    ['content', 'storeContent'],
    ['travel_suggestion', 'travelSuggestion'],
    ['store_promotions', 'promotions'],
    ['store_gallery_title', 'galleryTitle'],
    ['store_gallery_description', 'galleryDescription'],
    ['website_url', 'websiteUrl']
  ]

  for (const [csvKey, fieldKey] of textMap) {
    const value = trimmed(row[csvKey])
    if (value) fields[fieldKey] = value
  }

  const country = trimmed(row.country_id)
  if (country) fields.country = country

  const state = trimmed(row.region_name)
  if (state) fields.state = state

  const sortOrder = trimmed(row.sort_order)
  if (sortOrder !== '') fields.sortOrder = String(Math.trunc(Number(sortOrder)))

  const statusFlag = csvBool(row.status)
  if (statusFlag !== undefined) {
    fields.status = statusFlag ? 'enabled' : 'disabled'
  }

  const featured = csvBool(row.is_featured)
  if (featured !== undefined) fields.isFeatured = featured

  const isStore = csvBool(row.is_store)
  if (isStore !== undefined) fields.isStore = isStore

  const isCafe = csvBool(row.is_cafe)
  if (isCafe !== undefined) fields.isCafe = isCafe

  const openTab = csvBool(row.open_in_new_tab)
  if (openTab !== undefined) fields.openInNewTab = openTab

  fields.storeViews = [ALL_STORE_VIEWS]

  const mapNumbers = [
    ['zoom', 'zoom'],
    ['latitude', 'latitude'],
    ['longitude', 'longitude']
  ]
  for (const [csvKey, fieldKey] of mapNumbers) {
    const value = trimmed(row[csvKey])
    if (value !== '') fields[fieldKey] = value
  }

  const mediaMap = [
    ['image', 'locationImage'],
    ['custom_marker', 'mapMarker'],
    ['banner', 'storeBanner'],
    ['logo', 'logo']
  ]
  for (const [csvKey, fieldKey] of mediaMap) {
    const url = mediaField(row[csvKey], mediaBase)
    if (url) fields[fieldKey] = url
  }

  fields.storeHours = parseLegacyHours(row.hoursofoperation)
  fields.cafeHours = parseLegacyHours(row.cafehoursofoperation)

  const serviceIds = parseServiceIds(row.service_ids)
  if (serviceIds.length) fields.services = serviceIds

  const teamFromRow = parseServiceIds(row.store_team)
  if (teamFromRow.length) fields.teamProfiles = teamFromRow

  return {
    fields,
    skipped,
    legacyLocationId: trimmed(row.location_id)
  }
}

function hasImportableFields ({ fields }) {
  return Object.keys(fields).length > 0
}

function fieldDiff (current, fields) {
  const changes = {}
  for (const [key, nextValue] of Object.entries(fields)) {
    const prevValue = current[key]
    if (JSON.stringify(prevValue) !== JSON.stringify(nextValue)) {
      changes[key] = { from: prevValue, to: nextValue }
    }
  }
  return changes
}

const LEGACY_MEDIA_HOST = 'mcstaging.littlefarms.com/media/aheadworks/store_locator'

function stripLegacyMediaUrls (fields) {
  for (const key of ['logo', 'locationImage', 'mapMarker', 'storeBanner', 'icon', 'image']) {
    const value = trimmed(fields[key])
    if (value && value.includes(LEGACY_MEDIA_HOST)) {
      delete fields[key]
    }
  }
}

module.exports = {
  mapCsvRowToLocationFields,
  mapCsvRowToServiceFields,
  mapCsvRowToTeamFields,
  buildTeamLinksByLocationId,
  parseLegacyHours,
  hasImportableFields,
  fieldDiff,
  stripLegacyMediaUrls,
  parseServiceIds,
  parseLegacyIdList
}
