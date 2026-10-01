const nodeFetch = require('node-fetch')
const stateLib = require('@adobe/aio-lib-state')
const { Core } = require('@adobe/aio-sdk')
const { MAX_GROUP_DEPTH, DEFAULT_PRODUCTS_TO_DISPLAY, MAX_PRODUCTS_TO_DISPLAY } = require('./constants')

const TOKEN_KEY = 'catalog.ims-token'
const TOKEN_TTL = 3000
const COMMON_ATTRIBUTES = new Set([
  'sku', 'name', 'category_ids', 'price', 'from_price', 'special_price',
  'attribute_set_id', 'custom_design_from', 'custom_design_to',
  'news_from_date', 'news_to_date', 'status', 'visibility'
])

const ATTRIBUTES_QUERY = `
  query ConditionalBlockAttributes {
    attributesList(entityType: CATALOG_PRODUCT) {
      items {
        code
        label
        frontend_input
        options { value label }
      }
      errors { message }
    }
  }
`

const PRODUCTS_QUERY = `
  query ConditionalBlockProductSearch($search: String!) {
    productSearch(phrase: $search, page_size: 20) {
      items {
        productView { sku name }
      }
    }
  }
`

function inputFor (code, frontendInput) {
  if (code === 'sku') return 'sku'
  if (code === 'category_ids' || code === 'category') return 'category'
  const type = String(frontendInput || 'text').toLowerCase()
  if (type === 'date' || type === 'datetime') return 'date'
  if (type === 'select') return 'select'
  if (type === 'multiselect') return 'multiselect'
  if (type === 'boolean') return 'boolean'
  if (type === 'price' || type === 'weight') return 'price'
  if (type === 'textarea') return 'textarea'
  return 'text'
}

function normalizeAttributes (items = []) {
  const attributes = items
    .filter(item => item?.code)
    .map(item => ({
      code: item.code,
      label: item.label || item.code,
      input: inputFor(item.code, item.frontend_input),
      group: COMMON_ATTRIBUTES.has(item.code) ? 'common' : 'custom',
      options: (item.options || [])
        .filter(option => option?.value !== undefined && option?.value !== null)
        .map(option => ({ value: String(option.value), label: option.label || String(option.value) }))
    }))

  for (const required of [
    { code: 'sku', label: 'SKU', input: 'sku' },
    { code: 'category_ids', label: 'Category', input: 'category' }
  ]) {
    if (!attributes.some(attribute => attribute.code === required.code)) {
      attributes.push({ ...required, group: 'common', options: [] })
    }
  }

  return attributes.sort((left, right) => {
    if (left.group !== right.group) return left.group === 'common' ? -1 : 1
    return left.label.localeCompare(right.label)
  })
}

const REST_OPERATORS = new Set(['eq', 'neq', 'in', 'nin', 'gt', 'gte', 'lt', 'lte'])
const MATCH_PAGE_SIZE = 100
const MATCH_PAGE_LIMIT = 5
const CATEGORY_PAGE_SIZE = 200
const CATEGORY_PAGE_LIMIT = 10
const PRODUCT_CHOOSER_PAGE_SIZE = 50

function conditionValues (condition) {
  return Array.isArray(condition?.value)
    ? condition.value.map(value => String(value).trim()).filter(Boolean)
    : String(condition?.value ?? '').split(',').map(value => value.trim()).filter(Boolean)
}

function restField (attribute) {
  return attribute === 'category_ids' || attribute === 'category' ? 'category_id' : attribute
}

