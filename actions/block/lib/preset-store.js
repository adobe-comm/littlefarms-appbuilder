const { Core } = require('@adobe/aio-sdk')
const libDb = require('@adobe/aio-lib-db')

const { presetScopeFromParams } = require('./app-scope')

const COLLECTION = 'condition_presets'

const scopeFromParams = presetScopeFromParams

function isMissing (error) {
  return error?.statusCode === 404 || error?.status === 404 ||
    /not found|does not exist|no document|namespacenotfound|ns not found/i.test(String(error?.message || ''))
}

function isAlreadyExists (error) {
  return error?.statusCode === 409 || error?.status === 409 ||
    /already exists|namespaceexists|index.*exists/i.test(String(error?.message || ''))
}

async function ensureCollection (client) {
  const collections = await client.listCollections({ name: COLLECTION })
  if (collections.some(collection => collection.name === COLLECTION)) {
    return client.collection(COLLECTION)
  }
  try {
    return await client.createCollection(COLLECTION)
  } catch (error) {
    if (isAlreadyExists(error)) return client.collection(COLLECTION)
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
    { unique: true, name: 'preset_name_scope' }
  )
  await ensureIndex(collection, { updatedAt: -1 }, { name: 'preset_updated' })
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
    get: id => withCollection(collection => findOneOrNull(collection, { id })),
    findByName: (presetScope, normalizedName) => withCollection(collection => findOneOrNull(collection, {
      'scope.environmentId': presetScope.environmentId,
      'scope.storeViewCode': presetScope.storeViewCode,
      normalizedName
    })),
    list: presetScope => withCollection(async collection => {
      const cursor = collection.find({
        'scope.environmentId': presetScope.environmentId,
        'scope.storeViewCode': presetScope.storeViewCode
      })
      return cursor.sort({ updatedAt: -1, name: 1 }).toArray()
    }),
    insert: preset => withCollection(async collection => {
      await collection.insertOne(preset)
      return preset
    }),
    replace: preset => withCollection(async collection => {
      const result = await collection.replaceOne({ id: preset.id }, preset)
      if (result.matchedCount === 0) {
        const error = new Error('Saved condition not found.')
        error.statusCode = 404
        throw error
      }
      return preset
    }),
    remove: id => withCollection(async collection => {
      const result = await collection.deleteOne({ id })
      if (result.deletedCount === 0) {
        const error = new Error('Saved condition not found.')
        error.statusCode = 404
        throw error
      }
      return { id }
    }),
    nextSequence: presetScope => withCollection(async collection => {
      const cursor = collection.find({
        'scope.environmentId': presetScope.environmentId,
        'scope.storeViewCode': presetScope.storeViewCode
      })
      const presets = await cursor.toArray()
      return presets.reduce((max, preset) => Math.max(max, Number(preset.sequence) || 0), 0) + 1
    })
  }
}

module.exports = { createPresetStore, openCollection, scopeFromParams, findOneOrNull, COLLECTION }
