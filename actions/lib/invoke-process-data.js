const openwhisk = require('openwhisk')

const DEFAULT_PACKAGE = 'littlefarms-appbuilder'
const PROCESS_DATA_ACTION = 'process-data'

/**
 * OpenWhisk client for the current activation (uses __OW_API_HOST, __OW_API_KEY, __OW_NAMESPACE).
 * @see https://developer.adobe.com/app-builder/docs/guides/runtime_guides/asynchronous-calls/
 */
function createOpenWhiskClient (runtimeParams) {
  const apihost = String(
    runtimeParams.__OW_API_HOST ||
    process.env.__OW_API_HOST ||
    ''
  ).trim()
  const apiKey = String(
    runtimeParams.__OW_API_KEY ||
    process.env.__OW_API_KEY ||
    ''
  ).trim()
  const namespace = String(
    runtimeParams.__OW_NAMESPACE ||
    runtimeParams.AIO_RUNTIME_NAMESPACE ||
    process.env.__OW_NAMESPACE ||
    ''
  ).trim()

  if (!apiKey) {
    throw Object.assign(
      new Error('Runtime API key is not available on this activation (cannot invoke process-data).'),
      { statusCode: 500 }
    )
  }

  const options = { api_key: apiKey }
  if (apihost) options.apihost = apihost
  if (namespace) options.namespace = namespace
  return openwhisk(options)
}

function resolveProcessDataActionName () {
  const pkg = String(process.env.AIO_RUNTIME_PACKAGE || DEFAULT_PACKAGE).trim()
  return `${pkg}/${PROCESS_DATA_ACTION}`
}

/**
 * Fire-and-forget invoke of process-data. Only job routing is passed; env/IMS stay on the worker action.
 */
async function invokeProcessDataNonBlocking (runtimeParams, jobId, logger) {
  const ow = createOpenWhiskClient(runtimeParams)
  const actionName = resolveProcessDataActionName()
  const invokeParams = {
    operation: 'migration',
    jobId
  }

  if (logger?.info) {
    logger.info(`Invoking ${actionName} (blocking=false) params=${JSON.stringify(invokeParams)}`)
  }

  try {
    const result = await ow.actions.invoke({
      actionName,
      blocking: false,
      result: false,
      params: invokeParams
    })
    const activationId = String(
      result?.activationId ||
      result?.activation ||
      result?.body?.activationId ||
      ''
    ).trim()
    return { activationId, action: actionName }
  } catch (error) {
    const message = error?.error?.error ||
      error?.error?.message ||
      error?.message ||
      'process-data invoke failed.'
    throw Object.assign(new Error(message), { statusCode: error.statusCode || 502 })
  }
}

module.exports = {
  invokeProcessDataNonBlocking,
  createOpenWhiskClient,
  resolveProcessDataActionName
}
