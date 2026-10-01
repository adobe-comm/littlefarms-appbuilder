const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { validate } = require('./validator')
const { transform } = require('./transformer')
const { preProcess } = require('./pre')
const { send } = require('./sender')
const { postProcess } = require('./post')

async function main (params) {
  const logger = Core.Logger('block-condition-list', { level: params.LOG_LEVEL || 'info' })
  try {
    const validation = validate(params)
    if (!validation.valid) {
      return errorResponse(validation.statusCode, validation.error, logger)
    }
    const transformed = transform(params)
    const prepared = await preProcess(transformed, params)
    const result = await send(prepared, params)
    return { statusCode: 200, body: await postProcess(result, prepared) }
  } catch (error) {
    logger.error(error)
    return errorResponse(error.statusCode || 503, error.message || 'Server error.', logger)
  }
}

exports.main = main
