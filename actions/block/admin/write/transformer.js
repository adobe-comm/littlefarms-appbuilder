const { randomUUID } = require('crypto')

function transform (params, validation) {
  return {
    ...validation.value,
    id: validation.value.id || randomUUID(),
    updatedAt: new Date().toISOString()
  }
}

module.exports = { transform }
