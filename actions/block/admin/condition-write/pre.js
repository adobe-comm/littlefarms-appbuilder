const { createPresetStore } = require('../../lib/preset-store')

async function preProcess (preset, params) {
  const store = createPresetStore(params)
  const scope = store.scope()
  const normalizedName = preset.name.toLowerCase()
  const duplicate = await store.findByName(scope, normalizedName)
  if (duplicate && duplicate.id !== preset.id) {
    const error = new Error('A condition with this name already exists.')
    error.statusCode = 409
    throw error
  }

  const existing = duplicate?.id === preset.id ? duplicate : await store.get(preset.id)
  const sequence = existing?.sequence || await store.nextSequence(scope)
  return {
    store,
    existing,
    preset: {
      ...preset,
      schemaVersion: 1,
      normalizedName,
      scope,
      sequence,
      createdAt: existing?.createdAt || preset.updatedAt,
      revision: existing ? Number(existing.revision || 1) + 1 : 1
    }
  }
}

module.exports = { preProcess }
