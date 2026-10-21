const { Core } = require('@adobe/aio-sdk')
const libDb = require('@adobe/aio-lib-db')

const CONTENT_COUNTER_ID = 'counter:content'

const CONTENT_COLLECTION = 'littlefarms_location_content'
const READ_BATCH = 100
const PAGE_SIZES = [20, 30, 50, 100, 200]
const DEFAULT_PAGE_SIZE = 20

const KINDS = {
  service: {
    type: 'service',
    idField: 'serviceId',
    counterKey: 'nextServiceId',
    labelField: 'title'
  },
  gallery: {
    type: 'gallery',
    idField: 'galleryId',
    counterKey: 'nextGalleryId',
    labelField: 'title'
  },
  team: {
    type: 'team',
    idField: 'profileId',
    counterKey: 'nextTeamId',
    labelField: 'name'
  }
}

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

async function openContentDb (params) {
  const token = await Core.AuthClient.generateAccessToken(params)
  const db = await libDb.init({
    token: token.access_token,
    region: params.DB_REGION || 'amer'
  })
  const client = await db.connect()
  const collection = await ensureCollection(client, CONTENT_COLLECTION)
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

function statusOf (value) {
  return value === 'disabled' ? 'disabled' : 'enabled'
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

function resolveKind (raw) {
  const kind = text(raw).toLowerCase()
  if (!KINDS[kind]) throw httpError(400, 'kind must be service, gallery, or team.')
  return KINDS[kind]
}

function toServiceForm (doc) {
  return {
    serviceId: doc.serviceId,
    status: statusOf(doc.status),
    title: text(doc.title),
    serviceUrl: text(doc.serviceUrl),
    icon: text(doc.icon),
    createdAt: text(doc.createdAt),
    updatedAt: text(doc.updatedAt)
  }
}

function toGalleryForm (doc) {
  return {
    galleryId: doc.galleryId,
    status: statusOf(doc.status),
    title: text(doc.title),
    image: text(doc.image),
    imageAlt: text(doc.imageAlt),
    createdAt: text(doc.createdAt),
    updatedAt: text(doc.updatedAt)
  }
}

function toTeamForm (doc) {
  return {
    profileId: doc.profileId,
    status: statusOf(doc.status),
    name: text(doc.name),
    jobTitle: text(doc.jobTitle),
    image: text(doc.image),
    sortOrder: Number.isFinite(Number(doc.sortOrder)) ? String(Number(doc.sortOrder)) : '',
    createdAt: text(doc.createdAt),
    updatedAt: text(doc.updatedAt)
  }
}

function toStorefrontService (doc) {
  return {
    serviceId: Number(doc.serviceId),
    title: text(doc.title),
    serviceUrl: text(doc.serviceUrl),
    icon: text(doc.icon)
  }
}

function toStorefrontGallery (doc) {
  return {
    galleryId: Number(doc.galleryId),
    title: text(doc.title),
    image: text(doc.image),
    imageAlt: text(doc.imageAlt)
  }
}

function toStorefrontTeam (doc) {
  const sortOrder = Number(doc.sortOrder)
  return {
    profileId: Number(doc.profileId),
    name: text(doc.name),
    jobTitle: text(doc.jobTitle),
    image: text(doc.image),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0
  }
}

function toForm (doc, kindMeta) {
  if (kindMeta.type === 'service') return toServiceForm(doc)
  if (kindMeta.type === 'gallery') return toGalleryForm(doc)
  return toTeamForm(doc)
}

function toListItem (doc, kindMeta) {
  if (kindMeta.type === 'service') {
    return {
      serviceId: doc.serviceId,
      title: text(doc.title),
      status: statusOf(doc.status),
      createdAt: text(doc.createdAt)
    }
  }
  if (kindMeta.type === 'gallery') {
    return {
      galleryId: doc.galleryId,
      title: text(doc.title),
      status: statusOf(doc.status),
      image: text(doc.image),
      createdAt: text(doc.createdAt)
    }
  }
  return {
    profileId: doc.profileId,
    name: text(doc.name),
    sortOrder: Number.isFinite(Number(doc.sortOrder)) ? Number(doc.sortOrder) : 0,
    status: statusOf(doc.status),
    image: text(doc.image),
    createdAt: text(doc.createdAt)
  }
}

function pickerItem (doc, kindMeta) {
  const id = doc[kindMeta.idField]
  const label = text(doc[kindMeta.labelField])
  return { value: String(id), label: label || String(id) }
}

function normalizeServiceFields (fields) {
  const title = clipped(fields.title, 255)
  const serviceUrl = clipped(fields.serviceUrl, 255)
  if (!title) throw httpError(400, 'Title is required.')
  if (!serviceUrl) throw httpError(400, 'Service URL is required.')
  return {
    title,
    serviceUrl,
    icon: imageUrl(fields.icon, 'Icon'),
    status: statusOf(fields.status)
  }
}

function normalizeGalleryFields (fields) {
  const title = clipped(fields.title, 255)
  const imageAlt = clipped(fields.imageAlt, 255)
  if (!title) throw httpError(400, 'Title is required.')
  if (!imageAlt) throw httpError(400, 'Image Alt Text is required.')
  return {
    title,
    image: imageUrl(fields.image, 'Image'),
    imageAlt,
    status: statusOf(fields.status)
  }
}

function normalizeTeamFields (fields) {
  const name = clipped(fields.name, 255)
  const jobTitle = clipped(fields.jobTitle, 255)
  if (!name) throw httpError(400, 'Name is required.')
  if (!jobTitle) throw httpError(400, 'Job Title is required.')
  const sortRaw = text(fields.sortOrder)
  let sortOrder = 0
  if (sortRaw) {
    if (!/^-?\d+$/.test(sortRaw)) throw httpError(400, 'Sort Order must be a whole number.')
    sortOrder = Number(sortRaw)
  }
  return {
    name,
    jobTitle,
    image: imageUrl(fields.image, 'Image'),
    sortOrder,
    status: statusOf(fields.status)
  }
}

function normalizeFields (fields, kindMeta) {
  if (kindMeta.type === 'service') return normalizeServiceFields(fields)
  if (kindMeta.type === 'gallery') return normalizeGalleryFields(fields)
  return normalizeTeamFields(fields)
}

function createContentStore (params) {
  let dbPromise = null

  async function db () {
    if (!dbPromise) dbPromise = openContentDb(params)
    return dbPromise
  }

  async function counterDoc (collection) {
    let counter = await findOneOrNull(collection, { id: CONTENT_COUNTER_ID, type: 'counter' })
    if (!counter) {
      counter = {
        id: CONTENT_COUNTER_ID,
        type: 'counter',
        nextServiceId: 1,
        nextGalleryId: 1,
        nextTeamId: 1
      }
      await collection.insertOne(counter)
    }
    return counter
  }

  return {
    async list ({ kind, page, pageSize, sortDir, search, enabledOnly, picker }) {
      const kindMeta = resolveKind(kind)
      const { collection } = await db()
      const size = pageSizeOf(pageSize)
      const direction = sortDir === 'asc' ? 1 : -1
      const needle = text(search).toLowerCase()

      const docs = await collection.find({ type: kindMeta.type }).toArray()

      let matched = docs.filter(doc => {
        if (enabledOnly && statusOf(doc.status) !== 'enabled') return false
        if (!needle) return true
        const label = text(doc[kindMeta.labelField])
        return includesText(label, needle)
      })

      if (kindMeta.type === 'team') {
        matched.sort((left, right) => {
          const order = (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0)
          if (order !== 0) return order * direction
          return (Number(left.profileId) - Number(right.profileId)) * direction
        })
      } else {
        matched.sort((left, right) => {
          const leftId = Number(left[kindMeta.idField]) || 0
          const rightId = Number(right[kindMeta.idField]) || 0
          return (leftId - rightId) * direction
        })
      }

      if (picker) {
        return {
          options: matched.map(doc => pickerItem(doc, kindMeta))
        }
      }

      const total = matched.length
      const pageNumber = Math.max(1, Number(page) || 1)
      const start = (pageNumber - 1) * size
      const items = matched.slice(start, start + size).map(doc => toListItem(doc, kindMeta))
      return {
        items,
        total,
        page: pageNumber,
        pageSize: size
      }
    },

    async get (kind, entityId) {
      const kindMeta = resolveKind(kind)
      const id = Number(entityId)
      if (!Number.isFinite(id) || id < 1) throw httpError(400, 'Invalid id.')
      const { collection } = await db()
      const doc = await findOneOrNull(collection, {
        type: kindMeta.type,
        [kindMeta.idField]: id
      })
      if (!doc) return null
      return toForm(doc, kindMeta)
    },

    async save (kind, fields, entityId) {
      const kindMeta = resolveKind(kind)
      const record = normalizeFields(fields, kindMeta)
      const now = new Date().toISOString()
      const { collection } = await db()

      const id = Number(entityId)
      if (Number.isFinite(id) && id > 0) {
        const existing = await findOneOrNull(collection, {
          type: kindMeta.type,
          [kindMeta.idField]: id
        })
        if (!existing) throw httpError(404, 'Record not found.')
        const document = {
          ...existing,
          ...record,
          updatedAt: now
        }
        await collection.replaceOne({ id: existing.id }, document)
        return toForm(document, kindMeta)
      }

      const counter = await counterDoc(collection)
      const nextId = Number(counter[kindMeta.counterKey]) > 0 ? Number(counter[kindMeta.counterKey]) : 1
      const document = {
        id: `${kindMeta.type}:${nextId}`,
        type: kindMeta.type,
        [kindMeta.idField]: nextId,
        ...record,
        createdAt: now,
        updatedAt: now
      }
      await collection.insertOne(document)
      await collection.replaceOne(
        { id: counter.id },
        { ...counter, [kindMeta.counterKey]: nextId + 1 }
      )
      return toForm(document, kindMeta)
    },

    async remove (kind, ids) {
      const kindMeta = resolveKind(kind)
      const idList = [...new Set(
        (Array.isArray(ids) ? ids : [])
          .map(value => Number(value))
          .filter(value => Number.isFinite(value) && value > 0)
      )]
      if (!idList.length) throw httpError(400, "You haven't selected any items!")
      const { collection } = await db()
      const filter = {
        type: kindMeta.type,
        [kindMeta.idField]: { $in: idList }
      }
      const existing = await collection.find(filter).project({ [kindMeta.idField]: 1 }).toArray()
      const found = existing.map(doc => doc[kindMeta.idField])
      if (!found.length) return 0
      await collection.deleteMany({
        type: kindMeta.type,
        [kindMeta.idField]: { $in: found }
      })
      return found.length
    }
  }
}

module.exports = {
  createContentStore,
  CONTENT_KINDS: Object.keys(KINDS),
  openContentDb,
  normalizeServiceFields,
  normalizeGalleryFields,
  normalizeTeamFields,
  toStorefrontService,
  toStorefrontGallery,
  toStorefrontTeam
}
