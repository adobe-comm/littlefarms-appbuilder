const { Core } = require('@adobe/aio-sdk')
const { errorResponse } = require('../../../utils')
const { createAttributeCatalog } = require('../../../block/lib/attribute-catalog')
const { withBlogEnvironmentParams } = require('../../lib/blog-scope')

async function main (params) {
  const logger = Core.Logger('blog-customer-groups', { level: params.LOG_LEVEL || 'info' })

  try {
    params = await withBlogEnvironmentParams(params)
    if (!params.COMMERCE_CORE_GRAPHQL_URL) {
      return {
        statusCode: 200,
        body: {
          items: [
            { id: 'all', label: 'All Groups' },
            { id: '0', label: 'NOT LOGGED IN' }
          ],
          configured: false
        }
      }
    }
    const catalog = createAttributeCatalog(params)
    const items = await catalog.listCustomerGroups()
    logger.info(`Listed ${items.length} customer groups for blog post form.`)
    return { statusCode: 200, body: { items, configured: true } }
  } catch (error) {
    logger.error(error.message || 'Customer group list failed.')
    return errorResponse(error.statusCode || 503, error.message || 'Server error.', logger)
  }
}

exports.main = main
