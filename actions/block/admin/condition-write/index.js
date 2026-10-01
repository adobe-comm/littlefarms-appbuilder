const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { validate } = require('./validator')
const { transform } = require('./transformer')
const { preProcess } = require('./pre')
const { send } = require('./sender')
const { postProcess } = require('./post')
const { withCommerceCoreGraphqlUrl } = require('../../lib/enrich-commerce-params')

async function main (params) {
  const logger = Core.Logger('block-condition-write', { level: params.LOG_LEVEL || 'info' })
  try {
    params = await withCommerceCoreGraphqlUrl(params)
    const validation = validate(params)
    if (!validation.valid) {
      const response = errorResponse(validation.statusCode, validation.error, logger)
      response.error.body.errors = validation.errors
      return response
    }
    const transformed = transform(params, validation)
    const prepared = await preProcess(transformed, params)
    const result = await send(prepared, params)
    return { statusCode: 200, body: await postProcess(result, prepared, params) }
  } catch (error) {
    logger.error(error)
    const response = errorResponse(error.statusCode || 503, error.message || 'Server error.', logger)
    if (error.errors) response.error.body.errors = error.errors
    return response
  }
}

exports.main = main
