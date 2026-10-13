const { Core } = require('@adobe/aio-sdk')
const libDb = require('@adobe/aio-lib-db')

const { resolveEnvironmentId } = require('../../block/lib/app-scope')

const LOCATIONS_COLLECTION = 'littlefarms_locations'
const READ_BATCH = 100
const MAX_LOCATIONS = 5000
const PAGE_SIZES = [20, 30, 50, 100, 200]
const DEFAULT_PAGE_SIZE = 20
const ALL_STORE_VIEWS = 'All Store Views'

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

async function openLocationDb (params) {
  const token = await Core.AuthClient.generateAccessToken(params)
  const db = await libDb.init({
    token: token.access_token,
    region: params.DB_REGION || 'amer'
  })
  const client = await db.connect()
  const locations = await ensureCollection(client, LOCATIONS_COLLECTION)
  return { client, locations }
}

function text (value) {
  return String(value ?? '').trim()
}

function includesText (value, query) {
  const needle = text(query).toLowerCase()
  if (!needle) return true
  return text(value).toLowerCase().includes(needle)
}

function idBound (value) {
  const raw = text(value)
  if (!raw) return null
  if (!/^\d+$/.test(raw)) return Number.NaN
  return Number(raw)
}

function pageSizeOf (value) {
  const size = Number(value)
  return PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE
}

function publicLocation (doc) {
  return {
    locationId: doc.locationId,
    title: doc.title || '',
    storeViewLabel: viewLabel(doc),
    country: doc.country || '',
    city: doc.city || '',
    street: doc.street || '',
    phone: doc.phone || '',
    email: doc.email || '',
    websiteUrl: doc.websiteUrl || '',
    zip: doc.zip || '',
    status: doc.status === 'disabled' ? 'disabled' : 'enabled'
  }
}

/** General Information fields for storefront directory (enabled locations only). */
function generalStorefront (doc) {
  const form = toForm(doc)
  return {
    locationId: form.locationId,
    title: form.title,
    storeUrl: form.storeUrl,
    country: form.country,
    state: form.state,
    city: form.city,
    street: form.street,
    zip: form.zip,
    phone: form.phone,
    email: form.email,
    websiteUrl: form.websiteUrl,
    openInNewTab: form.openInNewTab,
    storeViews: form.storeViews,
    storeViewLabel: viewLabel(doc),
    description: form.description,
    sortOrder: form.sortOrder,
    logo: form.logo,
    locationImage: form.locationImage,
    mapMarker: form.mapMarker,
    metaTitle: form.metaTitle,
    metaKeywords: form.metaKeywords,
    metaDescription: form.metaDescription,
    isFeatured: form.isFeatured
  }
}

function isEnabledLocation (doc) {
  return doc && doc.status !== 'disabled'
}

function sortStorefront (left, right) {
  const leftOrder = Number(text(left.sortOrder))
  const rightOrder = Number(text(right.sortOrder))
  const leftSort = Number.isFinite(leftOrder) ? leftOrder : 999999
  const rightSort = Number.isFinite(rightOrder) ? rightOrder : 999999
  if (leftSort !== rightSort) return leftSort - rightSort
  return left.locationId - right.locationId
}

function matchesStorefront (doc, filters = {}) {
  if (!isEnabledLocation(doc)) return false
  if (text(filters.country) && text(doc.country) !== text(filters.country)) return false
  if (!includesText(doc.city, filters.city)) return false
  if (!includesText(doc.title, filters.title)) return false
  if (filters.isFeatured === true && doc.isFeatured !== true) return false
  return true
}

function matchesFilters (doc, filters) {
  const from = idBound(filters.idFrom)
  const to = idBound(filters.idTo)
  if (Number.isNaN(from) || Number.isNaN(to)) return false
  if (from != null && doc.locationId < from) return false
  if (to != null && doc.locationId > to) return false
  if (!includesText(doc.title, filters.title)) return false
  if (text(filters.country) && text(doc.country) !== text(filters.country)) return false
  if (!includesText(doc.city, filters.city)) return false
  if (!includesText(doc.street, filters.street)) return false
  if (!includesText(doc.phone, filters.phone)) return false
  if (!includesText(doc.email, filters.email)) return false
  if (!includesText(doc.websiteUrl, filters.websiteUrl)) return false
  if (!includesText(doc.zip, filters.zip)) return false
  if (filters.status === 'enabled' && doc.status === 'disabled') return false
  if (filters.status === 'disabled' && doc.status !== 'disabled') return false
  return true
}

