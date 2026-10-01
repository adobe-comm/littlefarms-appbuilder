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
  BLOCK_TYPE_BRANDS_LIST,
  BLOCK_TYPES,
  MAX_BRAND_ITEMS
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

function isLikelyUrl (value) {
  try {
    // eslint-disable-next-line no-new
    new URL(value)
    return true
  } catch {
    return value.startsWith('/')
  }
}

function validateFeaturedLogic (logic, errors) {
  if (!AGGREGATORS.includes(logic.aggregator)) {
    addError(errors, 'aggregator', 'Aggregator must be all or any.')
  }
  if (logic.matchValue !== undefined &&
    ![true, false, 'true', 'false'].includes(logic.matchValue)) {
    addError(errors, 'matchValue', 'Match value must be true or false.')
  }
  const displayCount = productsToDisplay(logic.productsToDisplay, errors)
  const conditions = normalizeNodes(logic.conditions, 'conditions', 2, errors)
  return {
    aggregator: logic.aggregator,
    matchValue: logic.matchValue !== false && logic.matchValue !== 'false',
    productsToDisplay: displayCount,
    conditions
  }
}

function validateBrandsListLogic (logic, errors) {
  const url = String(logic?.url ?? '').trim()
  if (url && !isLikelyUrl(url)) {
    addError(errors, 'url', 'URL must be a valid absolute URL or a path starting with /.')
  }

  const rawItems = Array.isArray(logic?.items) ? logic.items : []
  if (rawItems.length === 0) {
    addError(errors, 'items', 'Add at least one brand item.')
    return { url, items: [] }
  }
  if (rawItems.length > MAX_BRAND_ITEMS) {
    addError(errors, 'items', `A brands list can contain at most ${MAX_BRAND_ITEMS} items.`)
  }

  const items = rawItems.slice(0, MAX_BRAND_ITEMS).map((item, index) => {
    const name = String(item?.name ?? '').trim()
    const link = String(item?.link ?? '').trim()
    const image = String(item?.image ?? '').trim()
    if (!name) addError(errors, `items.${index}.name`, 'Brand name is required.')
    if (!link) addError(errors, `items.${index}.link`, 'Brand link is required.')
    else if (!isLikelyUrl(link)) {
      addError(errors, `items.${index}.link`, 'Link must be a valid absolute URL or a path starting with /.')
    }
    if (image && !isLikelyUrl(image)) {
      addError(errors, `items.${index}.image`, 'Image must be a valid absolute URL or a path starting with /.')
    }
    return { image, name, link }
  }).filter(item => item.name || item.link || item.image)

  const completeItems = items.filter(item => item.name && item.link)
  if (completeItems.length === 0 && errors.every(error => !String(error.field).startsWith('items.'))) {
    addError(errors, 'items', 'Add at least one brand with name and link.')
  }

  return { url, items: completeItems.length > 0 ? completeItems : items }
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

  let normalizedLogic
  if (blockType === BLOCK_TYPE_BRANDS_LIST) {
    normalizedLogic = validateBrandsListLogic(logic, errors)
  } else {
    normalizedLogic = validateFeaturedLogic(logic, errors)
  }

  if (errors.length > 0) return { valid: false, errors }

  return {
    valid: true,
    value: {
      id: String(preset.id || '').trim() || undefined,
      name,
      blockType,
      enabled: preset.enabled !== false,
      logic: normalizedLogic
    }
  }
}

module.exports = { validatePreset }