function toRestClause (condition) {
  const field = restField(condition?.attribute)
  const values = conditionValues(condition)
  const operator = condition?.operator
  if (!field || !REST_OPERATORS.has(operator) || values.length === 0) return null
  // Commerce applies each category_id filter on its own. Several category
  // IDs must go in one in / nin value, or the result is "in every category".
  if (field === 'category_id' && values.length > 1 && (operator === 'eq' || operator === 'in')) {
    return { mode: 'or', filters: [{ field, value: values.join(','), conditionType: 'in' }] }
  }
  if (field === 'category_id' && values.length > 1 && (operator === 'neq' || operator === 'nin')) {
    return { mode: 'or', filters: [{ field, value: values.join(','), conditionType: 'nin' }] }
  }
  // "is" / "is one of" with several values is a match against any of them.
  // Each value is its own eq filter so Commerce does not treat "7556,7053" as one SKU.
  if (operator === 'in' || (operator === 'eq' && values.length > 1)) {
    return { mode: 'or', filters: values.map(value => ({ field, value, conditionType: 'eq' })) }
  }
  if (operator === 'nin' || (operator === 'neq' && values.length > 1)) {
    return { mode: 'and', filters: values.map(value => ({ field, value, conditionType: 'neq' })) }
  }
  return { mode: 'or', filters: [{ field, value: values[0], conditionType: operator }] }
}

function productListQuery (rule = {}, page = 1) {
  const clauses = (rule.conditions || []).map(toRestClause)
  if (clauses.length === 0 || clauses.some(clause => !clause)) return null
  const params = new URLSearchParams()
  const groups = []
  if (rule.aggregator === 'any') {
    groups.push(clauses.flatMap(clause => clause.mode === 'and' && clause.filters.length > 1
      ? [{ field: clause.filters[0].field, value: clause.filters.map(filter => filter.value).join(','), conditionType: 'nin' }]
      : clause.filters))
  } else {
    clauses.forEach(clause => {
      if (clause.mode === 'and') clause.filters.forEach(filter => groups.push([filter]))
      else groups.push(clause.filters)
    })
  }
  groups.forEach((group, groupIndex) => {
    group.forEach((filter, filterIndex) => {
      const prefix = `searchCriteria[filterGroups][${groupIndex}][filters][${filterIndex}]`
      params.set(`${prefix}[field]`, filter.field)
      params.set(`${prefix}[value]`, filter.value)
      params.set(`${prefix}[condition_type]`, filter.conditionType)
    })
  })
  params.set('searchCriteria[pageSize]', String(MATCH_PAGE_SIZE))
  params.set('searchCriteria[currentPage]', String(page))
  return params
}

function isConditionGroup (node) {
  return Array.isArray(node?.conditions) && !node.attribute
}

function displayLimit (rule) {
  const requested = Number(rule?.productsToDisplay)
  if (!Number.isInteger(requested) || requested < 1) return DEFAULT_PRODUCTS_TO_DISPLAY
  return Math.min(requested, MAX_PRODUCTS_TO_DISPLAY)
}

function unionSets (sets) {
  const products = new Map()
  for (const set of sets) {
    for (const [sku, product] of set) products.set(sku, product)
  }
  return products
}

function intersectSets (sets) {
  const [first, ...rest] = sets
  const products = new Map()
  if (!first) return products
  for (const [sku, product] of first) {
    if (rest.every(set => set.has(sku))) products.set(sku, product)
  }
  return products
}

function restCatalogUrl (params, resource, query) {
  const endpoint = new URL(params.COMMERCE_CORE_GRAPHQL_URL)
  endpoint.pathname = `${endpoint.pathname.replace(/\/graphql\/?$/, '').replace(/\/$/, '')}/V1/${resource}`
  endpoint.search = query ? query.toString() : ''
  endpoint.hash = ''
  return endpoint.toString()
}

function restProductsUrl (params, query) {
  return restCatalogUrl(params, 'products', query)
}

function categoryListQuery (page = 1) {
  const params = new URLSearchParams()
  params.set('searchCriteria[pageSize]', String(CATEGORY_PAGE_SIZE))
  params.set('searchCriteria[currentPage]', String(page))
  return params
}

