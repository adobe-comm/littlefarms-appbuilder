const { createPresetStore, readBlockId } = require('../../lib/preset-store')

async function preProcess (preset, params) {
  const store = createPresetStore(params)
  const scope = store.scope()
  const normalizedName = preset.name.toLowerCase()
  const duplicate = await store.findByName(scope, normalizedName)
  const lookupKey = preset.id || (preset.blockId != null ? String(preset.blockId) : '')
  const existing = lookupKey ? await store.get(lookupKey) : null

  if (duplicate && readBlockId(duplicate) !== readBlockId(existing)) {
    const error = new Error('A condition with this name already exists.')
    error.statusCode = 409
    throw error
  }

  const blockId = readBlockId(existing) || await store.nextBlockId(scope)
  return {
    store,
    existing,
    preset: {
      ...preset,
      schemaVersion: 2,
      normalizedName,
      scope,
      blockId,
      id: String(blockId),
      createdAt: existing?.createdAt || preset.updatedAt,
      revision: existing ? Number(existing.revision || 1) + 1 : 1
    }
  }
}

module.exports = { preProcess }
