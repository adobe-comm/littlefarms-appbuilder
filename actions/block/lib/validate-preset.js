const {
  AGGREGATORS,
  ATTRIBUTE_CODE,
  OPERATORS,
  NUMERIC_OPERATORS,
  MAX_LIST_VALUES,
  MAX_GROUP_DEPTH,
  DEFAULT_PRODUCTS_TO_DISPLAY,
  MAX_PRODUCTS_TO_DISPLAY,
  DEFAULT_BLOCK_TYPE,
  BLOCK_TYPES
} = require('./constants')

function addError (errors, field, message) {
  errors.push({ field, message })
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

function isGroup (node) {
  return Array.isArray(node?.conditions) && !node.attribute
}

function productsToDisplay (value, errors) {
  if (value === undefined || value === null || value === '') return DEFAULT_PRODUCTS_TO_DISPLAY
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > MAX_PRODUCTS_TO_DISPLAY) {
    addError(errors, 'productsToDisplay', 'Number of products to display must be a whole number from 1 to 50.')
    return DEFAULT_PRODUCTS_TO_DISPLAY
  }
  return number
}

function normalizeNode (node, path, depth, errors) {
  if (isGroup(node)) {
    if (depth > MAX_GROUP_DEPTH) {
      addError(errors, path, 'Condition groups can be nested at most 3 levels.')
      return { aggregator: 'all', matchValue: true, conditions: [] }
    }
    if (!AGGREGATORS.includes(node.aggregator)) {
      addError(errors, `${path}.aggregator`, 'Aggregator must be all or any.')
    }
    if (node.matchValue !== undefined && ![true, false, 'true', 'false'].includes(node.matchValue)) {
      addError(errors, `${path}.matchValue`, 'Match value must be true or false.')
    }
    return {
      aggregator: AGGREGATORS.includes(node.aggregator) ? node.aggregator : 'all',
      matchValue: node.matchValue !== false && node.matchValue !== 'false',
      conditions: normalizeNodes(node.conditions, `${path}.conditions`, depth + 1, errors)
    }
  }

  if (!ATTRIBUTE_CODE.test(String(node?.attribute || ''))) {
    addError(errors, `${path}.attribute`, 'Attribute code is not valid.')
  }
  if (!OPERATORS.includes(node?.operator)) {
    addError(errors, `${path}.operator`, 'Operator is not supported.')
  }
  const values = node?.operator === 'in' || node?.operator === 'nin'
    ? (Array.isArray(node.value) ? node.value : String(node?.value || '').split(','))
    : [node?.value]
  const present = values.map(value => String(value ?? '').trim()).filter(Boolean)
  if (present.length === 0) addError(errors, `${path}.value`, 'A condition value is required.')
  if (present.length > MAX_LIST_VALUES) {
    addError(errors, `${path}.value`, `A list can contain at most ${MAX_LIST_VALUES} values.`)
  }
  return node?.attribute && node?.operator ? normalizeCondition(node) : node
}

function normalizeNodes (nodes, path, depth, errors) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    addError(errors, path, 'At least one condition is required.')
    return []
  }
  return nodes.map((node, index) => normalizeNode(node, `${path}.${index}`, depth, errors))
}

function validatePreset (input) {
  const errors = []
  const preset = input || {}
  const logic = preset.logic || preset
  const name = String(preset.name || '').trim()
  const blockType = String(preset.blockType || DEFAULT_BLOCK_TYPE).trim()

  if (!name) addError(errors, 'name', 'Name is required.')
  if (!BLOCK_TYPES.includes(blockType)) {
    addError(errors, 'blockType', 'Block type is not supported.')
  }
  if (!AGGREGATORS.includes(logic.aggregator)) {
    addError(errors, 'aggregator', 'Aggregator must be all or any.')
  }
  if (logic.matchValue !== undefined &&
    ![true, false, 'true', 'false'].includes(logic.matchValue)) {
    addError(errors, 'matchValue', 'Match value must be true or false.')
  }
  const displayCount = productsToDisplay(logic.productsToDisplay, errors)
  const conditions = normalizeNodes(logic.conditions, 'conditions', 2, errors)

  if (errors.length > 0) return { valid: false, errors }

  return {
    valid: true,
    value: {
      id: String(preset.id || '').trim() || undefined,
      name,
      blockType,
      enabled: preset.enabled !== false,
      logic: {
        aggregator: logic.aggregator,
        matchValue: logic.matchValue !== false && logic.matchValue !== 'false',
        productsToDisplay: displayCount,
        conditions
      }
    }
  }
}

module.exports = { validatePreset }
