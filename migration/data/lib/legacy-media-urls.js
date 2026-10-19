const DEFAULT_MEDIA_BASE = 'https://mcstaging.littlefarms.com/media/amasty/shopby/option_images'
const DEFAULT_LOCATION_MEDIA_BASE = 'https://mcstaging.littlefarms.com/media/aheadworks/store_locator'

function trimmed (value) {
  return String(value ?? '').trim()
}

function isAbsoluteUrl (value) {
  return /^https?:\/\//i.test(trimmed(value))
}

/**
 * Legacy Amasty Shopby option image paths on Commerce media.
 * - Page image: .../option_images/image/{filename}
 * - Slider (small): .../option_images/slider/slider_image/{filename}
 */
function legacyBrandMediaUrl (filename, kind, mediaBase = DEFAULT_MEDIA_BASE) {
  const name = trimmed(filename)
  if (!name) return ''
  if (isAbsoluteUrl(name)) return name

  const base = trimmed(mediaBase).replace(/\/+$/, '')
  const segment = name.split('/').map(part => encodeURIComponent(part)).join('/')
  if (kind === 'small') {
    return `${base}/slider/slider_image/${segment}`
  }
  return `${base}/image/${segment}`
}

/**
 * Aheadworks Store Locator media on Commerce (paths like location/v/p/foo.jpg).
 */
function legacyLocationMediaUrl (relativePath, mediaBase = DEFAULT_LOCATION_MEDIA_BASE) {
  const name = trimmed(relativePath)
  if (!name) return ''
  if (isAbsoluteUrl(name)) return name
  const base = trimmed(mediaBase).replace(/\/+$/, '')
  const segment = name.split('/').map(part => encodeURIComponent(part)).join('/')
  return `${base}/${segment}`
}

/** Team profile headshots live under .../store_locator/profile/{filename}. */
function legacyTeamProfileMediaUrl (filename, mediaBase = DEFAULT_LOCATION_MEDIA_BASE) {
  const name = trimmed(filename)
  if (!name) return ''
  if (isAbsoluteUrl(name)) return name.replace(/\/\/media\//, '/media/')
  const base = trimmed(mediaBase).replace(/\/+$/, '')
  const segment = name.split('/').map(part => encodeURIComponent(part)).join('/')
  return `${base}/profile/${segment}`
}

module.exports = {
  DEFAULT_MEDIA_BASE,
  DEFAULT_LOCATION_MEDIA_BASE,
  legacyBrandMediaUrl,
  legacyLocationMediaUrl,
  legacyTeamProfileMediaUrl,
  isAbsoluteUrl
}
