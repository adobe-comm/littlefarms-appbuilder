const { createOperationRouter } = require('../../lib/operation-router')

exports.main = createOperationRouter({
  logName: 'brand-admin',
  handlers: {
    settings: require('./settings'),
    list: require('./list'),
    write: require('./write'),
    asset: require('./asset')
  }
})
