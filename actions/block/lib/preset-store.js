const { Core } = require('@adobe/aio-sdk')
const libDb = require('@adobe/aio-lib-db')

const { presetScopeFromParams } = require('./app-scope')
const { BLOCKS_COLLECTION } = require('./constants')

const scopeFromParams = presetScopeFromParams

function normalizePresetName (name) {
  return String(name || '').trim().toLowerCase()
}

function readBlockId (preset) {
  const fromField = Number(preset?.blockId)
  if (Number.isInteger(fromField) && fromField > 0) return fromField
  const fromLegacySequence = Number(preset?.sequence)
  if (Number.isInteger(fromLegacySequence) && fromLegacySequence > 0) return fromLegacySequence
  return null
}

/** State cache key for preset SKU results. */
function presetCacheKey (preset) {
  const blockId = readBlockId(preset)
  return blockId != null ? String(blockId) : String(preset?.id || '')
}

function isMissing (error) {
  return error?.statusCode === 404 || error?.status === 404 ||
    /not found|does not exist|no document|namespacenotfound|ns not found/i.test(String(error?.message || ''))
}

function isAlreadyExists (error) {
  return error?.statusCode === 409 || error?.status === 409 ||
    /already exists|namespaceexists|index.*exists/i.test(String(error?.message || ''))
}

async function ensureCollection (client) {
  const collections = await client.listCollections({ name: BLOCKS_COLLECTION })
  if (collections.some(collection => collection.name === BLOCKS_COLLECTION)) {
    return client.collection(BLOCKS_COLLECTION)
  }
  try {
    return await client.createCollection(BLOCKS_COLLECTION)
  } catch (error) {
    if (isAlreadyExists(error)) return client.collection(BLOCKS_COLLECTION)
    throw error
  }
}

async function ensureIndex (collection, specification, options) {
  try {
    await collection.createIndex(specification, options)
  } catch (error) {
    if (!isAlreadyExists(error)) throw error
  }
}

async function openCollection (params) {
  const token = await Core.AuthClient.generateAccessToken(params)
  const db = await libDb.init({
    token: token.access_token,
    region: params.DB_REGION || 'amer'
  })
  const client = await db.connect()
  const collection = await ensureCollection(client)
  await ensureIndex(
    collection,
    { 'scope.environmentId': 1, 'scope.storeViewCode': 1, normalizedName: 1 },
    { unique: true, name: 'block_name_scope' }
  )
  await ensureIndex(
    collection,
    { 'scope.environmentId': 1, 'scope.storeViewCode': 1, blockId: 1 },
    { unique: true, name: 'block_id_scope' }
  )
  await ensureIndex(collection, { updatedAt: -1 }, { name: 'block_updated' })
  return { client, collection }
}

async function findOneOrNull (collection, filter) {
  try {
    return await collection.findOne(filter)
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

function createPresetStore (params, opener = openCollection) {
  async function withCollection (callback) {
    const { client, collection } = await opener(params)
    try {
      return await callback(collection)
    } finally {
      await client.close()
    }
  }

  const scope = () => scopeFromParams(params)

  return {
    scope,
    get: lookup => withCollection(async collection => {
      const raw = String(lookup || '').trim()
      if (!raw) return null
      const presetScope = scope()
      if (/^\d+$/.test(raw)) {
        return findOneOrNull(collection, {
          'scope.environmentId': presetScope.environmentId,
          'scope.storeViewCode': presetScope.storeViewCode,
          blockId: Number(raw)
        })
      }
      const byId = await findOneOrNull(collection, { id: raw })
      if (byId) return byId
      return findOneOrNull(collection, { legacyUuid: raw })
    }),
    findByName: (presetScope, normalizedName) => withCollection(collection => findOneOrNull(collection, {
      'scope.environmentId': presetScope.environmentId,
      'scope.storeViewCode': presetScope.storeViewCode,
      normalizedName: normalizePresetName(normalizedName)
    })),
    findByTitle: (presetScope, title) =>
      withCollection(collection => findOneOrNull(collection, {
        'scope.environmentId': presetScope.environmentId,
        'scope.storeViewCode': presetScope.storeViewCode,
        normalizedName: normalizePresetName(title)
      })),
    findByBlockId: (presetScope, blockId) => {
      const value = Number(blockId)
      if (!Number.isInteger(value) || value < 1) {
        return Promise.resolve(null)
      }
      return withCollection(collection => findOneOrNull(collection, {
        'scope.environmentId': presetScope.environmentId,
        'scope.storeViewCode': presetScope.storeViewCode,
        blockId: value
      }))
    },
    list: presetScope => withCollection(async collection => {
      const cursor = collection.find({
        'scope.environmentId': presetScope.environmentId,
        'scope.storeViewCode': presetScope.storeViewCode
      })
      return cursor.sort({ updatedAt: -1, blockId: 1, name: 1 }).toArray()
    }),
    insert: preset => withCollection(async collection => {
      await collection.insertOne(preset)
      return preset
    }),
    replace: preset => withCollection(async collection => {
      const filter = Number.isInteger(preset.blockId)
        ? {
            blockId: preset.blockId,
            'scope.environmentId': preset.scope.environmentId,
            'scope.storeViewCode': preset.scope.storeViewCode
          }
        : { id: preset.id }
      const result = await collection.replaceOne(filter, preset)
      if (result.matchedCount === 0) {
        const error = new Error('Saved condition not found.')
        error.statusCode = 404
        throw error
      }
      return preset
    }),
    remove: lookup => withCollection(async collection => {
      const raw = String(lookup || '').trim()
      if (!raw) {
        const error = new Error('Saved condition not found.')
        error.statusCode = 404
        throw error
      }
      const presetScope = scope()
      let existing = null
      if (/^\d+$/.test(raw)) {
        existing = await findOneOrNull(collection, {
          'scope.environmentId': presetScope.environmentId,
          'scope.storeViewCode': presetScope.storeViewCode,
          blockId: Number(raw)
        })
      } else {
        existing = await findOneOrNull(collection, { id: raw })
        if (!existing) {
          existing = await findOneOrNull(collection, {
            'scope.environmentId': presetScope.environmentId,
            'scope.storeViewCode': presetScope.storeViewCode,
            legacyUuid: raw
          })
        }
      }
      if (!existing) {
        const error = new Error('Saved condition not found.')
        error.statusCode = 404
        throw error
      }
      const blockId = readBlockId(existing)
      const filter = Number.isInteger(blockId) && blockId > 0
        ? {
            blockId,
            'scope.environmentId': presetScope.environmentId,
            'scope.storeViewCode': presetScope.storeViewCode
          }
        : { id: existing.id }
      const result = await collection.deleteOne(filter)
      if (result.deletedCount === 0) {
        const error = new Error('Saved condition not found.')
        error.statusCode = 404
        throw error
      }
      return { id: blockId != null ? String(blockId) : String(existing.id) }
    }),
    nextBlockId: presetScope => withCollection(async collection => {
      const cursor = collection.find({
        'scope.environmentId': presetScope.environmentId,
        'scope.storeViewCode': presetScope.storeViewCode
      })
      const presets = await cursor.toArray()
      return presets.reduce((max, preset) => Math.max(max, readBlockId(preset) || 0), 0) + 1
    })
  }
}

module.exports = {
  createPresetStore,
  openCollection,
  scopeFromParams,
  findOneOrNull,
  normalizePresetName,
  readBlockId,
  presetCacheKey,
  COLLECTION: BLOCKS_COLLECTION
}
