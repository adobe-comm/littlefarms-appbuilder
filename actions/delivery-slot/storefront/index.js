const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../utils')
const { withCommerceCoreGraphqlUrl } = require('../../block/lib/enrich-commerce-params')
const { createRegularStore } = require('../lib/regular-store')
const { createSpecialStore } = require('../lib/special-store')
const { loadCartProducts } = require('../lib/catalog-cart')
const {
  buildRegularDaySlots,
  buildSpecialDaySlots,
  detectMixedCartBlock,
  timezoneOf,
  zonedParts
} = require('../lib/slot-builder')
const { createStorefrontSwrCache, stableHash } = require('../../lib/storefront-swr-cache')
const { saveOrderDeliverySlot } = require('./save-order-slot')

function skusFromParams (params) {
  if (Array.isArray(params.skus)) {
    return params.skus.map(s => String(s || '').trim()).filter(Boolean)
  }
  if (typeof params.skus === 'string' && params.skus.trim()) {
    return params.skus.split(',').map(s => s.trim()).filter(Boolean)
  }
  return []
}

function categoryIdsFromParams (params) {
  if (Array.isArray(params.categoryIds)) {
    return params.categoryIds.map(id => String(id).trim()).filter(Boolean)
  }
  return []
}

function cartSpecialMode (params) {
  const mode = String(params.specialCartMode || '').trim().toLowerCase()
  if (mode === 'special' || mode === 'regular' || mode === 'mixed') return mode
  return 'regular'
}

async function slotsForCart (params, logger) {
  params = await withCommerceCoreGraphqlUrl(params)
  const storeViewCode = String(params.storeViewCode || 'default').trim() || 'default'
  const skus = skusFromParams(params)
  if (!skus.length) {
    return errorResponse(400, 'skus array is required for slots-for-cart.', logger)
  }

  const regularStore = createRegularStore(params)
  const specialStore = createSpecialStore(params)
  const [regularConfig, specialConfig, cartCatalog] = await Promise.all([
    regularStore.get(storeViewCode),
    specialStore.get(storeViewCode),
    loadCartProducts(params, skus)
  ])

  const categoryIds = categoryIdsFromParams(params)
  const tz = timezoneOf(params)
  const now = new Date()
  const savedDeliveryDateTime = String(params.deliveryDateTime || '').trim()
  const savedDeliveryDateTimeSlot = String(params.deliveryDateTimeSlot || '').trim()

  const currentYmd = zonedParts(now, tz).ymd
  const specialActive = specialStore.isOrderWindowActive(specialConfig, currentYmd)
  const mixed = detectMixedCartBlock(specialActive, cartSpecialMode(params))

  if (mixed.mixedCartBlocked) {
    return {
      statusCode: 200,
      body: {
        path: 'blocked',
        mixedCartBlocked: true,
        message: mixed.message,
        selectedTimeValid: 0,
        daySlot: []
      }
    }
  }

  const useSpecial = specialActive && cartSpecialMode(params) === 'special'
  let payload
  if (useSpecial) {
    payload = buildSpecialDaySlots({
      specialConfig,
      availableDayIndexes: cartCatalog.availableDayIndexes,
      categoryIds,
      offsetDeliveryFlag: cartCatalog.offsetDeliveryFlag,
      savedDeliveryDateTime,
      savedDeliveryDateTimeSlot,
      now,
      timeZone: tz,
      isOrderWindowActive: specialStore.isOrderWindowActive.bind(specialStore),
      maxDeliveryOffsetForCart: specialStore.maxDeliveryOffsetForCart.bind(specialStore)
    })
    if (payload.empty) {
      payload = buildRegularDaySlots({
        regularConfig,
        availableDayIndexes: cartCatalog.availableDayIndexes,
        savedDeliveryDateTime,
        savedDeliveryDateTimeSlot,
        now,
        timeZone: tz
      })
    }
  } else {
    payload = buildRegularDaySlots({
      regularConfig,
      availableDayIndexes: cartCatalog.availableDayIndexes,
      savedDeliveryDateTime,
      savedDeliveryDateTimeSlot,
      now,
      timeZone: tz
    })
  }

  return {
    statusCode: 200,
    body: {
      ...payload,
      mixedCartBlocked: false,
      offsetDeliveryFlag: cartCatalog.offsetDeliveryFlag
    }
  }
}

async function validateSaved (params, logger) {
  const storeViewCode = String(params.storeViewCode || 'default').trim() || 'default'
  const skus = skusFromParams(params)
  if (!skus.length) {
    return errorResponse(400, 'skus array is required for validate-saved-slot.', logger)
  }
  const result = await slotsForCart(params, logger)
  if (result.statusCode !== 200) return result
  const body = result.body || {}
  return {
    statusCode: 200,
    body: {
      selectedTimeValid: body.selectedTimeValid,
      selectedDay: body.selectedDay,
      selectedTime: body.selectedTime,
      path: body.path,
      storeViewCode
    }
  }
}

async function slotsForOrder (params, logger) {
  const storeViewCode = String(params.storeViewCode || 'default').trim() || 'default'
  const skus = skusFromParams(params)
  if (!skus.length) {
    return errorResponse(400, 'skus array is required for slots-for-order.', logger)
  }
  params.specialCartMode = params.specialCartMode || 'regular'
  const result = await slotsForCart(params, logger)
  if (result.statusCode !== 200) return result
  return {
    statusCode: 200,
    body: {
      ...result.body,
      orderId: String(params.orderId || '').trim(),
      storeViewCode
    }
  }
}

async function main (params) {
  const logger = Core.Logger('delivery-slot-storefront', { level: params.LOG_LEVEL || 'info' })

  try {
    const operation = String(params.operation || '').trim().toLowerCase()
    const storeViewCode = String(params.storeViewCode || 'default').trim() || 'default'
    const swr = await createStorefrontSwrCache(params)
    const cacheKey = `delivery-slot.v2.${operation}.${stableHash({
      storeViewCode,
      skus: skusFromParams(params),
      deliveryDateTime: params.deliveryDateTime,
      deliveryDateTimeSlot: params.deliveryDateTimeSlot,
      specialCartMode: params.specialCartMode,
      categoryIds: categoryIdsFromParams(params)
    })}`

    if (operation === 'slots-for-cart') {
      const result = await swr.getOrLoad(
        cacheKey,
        async () => {
          const loaded = await slotsForCart(params, logger)
          if (loaded.statusCode !== 200) {
            const err = new Error(
              typeof loaded.body === 'object' && loaded.body?.error
                ? loaded.body.error
                : 'slots-for-cart failed'
            )
            err.statusCode = loaded.statusCode || 500
            throw err
          }
          return loaded.body
        },
        { logger }
      )
      logger.info(`slots-for-cart (cache ${result.cacheStatus})`)
      return { statusCode: 200, body: result.body }
    }
    if (operation === 'validate-saved-slot') {
      const result = await validateSaved(params, logger)
      return result
    }
    if (operation === 'slots-for-order') {
      return slotsForOrder(params, logger)
    }
    if (operation === 'save-order-delivery-slot') {
      return saveOrderDeliverySlot(params, logger)
    }

    return errorResponse(
      400,
      'operation must be one of: slots-for-cart, validate-saved-slot, slots-for-order, save-order-delivery-slot.',
      logger
    )
  } catch (error) {
    logger.error(error.message || 'delivery-slot-storefront failed')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
