const { createOperationRouter } = require('../../lib/operation-router')
const { withCommerceCoreGraphqlUrl } = require('../../block/lib/enrich-commerce-params')

const dispatch = createOperationRouter({
  logName: 'delivery-slot-admin',
  handlers: {
    'regular-get': require('./regular-get'),
    'regular-write': require('./regular-write'),
    'special-get': require('./special-get'),
    'special-write': require('./special-write')
  }
})

exports.main = async function main (params) {
  params = await withCommerceCoreGraphqlUrl(params)
  return dispatch(params)
}
