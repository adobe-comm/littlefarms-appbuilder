const { createRulesStore } = require('../../lib/rules-store')

async function send (request, params) {
  const store = createRulesStore(params)
  if (request.id) {
    const rule = await store.get(request.id)
    if (!rule) {
      const error = new Error('Rule not found.')
      error.statusCode = 404
      throw error
    }
    return { rule }
  }

  const filters = request.storeViewCode ? { storeViewCode: request.storeViewCode } : {}
  return { rules: await store.list(filters) }
}

module.exports = { send }