function locationIds (value) {
  const source = Array.isArray(value) ? value : []
  return [...new Set(source.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))]
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const REGIONS_REQUIRED = new Set(['AL', 'AR', 'AU', 'BG', 'BO', 'BR', 'BY', 'CA', 'CH', 'CL', 'CN', 'CO', 'CR', 'CZ', 'DK', 'EC', 'EE', 'ES', 'GR', 'GY', 'HR', 'IN', 'IS', 'IT', 'LT', 'LV', 'MX', 'PE', 'PL', 'PT', 'PY', 'RO', 'SE', 'SR', 'UA', 'US', 'UY', 'VE'])
const STORE_VIEWS = ['All Store Views', 'Main Website', 'Main Website Store', 'Default Store View']
const TEXT_LIMITS = {
  title: 255,
  storeUrl: 255,
  country: 120,
  state: 120,
  city: 120,
  street: 500,
  zip: 32,
  phone: 64,
  description: 5000,
  metaTitle: 255,
  metaKeywords: 500,
  metaDescription: 500,
  travelSuggestion: 5000,
  storeContent: 100000,
  galleryTitle: 255,
  galleryDescription: 100000,
  promotions: 100000
}

function viewLabel (doc) {
  const views = Array.isArray(doc.storeViews) ? doc.storeViews.filter(Boolean) : []
  if (views.includes(ALL_STORE_VIEWS)) return ALL_STORE_VIEWS
  if (views.length) return views.join(', ')
  return doc.storeViewLabel || ALL_STORE_VIEWS
}

function clipped (value, max) {
  return text(value).slice(0, max)
}

function stringList (value, maxItems) {
  const source = Array.isArray(value) ? value : []
  return [...new Set(source.map(item => text(item)).filter(Boolean))].slice(0, maxItems).map(item => item.slice(0, 200))
}

function hoursOf (value) {
  const source = value && typeof value === 'object' ? value : {}
  const hours = {}
  for (const day of DAYS) {
    const row = source[day] && typeof source[day] === 'object' ? source[day] : {}
    hours[day] = {
      open: row.open === true || row.open === 'true' || row.open === 1,
      from: text(row.from).slice(0, 8),
      to: text(row.to).slice(0, 8)
    }
  }
  return hours
}

function imageUrl (value, label) {
  const url = text(value)
  if (!url) return ''
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw httpError(400, `${label} address is not valid.`)
  }
  if (parsed.protocol !== 'https:' || url.length > 2000) throw httpError(400, `${label} address is not valid.`)
  return url
}

function decimalField (value, label, min, max) {
  const raw = text(value)
  if (!raw) return ''
  const number = Number(raw)
  if (!Number.isFinite(number) || number < min || number > max) throw httpError(400, `${label} is not valid.`)
  return String(number)
}

function sanitizeLocation (fields = {}) {
  const title = clipped(fields.title, TEXT_LIMITS.title)
  const country = clipped(fields.country, TEXT_LIMITS.country)
  const city = clipped(fields.city, TEXT_LIMITS.city)
  const street = clipped(fields.street, TEXT_LIMITS.street)
  const storeViews = stringList(fields.storeViews, STORE_VIEWS.length)
  if (!title) throw httpError(400, 'Title is required.')
  if (!country) throw httpError(400, 'Country is required.')
  const state = clipped(fields.state, TEXT_LIMITS.state)
  if (REGIONS_REQUIRED.has(country) && !state) throw httpError(400, 'State is required.')
  if (!city) throw httpError(400, 'City is required.')
  if (!street) throw httpError(400, 'Street is required.')
  if (!storeViews.length) throw httpError(400, 'Store View is required.')
  if (storeViews.some(view => !STORE_VIEWS.includes(view))) throw httpError(400, 'Store View is not valid.')
  const email = clipped(fields.email, 200)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Enter a valid email address.')
  const sortRaw = text(fields.sortOrder)
  if (sortRaw && !/^-?\d+$/.test(sortRaw)) throw httpError(400, 'Sort Order must be a whole number.')
  const status = fields.status === 'disabled' ? 'disabled' : 'enabled'
  return {
    status,
    logo: imageUrl(fields.logo, 'Logo'),
    title,
    storeUrl: clipped(fields.storeUrl, TEXT_LIMITS.storeUrl),
    country,
    state,
    city,
    street,
    zip: clipped(fields.zip, TEXT_LIMITS.zip),
    phone: clipped(fields.phone, TEXT_LIMITS.phone),
    email,
    websiteUrl: clipped(fields.websiteUrl, 500),
    openInNewTab: fields.openInNewTab === true || fields.openInNewTab === 'true',
    storeViews,
    storeViewLabel: storeViews.includes(ALL_STORE_VIEWS) ? ALL_STORE_VIEWS : storeViews.join(', '),
    description: clipped(fields.description, TEXT_LIMITS.description),
    sortOrder: sortRaw ? String(Math.trunc(Number(sortRaw))) : '',
    locationImage: imageUrl(fields.locationImage, 'Location image'),
    mapMarker: imageUrl(fields.mapMarker, 'Google map marker'),
    metaTitle: clipped(fields.metaTitle, TEXT_LIMITS.metaTitle),
    metaKeywords: clipped(fields.metaKeywords, TEXT_LIMITS.metaKeywords),
    metaDescription: clipped(fields.metaDescription, TEXT_LIMITS.metaDescription),
    isFeatured: fields.isFeatured === true || fields.isFeatured === 'true',
    zoom: decimalField(fields.zoom, 'Zoom', 0, 22),
    latitude: decimalField(fields.latitude, 'Latitude', -90, 90),
    longitude: decimalField(fields.longitude, 'Longitude', -180, 180),
    storeBanner: imageUrl(fields.storeBanner, 'Store banner'),
    travelSuggestion: clipped(fields.travelSuggestion, TEXT_LIMITS.travelSuggestion),
    services: stringList(fields.services, 50),
    storeContent: clipped(fields.storeContent, TEXT_LIMITS.storeContent),
    galleries: stringList(fields.galleries, 50),
    galleryTitle: clipped(fields.galleryTitle, TEXT_LIMITS.galleryTitle),
    galleryDescription: clipped(fields.galleryDescription, TEXT_LIMITS.galleryDescription),
    teamProfiles: stringList(fields.teamProfiles, 50),
    promotions: clipped(fields.promotions, TEXT_LIMITS.promotions),
    isStore: fields.isStore === true || fields.isStore === 'true',
    storeHours: hoursOf(fields.storeHours),
    isCafe: fields.isCafe === true || fields.isCafe === 'true',
    cafeHours: hoursOf(fields.cafeHours)
  }
}

