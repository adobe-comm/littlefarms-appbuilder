const { Core } = require('@adobe/aio-sdk')
const libDb = require('@adobe/aio-lib-db')

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

async function openDeliveryDb (params) {
  const token = await Core.AuthClient.generateAccessToken(params)
  const db = await libDb.init({
    token: token.access_token,
    region: params.DB_REGION || 'amer'
  })
  const client = await db.connect()
  return { client }
}

async function findOneOrNull (collection, filter) {
  try {
    return await collection.findOne(filter)
  } catch {
    return null
  }
}

async function saveDocumentById (collection, id, document) {
  const key = String(id || '').trim()
  if (!key) {
    const error = new Error('Document id is required.')
    error.statusCode = 400
    throw error
  }
  const payload = { ...document, id: key }
  const existing = await findOneOrNull(collection, { id: key })
  if (existing) {
    await collection.replaceOne({ id: key }, payload)
  } else {
    await collection.insertOne(payload)
  }
  return payload
}

module.exports = {
  ensureCollection,
  openDeliveryDb,
  findOneOrNull,
  saveDocumentById
}
