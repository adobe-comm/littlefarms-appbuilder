const { createOperationRouter } = require('../../lib/operation-router')

exports.main = createOperationRouter({
  logName: 'location-admin',
  handlers: {
    list: require('./list'),
    mass: require('./mass'),
    write: require('./write'),
    asset: require('./asset'),
    geocode: require('./geocode'),
    'content-list': require('./content-list'),
    'content-write': require('./content-write'),
    'content-mass': require('./content-mass')
  }
})