function toForm (doc) {
  const views = Array.isArray(doc.storeViews) && doc.storeViews.length ? doc.storeViews : [ALL_STORE_VIEWS]
  return {
    locationId: doc.locationId,
    status: doc.status === 'disabled' ? 'disabled' : 'enabled',
    logo: text(doc.logo),
    title: text(doc.title),
    storeUrl: text(doc.storeUrl),
    country: text(doc.country),
    state: text(doc.state),
    city: text(doc.city),
    street: text(doc.street),
    zip: text(doc.zip),
    phone: text(doc.phone),
    email: text(doc.email),
    websiteUrl: text(doc.websiteUrl),
    openInNewTab: doc.openInNewTab === true,
    storeViews: views,
    description: text(doc.description),
    sortOrder: text(doc.sortOrder),
    locationImage: text(doc.locationImage),
    mapMarker: text(doc.mapMarker),
    metaTitle: text(doc.metaTitle),
    metaKeywords: text(doc.metaKeywords),
    metaDescription: text(doc.metaDescription),
    isFeatured: doc.isFeatured === true,
    zoom: text(doc.zoom),
    latitude: text(doc.latitude),
    longitude: text(doc.longitude),
    storeBanner: text(doc.storeBanner),
    travelSuggestion: text(doc.travelSuggestion),
    services: stringList(doc.services, 50),
    storeContent: text(doc.storeContent),
    galleries: stringList(doc.galleries, 50),
    galleryTitle: text(doc.galleryTitle),
    galleryDescription: text(doc.galleryDescription),
    teamProfiles: stringList(doc.teamProfiles, 50),
    promotions: text(doc.promotions),
    isStore: doc.isStore === true,
    storeHours: hoursOf(doc.storeHours),
    isCafe: doc.isCafe === true,
    cafeHours: hoursOf(doc.cafeHours)
  }
}

async function findOneOrNull (collection, filter) {
  try {
    return await collection.findOne(filter)
  } catch (error) {
    if (error?.statusCode === 404 || error?.httpStatusCode === 404 || /not found/i.test(String(error?.message || ''))) return null
    throw error
  }
}

async function readLocations (collection, environmentId) {
  const docs = []
  let skip = 0
  for (;;) {
    const batch = await collection.find({ environmentId, type: 'location' }).skip(skip).limit(READ_BATCH).toArray()
    docs.push(...batch)
    if (batch.length < READ_BATCH || docs.length >= MAX_LOCATIONS) break
    skip += batch.length
  }
  return docs
}

