const { Core } = require('@adobe/aio-sdk')
const filesLib = require('@adobe/aio-lib-files')
const { errorResponse } = require('../../../utils')

const MAX_BYTES = 1000000
const CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

function safeSegment (value) {
  return encodeURIComponent(String(value || '').trim())
}

async function main (params) {
  const logger = Core.Logger('brand-asset', { level: params.LOG_LEVEL || 'info' })

  try {
    const attributeCode = String(params.attributeCode || '').trim()
    const optionValue = String(params.optionValue || '').trim()
    const kind = params.kind === 'small' ? 'small' : params.kind === 'image' ? 'image' : ''
    const contentType = String(params.contentType || '').trim().toLowerCase()
    const extension = CONTENT_TYPES[contentType]
    const content = String(params.content || '').replace(/\s/g, '')

    if (!attributeCode || !optionValue) {
      return errorResponse(400, 'attributeCode and optionValue are required.', logger)
    }
    if (!kind) return errorResponse(400, 'kind must be image or small.', logger)
    if (!extension) return errorResponse(400, 'contentType must be a jpeg, png, gif, or webp image.', logger)
    if (!content || !/^[A-Za-z0-9+/]+=*$/.test(content)) {
      return errorResponse(400, 'content must be base64 image data.', logger)
    }

    const bytes = Buffer.from(content, 'base64')
    if (!bytes.length || bytes.length > MAX_BYTES) {
      return errorResponse(400, 'Image must be between 1 byte and 1 MB.', logger)
    }

    const path = `public/brands/${safeSegment(attributeCode)}/${safeSegment(optionValue)}/${kind}-${Date.now()}.${extension}`
    const files = await filesLib.init()
    await files.write(path, bytes)
    const properties = await files.getProperties(path)
    logger.info(`Stored brand ${kind} for ${attributeCode}:${optionValue}`)
    return {
      statusCode: 200,
      body: {
        url: properties.url,
        path,
        kind
      }
    }
  } catch (error) {
    logger.error(error.message || 'Brand asset upload failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
