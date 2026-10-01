const { validateRule } = require('../../lib/validate-rule')

function validate (params) {
  if (!params.__ow_headers?.authorization) {
    return { valid: false, statusCode: 401, error: 'Adobe IMS authorization is required.' }
  }

  const result = validateRule(params.rule || params)
  if (!result.valid) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Rule validation failed.',
      errors: result.errors
    }
  }
  return { valid: true, value: result.value }
}

module.exports = { validate }
