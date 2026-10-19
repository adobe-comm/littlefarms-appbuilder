const blocks = require('./blocks/index.js')
const evaluate = require('./evaluate/index.js')

function isEvaluateRequest (params) {
  const path = String(params.__ow_path || '').toLowerCase()
  if (path.includes('block-evaluate')) return true
  const operation = String(params.operation || '').trim().toLowerCase()
  return operation === 'evaluate'
}

async function main (params) {
  if (isEvaluateRequest(params)) {
    return evaluate.main(params)
  }
  return blocks.main(params)
}

exports.main = main
