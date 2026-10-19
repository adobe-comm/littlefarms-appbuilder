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
const LOCATION_KINDS = ['logo', 'locationImage', 'mapMarker', 'storeBanner']
const CONTENT_ASSET_KINDS = ['serviceIcon', 'galleryImage', 'teamImage']

function safeSegment (value) {
  return encodeURIComponent(String(value || '').trim()).slice(0, 80)
}

async function main (params) {
  const logger = Core.Logger('location-asset', { level: params.LOG_LEVEL || 'info' })

  try {
    const locationKey = safeSegment(params.locationKey)
    const kind = String(params.kind || '').trim()
    const contentAsset = CONTENT_ASSET_KINDS.includes(kind)
    const locationAsset = LOCATION_KINDS.includes(kind)
    const contentType = String(params.contentType || '').trim().toLowerCase()
    const extension = CONTENT_TYPES[contentType]
    const content = String(params.content || '').replace(/\s/g, '')

    const contentId = safeSegment(params.contentId)
    if (contentAsset && !contentId) return errorResponse(400, 'contentId is required for content images.', logger)
    if (locationAsset && !locationKey) return errorResponse(400, 'locationKey is required.', logger)
    if (!contentAsset && !locationAsset) return errorResponse(400, 'Image kind is not valid.', logger)
    if (!extension) return errorResponse(400, 'Image must be a jpeg, png, gif, or webp file.', logger)
    if (!content || !/^[A-Za-z0-9+/]+=*$/.test(content)) {
      return errorResponse(400, 'Image content is not valid.', logger)
    }

    const bytes = Buffer.from(content, 'base64')
    if (!bytes.length || bytes.length > MAX_BYTES) {
      return errorResponse(400, 'Image must be between 1 byte and 1 MB.', logger)
    }

    const path = contentAsset
      ? `public/locations/content/${kind}/${contentId}/${Date.now()}.${extension}`
      : `public/locations/${locationKey}/${kind}-${Date.now()}.${extension}`
    const files = await filesLib.init()
    await files.write(path, bytes)
    const properties = await files.getProperties(path)
    logger.info(`Stored location ${kind}`)
    return { statusCode: 200, body: { url: properties.url, path, kind } }
  } catch (error) {
    logger.error(error.message || 'Location image upload failed.')
    return errorResponse(error.statusCode || 500, error.message || 'Server error.', logger)
  }
}

exports.main = main
