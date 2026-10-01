const { Core } = require('@adobe/aio-sdk')
const libDb = require('@adobe/aio-lib-db')

const COLLECTION = 'conditional_blocks'

async function openCollection (params) {
  const token = await Core.AuthClient.generateAccessToken(params)
  const db = await libDb.init({
    token: token.access_token,
    region: params.DB_REGION || 'amer'
  })
  const client = await db.connect()
  const collection = await client.collection(COLLECTION)
  return { client, collection }
}

function createRulesStore (params, opener = openCollection) {
  async function withCollection (callback) {
    const { client, collection } = await opener(params)
    try {
      return await callback(collection)
    } finally {
      await client.close()
    }
  }

  return {
    get: id => withCollection(collection => collection.findOne({ id })),
    findByName: (name, storeViewCode) => withCollection(collection =>
      collection.findOne({ name, storeViewCode })
    ),
    list: filters => withCollection(async collection => {
      const cursor = collection.find(filters || {})
      return cursor.sort({ priority: 1, name: 1 }).toArray()
    }),
    insert: rule => withCollection(async collection => {
      await collection.insertOne(rule)
      return rule
    }),
    replace: rule => withCollection(async collection => {
      const result = await collection.replaceOne({ id: rule.id }, rule)
      if (result.matchedCount === 0) {
        const error = new Error('Rule not found.')
        error.statusCode = 404
        throw error
      }
      return rule
    }),
    remove: id => withCollection(collection => collection.deleteOne({ id }))
  }
}

module.exports = { createRulesStore, openCollection }