function addBrowseFilter (params, group, field, value, conditionType) {
  if (!value) return group
  const prefix = `searchCriteria[filterGroups][${group}][filters][0]`
  params.set(`${prefix}[field]`, field)
  params.set(`${prefix}[value]`, conditionType === 'like' ? `%${value}%` : value)
  params.set(`${prefix}[condition_type]`, conditionType)
  return group + 1
}

function productBrowseQuery (filters = {}, page = 1) {
  const params = new URLSearchParams()
  let group = 0
  group = addBrowseFilter(params, group, 'entity_id', String(filters.entityId || '').trim(), 'eq')
  group = addBrowseFilter(params, group, 'type_id', String(filters.typeId || '').trim(), 'eq')
  group = addBrowseFilter(params, group, 'attribute_set_id', String(filters.attributeSetId || '').trim(), 'eq')
  group = addBrowseFilter(params, group, 'sku', String(filters.sku || '').trim(), 'like')
  addBrowseFilter(params, group, 'name', String(filters.name || '').trim(), 'like')
  params.set('searchCriteria[pageSize]', String(PRODUCT_CHOOSER_PAGE_SIZE))
  params.set('searchCriteria[currentPage]', String(Math.max(1, Number(page) || 1)))
  return params
}

function toSearchFilter (condition) {
  const attribute = condition?.attribute === 'category_ids' || condition?.attribute === 'category'
    ? 'categoryIds'
    : condition?.attribute
  const values = Array.isArray(condition?.value)
    ? condition.value.map(value => String(value).trim()).filter(Boolean)
    : String(condition?.value ?? '').split(',').map(value => value.trim()).filter(Boolean)
  if (!attribute || values.length === 0) return null
  if (condition.operator === 'eq') return { attribute, eq: values[0] }
  if (condition.operator === 'in') return { attribute, in: values }
  const number = Number(values[0])
  if (!Number.isFinite(number)) return null
  if (condition.operator === 'gt' || condition.operator === 'gte') return { attribute, range: { from: number } }
  if (condition.operator === 'lt' || condition.operator === 'lte') return { attribute, range: { to: number } }
  return null
}

function catalogCategoryChoices (categories = []) {
  const byId = new Map(categories.filter(category => category?.id).map(category => [String(category.id), category]))
  return [...byId.values()]
    .sort((left, right) => String(left.path || left.id).localeCompare(String(right.path || right.id), undefined, { numeric: true }))
    .map(category => {
      const names = String(category.path || category.id)
        .split('/')
        .map(id => byId.get(id)?.name)
        .filter(Boolean)
      return { id: String(category.id), label: names.join(' / ') || category.name }
    })
}

function flattenCategories (nodes = [], prefix = '') {
  return nodes.flatMap(node => {
    if (!node?.id) return []
    const label = prefix ? `${prefix} / ${node.name}` : node.name
    return [
      { id: String(node.id), label },
      ...flattenCategories(node.children || [], label)
    ]
  })
}

function commerceFetch (url, options) {
  const request = { ...options, headers: { ...options.headers, 'Accept-Encoding': 'identity' } }
  if (typeof globalThis.fetch === 'function') return globalThis.fetch(url, request)
  return nodeFetch(url, { ...request, compress: false })
}

function environmentId (params) {
  if (params.MAGENTO_ENVIRONMENT_ID) return params.MAGENTO_ENVIRONMENT_ID
  try {
    return new URL(params.COMMERCE_CORE_GRAPHQL_URL).pathname
      .split('/')
      .filter(segment => segment && segment !== 'graphql')[0] || ''
  } catch {
    return ''
  }
}

function isSaaSCommerceUrl (url) {
  return /api\.commerce\.adobe\.com/i.test(String(url || ''))
}

const { catalogGraphqlStoreView } = require('./app-scope')

