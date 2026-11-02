const { withCommerceCoreGraphqlUrl } = require('../../block/lib/enrich-commerce-params')
const { catalogGraphqlStoreView } = require('../../block/lib/app-scope')

const PRODUCT_ATTRS_QUERY = `
  query DeliverySlotProductAttrs($skus: [String!]!) {
    products(filter: { sku: { in: $skus } }) {
      items {
        sku
        days_availability
        offset_delivery_date
      }
    }
  }
`

/** Legacy DaysAvailabilityOptions / DeliverySlot.php: 0 = Monday … 6 = Sunday */
const ALL_WEEKDAY_INDEXES = ['0', '1', '2', '3', '4', '5', '6']

const WEEKDAY_NAME_TO_INDEX = {
  monday: '0',
  tuesday: '1',
  wednesday: '2',
  thursday: '3',
  friday: '4',
  saturday: '5',
  sunday: '6'
}

function normalizeDayIndex (token) {
  const raw = String(token ?? '').trim()
  if (!raw) return null
  if (/^[0-6]$/.test(raw)) return raw
  const fromName = WEEKDAY_NAME_TO_INDEX[raw.toLowerCase()]
  return fromName != null ? fromName : raw
}

function parseDaysAvailability (value) {
  if (value == null || value === '') return null
  let tokens
  if (Array.isArray(value)) {
    tokens = value.map(v => String(v).trim()).filter(Boolean)
  } else {
    tokens = String(value).split(',').map(part => part.trim()).filter(Boolean)
  }
  const normalized = tokens.map(normalizeDayIndex).filter(Boolean)
  return normalized.length ? normalized : null
}

function normalizeProductRow (item) {
  if (!item?.sku) return null
  const offsetRaw = item.offset_delivery_date
  const offsetDeliveryDate = offsetRaw === true || offsetRaw === 1 || offsetRaw === '1' ||
    String(offsetRaw).toLowerCase() === 'true'
  return {
    sku: item.sku,
    daysAvailability: parseDaysAvailability(item.days_availability),
    offsetDeliveryDate
  }
}

async function loadCartProducts (params, skus) {
  const list = [...new Set((skus || []).map(s => String(s || '').trim()).filter(Boolean))]
  if (!list.length) {
    return { products: [], offsetDeliveryFlag: false, availableDayIndexes: [] }
  }

  params = await withCommerceCoreGraphqlUrl(params)
  if (!params.COMMERCE_CORE_GRAPHQL_URL) {
    const error = new Error('COMMERCE_CORE_GRAPHQL_URL is not configured.')
    error.statusCode = 503
    throw error
  }

  let items = []
  try {
    const storeViewCode = catalogGraphqlStoreView(params)
    const envId = String(params.MAGENTO_ENVIRONMENT_ID || '').trim()
    const response = await fetch(params.COMMERCE_CORE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'identity',
        'Magento-Store-View-Code': storeViewCode,
        ...(envId ? { 'Magento-Environment-Id': envId } : {}),
        'x-api-key': params.MAGENTO_API_KEY || 'not_used'
      },
      body: JSON.stringify({ query: PRODUCT_ATTRS_QUERY, variables: { skus: list } })
    })
    if (response.ok) {
      const payload = await response.json()
      items = payload?.data?.products?.items || []
    }
  } catch {
    items = []
  }

  const products = items.map(normalizeProductRow).filter(Boolean)
  const offsetDeliveryFlag = products.some(p => p.offsetDeliveryDate)

  const perItemDays = products.map(p => {
    if (!p.daysAvailability || !p.daysAvailability.length) {
      return [...ALL_WEEKDAY_INDEXES]
    }
    return p.daysAvailability
  })

  let availableDayIndexes = []
  if (perItemDays.length > 1) {
    availableDayIndexes = perItemDays.reduce((acc, days) =>
      acc.filter(d => days.includes(d))
    )
  } else if (perItemDays.length === 1) {
    availableDayIndexes = [...perItemDays[0]]
  } else if (list.length > 0) {
    // Legacy DeliverySlot.php: $days == '' → array_keys($weekDaysConfig) (all days).
    // PaaS always loads quote line products; if Catalog GraphQL returns no rows, treat like unset attribute.
    availableDayIndexes = [...ALL_WEEKDAY_INDEXES]
  }

  if (offsetDeliveryFlag && availableDayIndexes.length > 4) {
    availableDayIndexes = availableDayIndexes.slice(0, 4)
  }

  return { products, offsetDeliveryFlag, availableDayIndexes }
}

module.exports = {
  loadCartProducts,
  parseDaysAvailability
}
