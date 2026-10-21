const { Core } = require('@adobe/aio-sdk')
const { runMigrationJob } = require('./run-migration-job')

async function processData (params, logger) {
  const operation = String(params.operation || '').trim().toLowerCase()
  if (operation === 'migration') {
    const jobId = String(params.jobId || '').trim()
    if (!jobId) {
      throw new Error('jobId is required for migration operation.')
    }
    await runMigrationJob(params, jobId, logger)
    return
  }
  logger.info('processData invoked with no matching operation (no-op).')
}

async function main (params) {
  const logger = Core.Logger('process-data', { level: params.LOG_LEVEL || 'info' })
  try {
    await processData(params, logger)
    return {
      statusCode: 202,
      body: { ok: true }
    }
  } catch (error) {
    logger.error(error.message || 'process-data failed.')
    return {
      statusCode: error.statusCode || 500,
      body: { ok: false, error: error.message || 'Server error.' }
    }
  }
}

exports.main = main
exports.processData = processData
