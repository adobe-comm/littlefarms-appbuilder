const { createRulesStore } = require('../../lib/rules-store')

async function preProcess (request, params) {
  const store = createRulesStore(params)
  const rule = await store.get(request.id)
  if (!rule) {
    const error = new Error('Rule not found.')
    error.statusCode = 404
    throw error
  }
  return { rule, store }
}

module.exports = { preProcess }
