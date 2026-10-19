const { createOperationRouter } = require('../../lib/operation-router')

exports.main = createOperationRouter({
  logName: 'blog-admin',
  handlers: {
    'post-list': require('./post-list'),
    'post-write': require('./post-write'),
    'post-mass': require('./post-mass'),
    'post-asset': require('./post-asset'),
    'customer-groups': require('./customer-groups'),
    'category-list': require('./category-list'),
    'category-write': require('./category-write'),
    'category-mass': require('./category-mass'),
    'category-asset': require('./category-asset'),
    'tag-list': require('./tag-list'),
    'tag-write': require('./tag-write'),
    'tag-mass': require('./tag-mass')
  }
})
