const { createPresetStore, presetCacheKey, readBlockId } = require('../../lib/preset-store')

async function preProcess (input, params) {
  const store = createPresetStore(params)
  const existing = await store.get(input.id)
  if (!existing) {
    const error = new Error('Saved condition not found.')
    error.statusCode = 404
    throw error
  }
  const blockId = readBlockId(existing)
  const id = blockId != null ? String(blockId) : String(input.id)
  return { store, id, cacheKey: presetCacheKey(existing) }
}

module.exports = { preProcess }