function createLocationStore (params, opener = openLocationDb) {
  const environmentId = resolveEnvironmentId(params)

  async function withDb (callback) {
    const opened = await opener(params)
    try {
      return await callback(opened)
    } finally {
      await opened.client.close()
    }
  }

  async function loadAll () {
    return withDb(async ({ locations }) => readLocations(locations, environmentId))
  }

  return {
    environmentId,

    async list ({ page, pageSize, sortDir, filters = {}, exportAll = false }) {
      const docs = await loadAll()
      const countries = [...new Set(docs.map(doc => text(doc.country)).filter(Boolean))].sort((left, right) => left.localeCompare(right))
      const matched = docs.filter(doc => matchesFilters(doc, filters))
      const direction = sortDir === 'asc' ? 1 : -1
      matched.sort((left, right) => (left.locationId - right.locationId) * direction)
      const items = matched.map(publicLocation)
      if (exportAll) {
        return { items, total: items.length, page: 1, pageSize: items.length, countries }
      }
      const size = pageSizeOf(pageSize)
      const pageCount = Math.max(1, Math.ceil(items.length / size))
      const current = Math.min(Math.max(1, Number(page) || 1), pageCount)
      const start = (current - 1) * size
      return {
        items: items.slice(start, start + size),
        total: items.length,
        page: current,
        pageSize: size,
        countries
      }
    },

    async get (locationId) {
      const id = Number(locationId)
      if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Location id is not valid.')
      return withDb(async ({ locations }) => {
        const doc = await findOneOrNull(locations, { environmentId, type: 'location', locationId: id })
        return doc ? toForm(doc) : null
      })
    },

    async getStorefront ({ locationId, title, storeUrl }) {
      const idRaw = text(locationId)
      if (idRaw) {
        const id = Number(idRaw)
        if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Location id is not valid.')
        return withDb(async ({ locations }) => {
          const doc = await findOneOrNull(locations, { environmentId, type: 'location', locationId: id })
          return doc && isEnabledLocation(doc) ? toForm(doc) : null
        })
      }
      const titleNeedle = text(title).toLowerCase()
      const urlNeedle = text(storeUrl)
      if (!titleNeedle && !urlNeedle) return null
      const docs = await loadAll()
      const matched = docs.filter(doc => {
        if (!isEnabledLocation(doc)) return false
        if (titleNeedle) return text(doc.title).toLowerCase() === titleNeedle
        return text(doc.storeUrl) === urlNeedle
      })
      return matched.length ? toForm(matched[0]) : null
    },

    async listStorefront ({ page, pageSize, filters = {} }) {
      const docs = await loadAll()
      const matched = docs.filter(doc => matchesStorefront(doc, filters)).sort(sortStorefront)
      const items = matched.map(toForm)
      const size = Math.min(100, Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE))
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

    async listDirectoryGeneral () {
      const docs = await loadAll()
      const items = docs.filter(doc => isEnabledLocation(doc)).sort(sortStorefront).map(generalStorefront)
      return { items, total: items.length }
    },

    async save (fields, locationId) {
      const record = sanitizeLocation(fields)
      const now = new Date().toISOString()
      return withDb(async ({ locations }) => {
        const id = Number(locationId)
        if (Number.isInteger(id) && id > 0) {
          const existing = await findOneOrNull(locations, { environmentId, type: 'location', locationId: id })
          if (!existing) throw httpError(404, 'Location not found.')
          const document = { ...existing, ...record, id: existing.id, type: 'location', environmentId, locationId: id, updatedAt: now }
          await locations.replaceOne({ id: existing.id }, document)
          return toForm(document)
        }
        const counterId = `counter:${environmentId}`
        const counter = await findOneOrNull(locations, { id: counterId })
        const nextId = Number(counter?.nextId) > 0 ? Number(counter.nextId) : 1
        const counterDoc = { id: counterId, type: 'counter', environmentId, nextId: nextId + 1 }
        if (counter) await locations.replaceOne({ id: counterId }, counterDoc)
        else await locations.insertOne(counterDoc)
        const document = {
          ...record,
          id: `loc:${environmentId}:${nextId}`,
          type: 'location',
          environmentId,
          locationId: nextId,
          createdAt: now,
          updatedAt: now
        }
        await locations.insertOne(document)
        return toForm(document)
      })
    },

    async applyMass (operation, ids) {
      const locationIdList = locationIds(ids)
      if (!locationIdList.length) throw httpError(400, "You haven't selected any items!")
      if (!['delete', 'enable', 'disable'].includes(operation)) throw httpError(400, 'Unknown mass action.')
      return withDb(async ({ locations }) => {
        const existing = await locations.find({
          environmentId,
          type: 'location',
          locationId: { $in: locationIdList }
        }).project({ locationId: 1 }).toArray()
        const found = existing.map(doc => doc.locationId)
        if (!found.length) return { affected: 0 }
        const filter = { environmentId, type: 'location', locationId: { $in: found } }
        if (operation === 'delete') await locations.deleteMany(filter)
        else {
          await locations.updateMany(filter, {
            $set: {
              status: operation === 'disable' ? 'disabled' : 'enabled',
              updatedAt: new Date().toISOString()
            }
          })
        }
        return { affected: found.length }
      })
    }
  }
}

module.exports = {
  ALL_STORE_VIEWS,
  STORE_VIEWS,
  generalStorefront,
  createLocationStore
}
