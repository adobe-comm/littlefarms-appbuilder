const { validatePreset } = require('../../lib/validate-preset')

function validate (params) {
  if (!params.__ow_headers?.authorization) {
    return { valid: false, statusCode: 401, error: 'Adobe IMS authorization is required.' }
  }

  const result = validatePreset(params.preset || params)
  if (!result.valid) {
    return {
      valid: false,
      statusCode: 400,
      error: result.errors[0].message,
      errors: result.errors
    }
  }
  return { valid: true, value: result.value }
}

module.exports = { validate }
