function validate (params) {
  if (!params.__ow_headers?.authorization) {
    return { valid: false, statusCode: 401, error: 'Adobe IMS authorization is required.' }
  }
  const id = String(params.id || params.presetId || '').trim()
  if (!id) {
    return { valid: false, statusCode: 400, error: 'Block id is required.' }
  }
  return { valid: true, value: { id } }
}

module.exports = { validate }
