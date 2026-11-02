const { CACHE_PREFIX } = require('./constants')
const { invalidateStorefrontSwrCache } = require('../../lib/storefront-swr-cache')

function slotsCacheKey (storeViewCode, hash) {
  return `${CACHE_PREFIX}.${storeViewCode}.${hash}`
}

async function invalidateDeliverySlotCache (params) {
  await invalidateStorefrontSwrCache(params, 'delivery-slot')
}

module.exports = {
  slotsCacheKey,
  invalidateDeliverySlotCache
}
