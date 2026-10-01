const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { validate } = require('./validator')
const { transform } = require('./transformer')
const { preProcess } = require('./pre')
const { send } = require('./sender')
const { postProcess } = require('./post')

async function main (params) {
  const logger = Core.Logger('block-evaluate', { level: params.LOG_LEVEL || 'info' })

  try {
    const validation = validate(params)
    if (!validation.valid) {
      return errorResponse(validation.statusCode, validation.error, logger)
    }

    const transformed = transform(params)
    const prepared = await preProcess(transformed, params)
    const result = await send(prepared, params, logger)
    const body = await postProcess(result, prepared)
    logger.info(`Evaluated SKU ${transformed.sku}; ${body.blocks.length} block(s) matched`)
    return { statusCode: 200, body }
  } catch (error) {
    logger.error(error)
    return { statusCode: 200, body: { blocks: [] } }
  }
}

exports.main = main
