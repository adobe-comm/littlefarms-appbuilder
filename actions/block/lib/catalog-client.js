const nodeFetch = require('node-fetch')
const stateLib = require('@adobe/aio-lib-state')
const { Core } = require('@adobe/aio-sdk')

const TOKEN_KEY = 'catalog.ims-token'
const TOKEN_TTL = 3000
const RETRY_DELAYS = [200, 400]

const PRODUCTS_QUERY = `
  query ConditionalBlockProduct($skus: [String]) {
    products(skus: $skus) {
      sku
      attributes(roles: []) {
        name
        value
      }
      categories {
        externalId
      }
      ... on SimpleProductView {
        price {
          final {
            amount {
              value
            }
          }
        }
      }
      ... on ComplexProductView {
        priceRange {
          minimum {
            final {
              amount {
                value
              }
            }
          }
        }
      }
    }
  }
`

const wait = delay => new Promise(resolve => setTimeout(resolve, delay))

function commerceFetch (url, options) {
  const request = { ...options, headers: { ...options.headers, 'Accept-Encoding': 'identity' } }
  if (typeof globalThis.fetch === 'function') return globalThis.fetch(url, request)
  return nodeFetch(url, { ...request, compress: false })
}

function createCatalogClient (params, dependencies = {}) {
  const fetchImpl = dependencies.fetch || commerceFetch
  const stateFactory = dependencies.stateFactory || stateLib.init
  const tokenFactory = dependencies.tokenFactory || Core.AuthClient.generateAccessToken
  const sleep = dependencies.sleep || wait
  let statePromise

  async function getState () {
    statePromise ||= stateFactory({ region: params.STATE_REGION || 'amer' })
    return statePromise
  }

  async function getToken (refresh = false) {
    const state = await getState()
    if (!refresh) {
      const cached = await state.get(TOKEN_KEY)
      if (cached?.value) return cached.value
    }

    const token = await tokenFactory(params)
    await state.put(TOKEN_KEY, token.access_token, { ttl: TOKEN_TTL })
    return token.access_token
  }

  async function request (sku, storeViewCode, attempt = 0, refreshToken = false) {
    const token = await getToken(refreshToken)
    const response = await fetchImpl(params.COMMERCE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'identity',
        'x-api-key': params.IMS_CLIENT_ID,
        Store: storeViewCode,
        'Magento-Store-View-Code': storeViewCode,
        ...(params.MAGENTO_STORE_CODE ? { 'Magento-Store-Code': params.MAGENTO_STORE_CODE } : {}),
        ...(params.MAGENTO_WEBSITE_CODE ? { 'Magento-Website-Code': params.MAGENTO_WEBSITE_CODE } : {}),
        ...(params.MAGENTO_ENVIRONMENT_ID ? { 'Magento-Environment-Id': params.MAGENTO_ENVIRONMENT_ID } : {}),
        ...(params.MAGENTO_CUSTOMER_GROUP ? { 'Magento-Customer-Group': params.MAGENTO_CUSTOMER_GROUP } : {})
      },
      body: JSON.stringify({
        query: PRODUCTS_QUERY,
        variables: { skus: [sku] }
      })
    })

    if (response.status === 401 && !refreshToken) {
      return request(sku, storeViewCode, attempt, true)
    }
    if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS.length) {
      await sleep(RETRY_DELAYS[attempt])
      return request(sku, storeViewCode, attempt + 1, refreshToken)
    }
    if (!response.ok) {
      throw new Error(`Catalog Service returned ${response.status}.`)
    }

    const payload = await response.json()
    if (payload.errors?.length) {
      throw new Error(`Catalog Service GraphQL error: ${payload.errors[0].message}`)
    }
    return payload.data?.products?.[0] || null
  }

  return { getProduct: request }
}

module.exports = { PRODUCTS_QUERY, createCatalogClient }
