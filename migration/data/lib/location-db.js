const LOCATION_COUNTER_ID = 'counter:location'
const CONTENT_COUNTER_ID = 'counter:content'

const {
  openLocationDb,
  sanitizeLocation,
  toForm
} = require('../../../actions/location/lib/location-store')
const {
  openContentDb,
  normalizeServiceFields,
  normalizeGalleryFields,
  normalizeTeamFields
} = require('../../../actions/location/lib/content-store')
const {
  loadDocumentsViaCli,
  aioUpdateDocument,
  aioInsertDocuments,
  aioReplaceDocument,
  stripInternalFields,
  LOCATIONS_COLLECTION,
  LOCATION_CONTENT_COLLECTION
} = require('./aio-db-cli')

const READ_BATCH = 100
const WRITE_BATCH = 40
const DEFAULT_PROGRESS_EVERY = 25

function trimmed (value) {
  return String(value ?? '').trim()
}

function normalizeStoreUrl (value) {
  return trimmed(value).toLowerCase()
}

function indexLocations (docs) {
  const byId = new Map()
  const byStoreUrl = new Map()
  for (const doc of docs) {
    if (doc.type !== 'location') continue
    byId.set(Number(doc.locationId), doc)
    const key = normalizeStoreUrl(doc.storeUrl)
    if (key) byStoreUrl.set(key, doc)
  }
  return { byId, byStoreUrl }
}

function indexServices (docs) {
  const byLegacyId = new Map()
  for (const doc of docs) {
    if (doc.type !== 'service') continue
    byLegacyId.set(Number(doc.serviceId), doc)
  }
  return byLegacyId
}

function indexTeamProfiles (docs) {
  const byLegacyId = new Map()
  for (const doc of docs) {
    if (doc.type !== 'team') continue
    byLegacyId.set(Number(doc.profileId), doc)
  }
  return byLegacyId
}

function indexGalleryItems (docs) {
  const byLegacyId = new Map()
  for (const doc of docs) {
    if (doc.type !== 'gallery') continue
    byLegacyId.set(Number(doc.galleryId), doc)
  }
  return byLegacyId
}

async function loadLocationsViaSdk (params) {
  const opened = await openLocationDb(params)
  try {
    const docs = []
    let skip = 0
    for (;;) {
      const batch = await opened.locations.find({ type: 'location' })
        .skip(skip)
        .limit(READ_BATCH)
        .toArray()
      docs.push(...batch)
      if (batch.length < READ_BATCH) break
      skip += batch.length
    }
    return { docs, ...indexLocations(docs) }
  } finally {
    await opened.client.close()
  }
}

async function loadServicesViaSdk (params) {
  const opened = await openContentDb(params)
  try {
    const docs = await opened.collection.find({ type: 'service' }).toArray()
    return { docs, byLegacyId: indexServices(docs) }
  } finally {
    await opened.client.close()
  }
}

