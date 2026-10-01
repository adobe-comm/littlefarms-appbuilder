const { DEFAULT_PRIORITY, NUMERIC_OPERATORS } = require('./constants')

function normalizeScalar (value) {
  return typeof value === 'string' ? value.trim() : value
}

function normalizeList (value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',')
  return list.map(normalizeScalar).filter(value => value !== '')
}

function valuesEqual (left, right) {
  if (typeof left === 'number' || typeof right === 'number') {
    const leftNumber = Number(left)
    const rightNumber = Number(right)
    return Number.isFinite(leftNumber) &&
      Number.isFinite(rightNumber) &&
      leftNumber === rightNumber
  }

  return String(normalizeScalar(left)) === String(normalizeScalar(right))
}

function isInList (actual, expected) {
  const actualValues = Array.isArray(actual) ? actual : [actual]
  const expectedValues = normalizeList(expected)
  return actualValues.some(actualValue =>
    expectedValues.some(expectedValue => valuesEqual(actualValue, expectedValue))
  )
}

function dateKey (value) {
  const match = String(value ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function compareNumeric (actual, expected, operator) {
  const actualNumber = Number(actual)
  const expectedNumber = Number(expected)
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) {
    return false
  }

  if (operator === 'gt') return actualNumber > expectedNumber
  if (operator === 'gte') return actualNumber >= expectedNumber
  if (operator === 'lt') return actualNumber < expectedNumber
  return actualNumber <= expectedNumber
}

function matchCondition (product, condition) {
  const actual = product?.[condition?.attribute]
  if (actual === undefined || actual === null) {
    return false
  }

  const { operator, value } = condition
  const actualDate = dateKey(actual)
  const expectedDate = dateKey(value)
  if (actualDate && expectedDate) {
    if (operator === 'eq') return actualDate === expectedDate
    if (operator === 'neq') return actualDate !== expectedDate
    if (NUMERIC_OPERATORS.includes(operator)) {
      return compareNumeric(Date.parse(actualDate), Date.parse(expectedDate), operator)
    }
  }
  if (NUMERIC_OPERATORS.includes(operator)) {
    return compareNumeric(actual, value, operator)
  }
  if (operator === 'eq') {
    return Array.isArray(actual) ? isInList(actual, [value]) : valuesEqual(actual, value)
  }
  if (operator === 'neq') {
    return Array.isArray(actual) ? !isInList(actual, [value]) : !valuesEqual(actual, value)
  }
  if (operator === 'in') return isInList(actual, value)
  if (operator === 'nin') return !isInList(actual, value)
  return false
}

function matchRule (product, rule) {
  if (!rule?.enabled || !Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    return false
  }

  let matched = false
  if (rule.aggregator === 'all') {
    matched = rule.conditions.every(condition => matchCondition(product, condition))
  } else if (rule.aggregator === 'any') {
    matched = rule.conditions.some(condition => matchCondition(product, condition))
  } else {
    return false
  }
  return rule.matchValue === false ? !matched : matched
}

function selectBlocks (product, rules, storeViewCode) {
  return rules
    .filter(rule => rule.storeViewCode === '*' || rule.storeViewCode === storeViewCode)
    .filter(rule => matchRule(product, rule))
    .sort((left, right) => {
      const priority = (left.priority ?? DEFAULT_PRIORITY) - (right.priority ?? DEFAULT_PRIORITY)
      return priority || left.name.localeCompare(right.name)
    })
    .map(rule => ({
      id: rule.id,
      name: rule.name,
      priority: rule.priority ?? DEFAULT_PRIORITY,
      title: rule.title || '',
      contentHtml: rule.contentHtml || '',
      targetSkus: rule.targetSkus || []
    }))
}

module.exports = { matchCondition, matchRule, selectBlocks }
