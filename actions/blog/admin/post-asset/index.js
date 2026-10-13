const { Core } = require('@adobe/aio-sdk')
const filesLib = require('@adobe/aio-lib-files')
const { errorResponse } = require('../../../utils')
const { IMAGE_KINDS } = require('../../lib/constants')

const MAX_BYTES = 1000000
const CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

function safeSegment (value) {
  return encodeURIComponent(String(value || '').trim()).slice(0, 80)
}

async function main (params) {
  const logger = Core.Logger('blog-post-asset', { level: params.LOG_LEVEL || 'info' })

  try {
    const postKey = safeSegment(params.postKey)
    const kind = IMAGE_KINDS.includes(params.kind) ? params.kind : ''
    const contentType = String(params.contentType || '').trim().toLowerCase()
    const extension = CONTENT_TYPES[contentType]
    const content = String(params.content || '').replace(/\s/g, '')

    if (!postKey) return errorResponse(400, 'postKey is required.', logger)
    if (!kind) return errorResponse(400, 'Image kind is not valid.', logger)
    if (!extension) return errorResponse(400, 'Image must be a jpeg, png, gif, or webp file.', logger)
    if (!content || !/^[A-Za-z0-9+/]+=*$/.test(content)) {
      return errorResponse(400, 'Image content is not valid.', logger)
    }

    const bytes = Buffer.from(content, 'base64')
    if (!bytes.length || bytes.length > MAX_BYTES) {
      return errorResponse(400, 'Image must be between 1 byte and 1 MB.', logger)
    }

    const path = `public/blog/posts/${postKey}/${kind}-${Date.now()}.${extension}`
    const files = await filesLib.init()
    await files.write(path, bytes)
    const properties = await files.getProperties(path)
    logger.info(`Stored blog post ${kind}`)
    return { statusCode: 200, body: { url: properties.url, path, kind } }
  } catch (error) {
    logger.error(error.message || 'Blog post image upload failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