async function loadLocations (params, { preferSdk = false } = {}) {
  if (preferSdk) {
    try {
      return await loadLocationsViaSdk(params)
    } catch (error) {
      console.warn(`SDK location read failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  const docs = loadDocumentsViaCli(LOCATIONS_COLLECTION, { type: 'location' })
  return { docs, ...indexLocations(docs) }
}

async function loadServices (params, { preferSdk = false } = {}) {
  if (preferSdk) {
    try {
      return await loadServicesViaSdk(params)
    } catch (error) {
      console.warn(`SDK service read failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  const docs = loadDocumentsViaCli(LOCATION_CONTENT_COLLECTION, { type: 'service' })
  return { docs, byLegacyId: indexServices(docs) }
}

async function loadTeamProfilesViaSdk (params) {
  const opened = await openContentDb(params)
  try {
    const docs = await opened.collection.find({ type: 'team' }).toArray()
    return { docs, byLegacyId: indexTeamProfiles(docs) }
  } finally {
    await opened.client.close()
  }
}

async function loadTeamProfiles (params, { preferSdk = false } = {}) {
  if (preferSdk) {
    try {
      return await loadTeamProfilesViaSdk(params)
    } catch (error) {
      console.warn(`SDK team read failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  const docs = loadDocumentsViaCli(LOCATION_CONTENT_COLLECTION, { type: 'team' })
  return { docs, byLegacyId: indexTeamProfiles(docs) }
}

async function loadGalleryItemsViaSdk (params) {
  const opened = await openContentDb(params)
  try {
    const docs = await opened.collection.find({ type: 'gallery' }).toArray()
    return { docs, byLegacyId: indexGalleryItems(docs) }
  } finally {
    await opened.client.close()
  }
}

async function loadGalleryItems (params, { preferSdk = false } = {}) {
  if (preferSdk) {
    try {
      return await loadGalleryItemsViaSdk(params)
    } catch (error) {
      console.warn(`SDK gallery read failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  const docs = loadDocumentsViaCli(LOCATION_CONTENT_COLLECTION, { type: 'gallery' })
  return { docs, byLegacyId: indexGalleryItems(docs) }
}

function mergeLocationPatch (base, rawFields) {
  const patch = sanitizeLocation(rawFields)
  const next = { ...base, ...patch, updatedAt: new Date().toISOString() }
  return next
}

function patchToSet (base, rawFields) {
  const next = mergeLocationPatch(base, rawFields)
  const set = { updatedAt: next.updatedAt }
  for (const [key, value] of Object.entries(next)) {
    if (key === '_id' || key === 'id') continue
    if (JSON.stringify(value) !== JSON.stringify(base[key])) set[key] = value
  }
  return set
}

function buildNewLocationDocument (legacyLocationId, rawFields) {
  const id = Number(legacyLocationId)
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid legacy location_id: ${legacyLocationId}`)
  }
  const now = new Date().toISOString()
  const record = sanitizeLocation(rawFields)
  return {
    ...record,
    id: `loc:${id}`,
    type: 'location',
    locationId: id,
    createdAt: now,
    updatedAt: now
  }
}

function buildTeamDocument (legacyProfileId, rawFields, existing) {
  const profileId = Number(legacyProfileId)
  if (!Number.isInteger(profileId) || profileId <= 0) {
    throw new Error(`Invalid legacy team profile id: ${legacyProfileId}`)
  }
  const now = new Date().toISOString()
  const record = normalizeTeamFields(rawFields)
  if (existing) {
    return {
      ...existing,
      ...record,
      updatedAt: now
    }
  }
  return {
    id: `team:${profileId}`,
    type: 'team',
    profileId,
    ...record,
    createdAt: now,
    updatedAt: now
  }
}

function contentUpsertSet (existing, document) {
  const set = { updatedAt: document.updatedAt }
  if (document.type === 'team') {
    for (const key of ['name', 'jobTitle', 'image', 'sortOrder', 'status']) {
      if (document[key] !== undefined) set[key] = document[key]
    }
    return set
  }
  if (document.type === 'gallery') {
    for (const key of ['title', 'image', 'imageAlt', 'status']) {
      if (document[key] !== undefined) set[key] = document[key]
    }
    return set
  }
  for (const key of ['title', 'serviceUrl', 'icon', 'status']) {
    if (document[key] !== undefined) set[key] = document[key]
  }
  return set
}

function buildGalleryDocument (legacyGalleryId, rawFields, existing) {
  const galleryId = Number(legacyGalleryId)
  if (!Number.isInteger(galleryId) || galleryId <= 0) {
    throw new Error(`Invalid legacy gallery id: ${legacyGalleryId}`)
  }
  const now = new Date().toISOString()
  const record = normalizeGalleryFields(rawFields)
  if (existing) {
    return {
      ...existing,
      ...record,
      updatedAt: now
    }
  }
  return {
    id: `gallery:${galleryId}`,
    type: 'gallery',
    galleryId,
    ...record,
    createdAt: now,
    updatedAt: now
  }
}

function buildServiceDocument (legacyServiceId, rawFields, existing) {
  const serviceId = Number(legacyServiceId)
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    throw new Error(`Invalid legacy service id: ${legacyServiceId}`)
  }
  const now = new Date().toISOString()
  const record = normalizeServiceFields(rawFields)
  if (existing) {
    return {
      ...existing,
      ...record,
      updatedAt: now
    }
  }
  return {
    id: `service:${serviceId}`,
    type: 'service',
    serviceId,
    ...record,
    createdAt: now,
    updatedAt: now
  }
}

function shouldReportProgress (done, total, progressEvery, verbose) {
  if (verbose) return true
  return done === total || done % progressEvery === 0
}

function reportProgress (onProgress, done, total, item, verbose, progressEvery) {
  if (!onProgress || !shouldReportProgress(done, total, progressEvery, verbose)) return
  onProgress({ done, total, item: verbose ? item : undefined })
}

async function applyLocationPatchesViaSdk (params, patches, options = {}) {
  const opened = await openLocationDb(params)
  try {
    let updated = 0
    const total = patches.length
    const { onProgress, progressEvery = DEFAULT_PROGRESS_EVERY, verbose = false } = options
    for (const item of patches) {
      const document = stripInternalFields(mergeLocationPatch(item.base, item.fields))
      await opened.locations.replaceOne({ id: item.base.id }, document)
      updated += 1
      reportProgress(onProgress, updated, total, item, verbose, progressEvery)
    }
    return updated
  } finally {
    await opened.client.close()
  }
}

function applyLocationPatchesViaCli (patches, options = {}) {
  let updated = 0
  const total = patches.length
  const { onProgress, progressEvery = DEFAULT_PROGRESS_EVERY, verbose = false } = options
  for (const item of patches) {
    const set = patchToSet(item.base, item.fields)
    if (Object.keys(set).length <= 1 && set.updatedAt) continue
    aioUpdateDocument(LOCATIONS_COLLECTION, { id: item.base.id }, set)
    updated += 1
    reportProgress(onProgress, updated, total, item, verbose, progressEvery)
  }
  return updated
}

async function applyLocationPatches (params, patches, options = {}) {
  const { preferSdk = false } = options
  if (preferSdk) {
    try {
      return await applyLocationPatchesViaSdk(params, patches, options)
    } catch (error) {
      console.warn(`SDK location write failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  return applyLocationPatchesViaCli(patches, options)
}

async function insertLocationsViaSdk (params, documents, options = {}) {
  const opened = await openLocationDb(params)
  try {
    let inserted = 0
    const total = documents.length
    const { onProgress, progressEvery = DEFAULT_PROGRESS_EVERY, verbose = false } = options
    for (const document of documents) {
      await opened.locations.insertOne(document)
      inserted += 1
      reportProgress(onProgress, inserted, total, { document }, verbose, progressEvery)
    }
    return inserted
  } finally {
    await opened.client.close()
  }
}

function insertLocationsViaCli (documents, options = {}) {
  let inserted = 0
  const total = documents.length
  const { onProgress, progressEvery = DEFAULT_PROGRESS_EVERY, verbose = false } = options
  for (const document of documents) {
    aioInsertDocuments(LOCATIONS_COLLECTION, document)
    inserted += 1
    reportProgress(onProgress, inserted, total, { document }, verbose, progressEvery)
  }
  return inserted
}

async function insertLocations (params, documents, options = {}) {
  const { preferSdk = false } = options
  if (preferSdk) {
    try {
      return await insertLocationsViaSdk(params, documents, options)
    } catch (error) {
      console.warn(`SDK location insert failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  return insertLocationsViaCli(documents, options)
}

async function upsertServicesViaSdk (params, upserts, options = {}) {
  const opened = await openContentDb(params)
  try {
    let written = 0
    const total = upserts.length
    const { onProgress, progressEvery = DEFAULT_PROGRESS_EVERY, verbose = false } = options
    for (const item of upserts) {
      if (item.existing) {
        const set = contentUpsertSet(item.existing, item.document)
        await opened.collection.updateOne({ id: item.existing.id }, { $set: set })
      } else {
        await opened.collection.insertOne(stripInternalFields(item.document))
      }
      written += 1
      reportProgress(onProgress, written, total, item, verbose, progressEvery)
    }
    return written
  } finally {
    await opened.client.close()
  }
}

function upsertServicesViaCli (upserts, options = {}) {
  let written = 0
  const total = upserts.length
  const { onProgress, progressEvery = DEFAULT_PROGRESS_EVERY, verbose = false } = options
  for (const item of upserts) {
    if (item.existing) {
      aioUpdateDocument(
        LOCATION_CONTENT_COLLECTION,
        { id: item.existing.id },
        contentUpsertSet(item.existing, item.document)
      )
    } else {
      aioInsertDocuments(LOCATION_CONTENT_COLLECTION, item.document)
    }
    written += 1
    reportProgress(onProgress, written, total, item, verbose, progressEvery)
  }
  return written
}

async function upsertServices (params, upserts, options = {}) {
  const { preferSdk = false } = options
  if (preferSdk) {
    try {
      return await upsertServicesViaSdk(params, upserts, options)
    } catch (error) {
      console.warn(`SDK service write failed (${error.message}). Falling back to aio CLI.`)
    }
  }
  return upsertServicesViaCli(upserts, options)
}

async function bumpLocationCounter (params, minimumNextId, { preferSdk = false } = {}) {
  const nextId = Math.max(1, Number(minimumNextId) || 1)

  if (preferSdk) {
    const opened = await openLocationDb(params)
    try {
      const existing = await opened.locations.findOne({ id: LOCATION_COUNTER_ID })
      const current = Number(existing?.nextId) || 1
      const counterDoc = {
        id: LOCATION_COUNTER_ID,
        type: 'counter',
        nextId: Math.max(current, nextId)
      }
      if (existing) await opened.locations.replaceOne({ id: LOCATION_COUNTER_ID }, counterDoc)
      else await opened.locations.insertOne(counterDoc)
      return
    } finally {
      await opened.client.close()
    }
  }

  const filter = { id: LOCATION_COUNTER_ID }
  const existing = loadDocumentsViaCli(LOCATIONS_COLLECTION, filter)[0]
  const current = Number(existing?.nextId) || 1
  const counterDoc = {
    id: LOCATION_COUNTER_ID,
    type: 'counter',
    nextId: Math.max(current, nextId)
  }
  if (existing) aioReplaceDocument(LOCATIONS_COLLECTION, filter, counterDoc)
  else aioInsertDocuments(LOCATIONS_COLLECTION, counterDoc)
}

async function bumpServiceCounter (params, minimumNextId, { preferSdk = false } = {}) {
  const nextId = Math.max(1, Number(minimumNextId) || 1)

  if (preferSdk) {
    const opened = await openContentDb(params)
    try {
      let counter = await opened.collection.findOne({ id: CONTENT_COUNTER_ID })
      if (!counter) {
        counter = {
          id: CONTENT_COUNTER_ID,
          type: 'counter',
          nextServiceId: 1,
          nextGalleryId: 1,
          nextTeamId: 1
        }
      }
      counter.nextServiceId = Math.max(Number(counter.nextServiceId) || 1, nextId)
      const hadCounter = await opened.collection.findOne({ id: CONTENT_COUNTER_ID })
      if (hadCounter) await opened.collection.replaceOne({ id: CONTENT_COUNTER_ID }, counter)
      else await opened.collection.insertOne(counter)
      return
    } finally {
      await opened.client.close()
    }
  }

  const filter = { id: CONTENT_COUNTER_ID }
  const existing = loadDocumentsViaCli(LOCATION_CONTENT_COLLECTION, filter)[0]
  const nextServiceId = Math.max(Number(existing?.nextServiceId) || 1, nextId)
  if (existing) {
    aioUpdateDocument(LOCATION_CONTENT_COLLECTION, filter, { nextServiceId })
  } else {
    aioInsertDocuments(LOCATION_CONTENT_COLLECTION, {
      id: CONTENT_COUNTER_ID,
      type: 'counter',
      nextGalleryId: 1,
      nextTeamId: 1,
      nextServiceId
    })
  }
}

async function bumpGalleryCounter (params, minimumNextId, { preferSdk = false } = {}) {
  const nextId = Math.max(1, Number(minimumNextId) || 1)

  if (preferSdk) {
    const opened = await openContentDb(params)
    try {
      let counter = await opened.collection.findOne({ id: CONTENT_COUNTER_ID })
      if (!counter) {
        counter = {
          id: CONTENT_COUNTER_ID,
          type: 'counter',
          nextServiceId: 1,
          nextGalleryId: 1,
          nextTeamId: 1
        }
      }
      counter.nextGalleryId = Math.max(Number(counter.nextGalleryId) || 1, nextId)
      const hadCounter = await opened.collection.findOne({ id: CONTENT_COUNTER_ID })
      if (hadCounter) await opened.collection.replaceOne({ id: CONTENT_COUNTER_ID }, counter)
      else await opened.collection.insertOne(counter)
      return
    } finally {
      await opened.client.close()
    }
  }

  const filter = { id: CONTENT_COUNTER_ID }
  const existing = loadDocumentsViaCli(LOCATION_CONTENT_COLLECTION, filter)[0]
  const nextGalleryId = Math.max(Number(existing?.nextGalleryId) || 1, nextId)
  if (existing) {
    aioUpdateDocument(LOCATION_CONTENT_COLLECTION, filter, { nextGalleryId })
  } else {
    aioInsertDocuments(LOCATION_CONTENT_COLLECTION, {
      id: CONTENT_COUNTER_ID,
      type: 'counter',
      nextGalleryId,
      nextTeamId: 1,
      nextServiceId: 1
    })
  }
}

async function bumpTeamCounter (params, minimumNextId, { preferSdk = false } = {}) {
  const nextId = Math.max(1, Number(minimumNextId) || 1)

  if (preferSdk) {
    const opened = await openContentDb(params)
    try {
      let counter = await opened.collection.findOne({ id: CONTENT_COUNTER_ID })
      if (!counter) {
        counter = {
          id: CONTENT_COUNTER_ID,
          type: 'counter',
          nextServiceId: 1,
          nextGalleryId: 1,
          nextTeamId: 1
        }
      }
      counter.nextTeamId = Math.max(Number(counter.nextTeamId) || 1, nextId)
      const hadCounter = await opened.collection.findOne({ id: CONTENT_COUNTER_ID })
      if (hadCounter) await opened.collection.replaceOne({ id: CONTENT_COUNTER_ID }, counter)
      else await opened.collection.insertOne(counter)
      return
    } finally {
      await opened.client.close()
    }
  }

  const filter = { id: CONTENT_COUNTER_ID }
  const existing = loadDocumentsViaCli(LOCATION_CONTENT_COLLECTION, filter)[0]
  const nextTeamId = Math.max(Number(existing?.nextTeamId) || 1, nextId)
  if (existing) {
    aioUpdateDocument(LOCATION_CONTENT_COLLECTION, filter, { nextTeamId })
  } else {
    aioInsertDocuments(LOCATION_CONTENT_COLLECTION, {
      id: CONTENT_COUNTER_ID,
      type: 'counter',
      nextGalleryId: 1,
      nextTeamId,
      nextServiceId: 1
    })
  }
}

function locationFormDiff (baseDoc, rawFields) {
  const current = toForm(baseDoc)
  const patch = sanitizeLocation(rawFields)
  const changes = {}
  for (const [key, nextValue] of Object.entries(patch)) {
    if (JSON.stringify(current[key]) !== JSON.stringify(nextValue)) {
      changes[key] = { from: current[key], to: nextValue }
    }
  }
  return changes
}

module.exports = {
  loadLocations,
  loadServices,
  loadGalleryItems,
  loadTeamProfiles,
  applyLocationPatches,
  insertLocations,
  upsertServices,
  bumpLocationCounter,
  bumpServiceCounter,
  bumpGalleryCounter,
  bumpTeamCounter,
  buildNewLocationDocument,
  buildGalleryDocument,
  buildServiceDocument,
  buildTeamDocument,
  locationFormDiff,
  patchToSet,
  normalizeStoreUrl,
  DEFAULT_PROGRESS_EVERY
}
