const { createPresetStore } = require('../../lib/preset-store')

async function preProcess (input, params) {
  const store = createPresetStore(params)
  const existing = await store.get(input.id)
  if (!existing) {
    const error = new Error('Saved condition not found.')
    error.statusCode = 404
    throw error
  }
  return { store, id: input.id }
}

module.exports = { preProcess }
