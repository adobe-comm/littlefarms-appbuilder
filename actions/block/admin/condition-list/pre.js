const { createPresetStore } = require('../../lib/preset-store')

async function preProcess (request, params) {
  const store = createPresetStore(params)
  return { ...request, store, scope: store.scope() }
}

module.exports = { preProcess }
