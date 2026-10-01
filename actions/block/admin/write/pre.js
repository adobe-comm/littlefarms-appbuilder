const { createRulesStore } = require('../../lib/rules-store')

async function preProcess (rule, params) {
  const store = createRulesStore(params)
  const duplicate = await store.findByName(rule.name, rule.storeViewCode)
  if (duplicate && duplicate.id !== rule.id) {
    const error = new Error('A rule with this name already exists in the store view.')
    error.statusCode = 400
    error.errors = [{ field: 'name', message: error.message }]
    throw error
  }
  return { rule, store }
}

module.exports = { preProcess }
