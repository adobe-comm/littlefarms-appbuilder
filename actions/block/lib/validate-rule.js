const {
  AGGREGATORS,
  ATTRIBUTE_CODE,
  OPERATORS,
  NUMERIC_OPERATORS,
  DEFAULT_PRIORITY,
  MAX_LIST_VALUES
} = require('./constants')
const { GLOBAL_SCOPE_STORE_VIEW } = require('./app-scope')

function addError (errors, field, message) {
  errors.push({ field, message })
}

function normalizeTargetSkus (targetSkus) {
  const values = Array.isArray(targetSkus)
    ? targetSkus
    : String(targetSkus || '').split(/[\n,]/)
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))]
}

function normalizeCondition (condition) {
  let value = condition.value
  if (condition.operator === 'in' || condition.operator === 'nin') {
    value = Array.isArray(value)
      ? value.map(item => String(item).trim()).filter(Boolean)
      : String(value || '').split(',').map(item => item.trim()).filter(Boolean)
  } else if ((NUMERIC_OPERATORS.includes(condition.operator) ||
    ['amount', 'price', 'from_price'].includes(condition.attribute)) &&
    !/^\d{4}-\d{2}-\d{2}/.test(String(value ?? ''))) {
    value = Number(value)
  } else {
    value = String(value ?? '').trim()
  }

  return {
    attribute: condition.attribute,
    operator: condition.operator,
    value
  }
}

function validateRule (input) {
  const errors = []
  const rule = input || {}

  if (!String(rule.name || '').trim()) addError(errors, 'name', 'Name is required.')
  if (!AGGREGATORS.includes(rule.aggregator)) {
    addError(errors, 'aggregator', 'Aggregator must be all or any.')
  }
  if (rule.matchValue !== undefined &&
    ![true, false, 'true', 'false'].includes(rule.matchValue)) {
    addError(errors, 'matchValue', 'Match value must be true or false.')
  }
  if (rule.priority !== undefined && !Number.isInteger(Number(rule.priority))) {
    addError(errors, 'priority', 'Priority must be an integer.')
  }
  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    addError(errors, 'conditions', 'At least one condition is required.')
  } else {
    rule.conditions.forEach((condition, index) => {
      if (!ATTRIBUTE_CODE.test(String(condition.attribute || ''))) {
        addError(errors, `conditions.${index}.attribute`, 'Attribute code is not valid.')
      }
      if (!OPERATORS.includes(condition.operator)) {
        addError(errors, `conditions.${index}.operator`, 'Operator is not supported.')
      }
      const values = condition.operator === 'in' || condition.operator === 'nin'
        ? (Array.isArray(condition.value) ? condition.value : String(condition.value || '').split(','))
        : [condition.value]
      if (values.map(value => String(value ?? '').trim()).filter(Boolean).length === 0) {
        addError(errors, `conditions.${index}.value`, 'A condition value is required.')
      }
      if (values.length > MAX_LIST_VALUES) {
        addError(errors, `conditions.${index}.value`, `A list can contain at most ${MAX_LIST_VALUES} values.`)
      }
    })
  }

  const targetSkus = normalizeTargetSkus(rule.targetSkus)
  if (targetSkus.length === 0 && !String(rule.contentHtml || '').trim()) {
    addError(errors, 'targetSkus', 'Add at least one target SKU or content.')
  }

  if (errors.length > 0) return { valid: false, errors }

  return {
    valid: true,
    value: {
      ...rule,
      name: rule.name.trim(),
      enabled: rule.enabled !== false,
      matchValue: rule.matchValue !== false && rule.matchValue !== 'false',
      storeViewCode: String(rule.storeViewCode || GLOBAL_SCOPE_STORE_VIEW).trim() || GLOBAL_SCOPE_STORE_VIEW,
      priority: rule.priority === undefined ? DEFAULT_PRIORITY : Number(rule.priority),
      conditions: rule.conditions.map(normalizeCondition),
      targetSkus,
      title: String(rule.title || '').trim(),
      contentHtml: String(rule.contentHtml || '').trim()
    }
  }
}

module.exports = { validateRule, normalizeTargetSkus }
