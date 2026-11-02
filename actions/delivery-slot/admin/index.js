const { createOperationRouter } = require('../../lib/operation-router')

exports.main = createOperationRouter({
  logName: 'delivery-slot-admin',
  handlers: {
    'regular-get': require('./regular-get'),
    'regular-write': require('./regular-write'),
    'special-get': require('./special-get'),
    'special-write': require('./special-write')
  }
})
