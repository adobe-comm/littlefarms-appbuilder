function transform (params, validation) {
  return {
    ...validation.value,
    updatedAt: new Date().toISOString()
  }
}

module.exports = { transform }
