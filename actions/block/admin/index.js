const { createOperationRouter } = require('../../lib/operation-router')

exports.main = createOperationRouter({
  logName: 'block-admin',
  handlers: {
    list: require('./list'),
    metadata: require('./metadata'),
    'cache-flush': require('./cache-flush'),
    'condition-list': require('./condition-list'),
    'condition-write': require('./condition-write'),
    'condition-remove': require('./condition-remove'),
    write: require('./write'),
    remove: require('./remove')
  }
})
