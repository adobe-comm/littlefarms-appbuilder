const { Core } = require('@adobe/aio-sdk')
const { withCommerceCoreRestUrl } = require('../../block/lib/enrich-commerce-params')

async function restContext (params) {
  params = await withCommerceCoreRestUrl(params)
  const restBase = String(params.COMMERCE_CORE_REST_URL || '').trim().replace(/\/$/, '')
  if (!restBase) {
    const error = new Error(
      'COMMERCE_CORE_REST_URL is not configured (App Management business config or workspace env).'
    )
    error.statusCode = 503
    throw error
  }
  const { access_token: accessToken } = await Core.AuthClient.generateAccessToken(params)
  return { restBase, accessToken }
}

function deliverySlotFromOrder (order) {
  const rows = order?.custom_attributes
  if (!Array.isArray(rows) || !rows.length) return null

  const attrs = {}
  for (const row of rows) {
    if (row?.attribute_code != null) attrs[String(row.attribute_code)] = row.value
  }
  if (!attrs.delivery_date_time) return null

  return {
    deliveryDateTime: String(attrs.delivery_date_time).trim(),
    deliveryDateTimeSlot: String(attrs.delivery_date_time_slot || '').trim(),
    path: String(attrs.delivery_slot_path || 'regular').trim() || 'regular'
  }
}

async function fetchOrderByIncrementId (params, incrementId) {
  const { restBase, accessToken } = await restContext(params)
  const query = new URLSearchParams({
    'searchCriteria[filterGroups][0][filters][0][field]': 'increment_id',
    'searchCriteria[filterGroups][0][filters][0][value]': incrementId
  })
  const response = await fetch(`${restBase}/V1/orders?${query}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.message || `Commerce REST GET orders HTTP ${response.status}`)
    error.statusCode = response.status
    throw error
  }
  return payload?.items?.[0] || null
}

/** GET order by increment id — entity id + current slot from custom_attributes. */
async function loadOrderDeliverySlotByIncrementId (params, incrementId) {
  const order = await fetchOrderByIncrementId(params, incrementId)
  if (!order?.entity_id) return null
  const slot = deliverySlotFromOrder(order)
  if (!slot) return null
  return { entityId: String(order.entity_id), ...slot }
}

async function updateOrderDeliveryCustomAttributes (params, entityId, fields) {
  const { restBase, accessToken } = await restContext(params)
  const customAttributes = [
    { attribute_code: 'delivery_date_time', value: String(fields.deliveryDateTime || '') },
    { attribute_code: 'delivery_date_time_slot', value: String(fields.deliveryDateTimeSlot || '') }
  ]
  const path = String(fields.path || '').trim()
  if (path && path !== 'regular') {
    customAttributes.push({ attribute_code: 'delivery_slot_path', value: path })
  }

  const response = await fetch(`${restBase}/v1/orders`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      entity: {
        entity_id: String(entityId),
        custom_attributes: customAttributes
      }
    })
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.message || `Commerce REST POST orders HTTP ${response.status}`)
    error.statusCode = response.status
    throw error
  }
  return payload
}

module.exports = {
  loadOrderDeliverySlotByIncrementId,
  updateOrderDeliveryCustomAttributes
}