function catalogHeaders (params) {
  const storeViewCode = catalogGraphqlStoreView(params)
  const saas = isSaaSCommerceUrl(params.COMMERCE_CORE_GRAPHQL_URL)
  const resolvedEnvironmentId = environmentId(params)
  return {
    'Magento-Store-View-Code': storeViewCode,
    ...(params.MAGENTO_STORE_CODE ? { 'Magento-Store-Code': params.MAGENTO_STORE_CODE } : {}),
    ...(params.MAGENTO_WEBSITE_CODE ? { 'Magento-Website-Code': params.MAGENTO_WEBSITE_CODE } : {}),
    ...(resolvedEnvironmentId ? { 'Magento-Environment-Id': resolvedEnvironmentId } : {}),
    ...(params.MAGENTO_CUSTOMER_GROUP ? { 'Magento-Customer-Group': params.MAGENTO_CUSTOMER_GROUP } : {}),
    'x-api-key': saas ? (params.MAGENTO_API_KEY || 'not_used') : params.IMS_CLIENT_ID,
    ...(saas ? {} : { Authorization: `Bearer ${params.__accessToken}` })
  }
}

function createAttributeCatalog (params, dependencies = {}) {
  const fetchImpl = dependencies.fetch || commerceFetch
  const stateFactory = dependencies.stateFactory || stateLib.init
  const tokenFactory = dependencies.tokenFactory || Core.AuthClient.generateAccessToken
  let statePromise

  async function getToken (refresh = false) {
    statePromise ||= stateFactory({ region: params.STATE_REGION || 'amer' })
    const state = await statePromise
    if (!refresh) {
      const cached = await state.get(TOKEN_KEY)
      if (cached?.value) return cached.value
    }
    const token = await tokenFactory(params)
    await state.put(TOKEN_KEY, token.access_token, { ttl: TOKEN_TTL })
    return token.access_token
  }

  async function graphql (query, variables, refreshToken = false, attempt = 0) {
    if (!params.COMMERCE_CORE_GRAPHQL_URL) {
      const error = new Error('COMMERCE_CORE_GRAPHQL_URL is not configured.')
      error.statusCode = 503
      throw error
    }
    const token = await getToken(refreshToken)
    const headers = catalogHeaders({ ...params, __accessToken: token })
    let response
    try {
      response = await fetchImpl(params.COMMERCE_CORE_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'identity',
          ...headers
        },
        body: JSON.stringify({ query, variables: variables || {} })
      })
    } catch (error) {
      if (attempt < 1 && error?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        return graphql(query, variables, refreshToken, attempt + 1)
      }
      throw error
    }
    if (response.status === 401 && !refreshToken) return graphql(query, variables, true)
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`Commerce GraphQL returned ${response.status}: ${detail.slice(0, 500)}`)
    }
    const payload = await response.json()
    if (payload.errors?.length) throw new Error(payload.errors[0].message)
    return payload.data || {}
  }

  async function restGet (url, refreshToken = false, attempt = 0) {
    const token = await getToken(refreshToken)
    let response
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'identity',
          Authorization: `Bearer ${token}`,
          Store: 'all'
        }
      })
    } catch (error) {
      if (attempt < 1 && error?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        return restGet(url, refreshToken, attempt + 1)
      }
      throw error
    }
    if (response.status === 401 && !refreshToken) return restGet(url, true)
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`Commerce REST returned ${response.status}: ${detail.slice(0, 500)}`)
    }
    return response.json()
  }

  async function fetchLeafSet (rule) {
    if (!productListQuery(rule)) {
      throw new Error('Add a condition with a supported comparison.')
    }
    const products = new Map()
    let page = 1
    let total = Infinity
    while (products.size < total && page <= MATCH_PAGE_LIMIT) {
      const payload = await restGet(restProductsUrl(params, productListQuery(rule, page)))
      const items = payload.items || []
      for (const item of items) {
        if (item?.sku) products.set(item.sku, { sku: item.sku, name: item.name || item.sku })
      }
      total = Number.isFinite(Number(payload.total_count)) ? Number(payload.total_count) : products.size
      if (items.length === 0) break
      page += 1
    }
    return products
  }

  async function matchNode (node, depth) {
    if (!isConditionGroup(node)) {
      return fetchLeafSet({ aggregator: 'all', matchValue: true, conditions: [node] })
    }
    if (node.matchValue === false) {
      throw new Error('Fetch SKUs supports conditions that are TRUE.')
    }
    if (depth > MAX_GROUP_DEPTH) {
      throw new Error('Condition groups can be nested at most 3 levels.')
    }
    if (!node.conditions.length) {
      throw new Error('Add a condition with a supported comparison.')
    }
    // Each condition is its own Commerce request. Magento applies every
    // category_id filter through addCategoriesFilter, so two category rows
    // in one search become "in both categories" even when the group is ANY.
    const sets = []
    for (const child of node.conditions) sets.push(await matchNode(child, depth + 1))
    return node.aggregator === 'any' ? unionSets(sets) : intersectSets(sets)
  }

  return {
    async listAttributes () {
      const data = await graphql(ATTRIBUTES_QUERY)
      const errors = data.attributesList?.errors || []
      if (errors.length) throw new Error(errors[0].message)
      return normalizeAttributes(data.attributesList?.items)
    },
    async listCategories () {
      if (!params.COMMERCE_CORE_GRAPHQL_URL) {
        const error = new Error('COMMERCE_CORE_GRAPHQL_URL is not configured.')
        error.statusCode = 503
        throw error
      }
      const items = []
      let page = 1
      let total = Infinity
      while (items.length < total && page <= CATEGORY_PAGE_LIMIT) {
        const payload = await restGet(restCatalogUrl(params, 'categories/list', categoryListQuery(page)))
        items.push(...(payload.items || []))
        total = Number.isFinite(Number(payload.total_count)) ? Number(payload.total_count) : items.length
        if (!(payload.items || []).length) break
        page += 1
      }
      return catalogCategoryChoices(items)
    },
    async browseProducts (filters = {}, page = 1) {
      if (!params.COMMERCE_CORE_GRAPHQL_URL) {
        const error = new Error('COMMERCE_CORE_GRAPHQL_URL is not configured.')
        error.statusCode = 503
        throw error
      }
      const payload = await restGet(restProductsUrl(params, productBrowseQuery(filters, page)))
      return {
        page: Math.max(1, Number(page) || 1),
        pageSize: PRODUCT_CHOOSER_PAGE_SIZE,
        total: Number.isFinite(Number(payload.total_count)) ? Number(payload.total_count) : (payload.items || []).length,
        items: (payload.items || [])
          .filter(item => item?.sku)
          .map(item => ({
            id: String(item.id ?? item.sku),
            sku: item.sku,
            name: item.name || item.sku,
            typeId: item.type_id || '',
            attributeSetId: item.attribute_set_id == null ? '' : String(item.attribute_set_id)
          }))
      }
    },
    async searchProducts (search) {
      const term = String(search || '').trim()
      if (term.length < 2) return []
      const data = await graphql(PRODUCTS_QUERY, { search: term })
      const items = data.productSearch?.items || data.products?.items || []
      return items
        .map(item => item.productView || item)
        .filter(item => item?.sku)
        .map(item => ({ sku: item.sku, name: item.name || item.sku }))
    },
    async matchProducts (rule = {}) {
      const products = await matchNode(rule, 1)
      return [...products.values()]
        .sort((left, right) => String(left.sku).localeCompare(String(right.sku), undefined, { numeric: true }))
        .slice(0, displayLimit(rule))
    }
  }
}

module.exports = {
  COMMON_ATTRIBUTES,
  normalizeAttributes,
  catalogCategoryChoices,
  flattenCategories,
  toSearchFilter,
  toRestClause,
  productListQuery,
  productBrowseQuery,
  restCatalogUrl,
  restProductsUrl,
  createAttributeCatalog
}
