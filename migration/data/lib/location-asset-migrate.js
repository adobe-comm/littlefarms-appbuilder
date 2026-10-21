const fetch = require('node-fetch')
const filesLib = require('@adobe/aio-lib-files')

const { legacyLocationMediaUrl, legacyTeamProfileMediaUrl } = require('./legacy-media-urls')
const { resolveRuntimeCredentials } = require('./aio-runtime-config')
const { invokeLocationAssetUpload } = require('./aio-runtime-invoke')

const MAX_BYTES = 1000000
const CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp'
}

const LOCATION_ASSET_JOBS = [
  { csvKey: 'logo', field: 'logo', kind: 'logo' },
  { csvKey: 'image', field: 'locationImage', kind: 'locationImage' },
  { csvKey: 'custom_marker', field: 'mapMarker', kind: 'mapMarker' },
  { csvKey: 'banner', field: 'storeBanner', kind: 'storeBanner' }
]

function trimmed (value) {
  return String(value ?? '').trim()
}

function extensionFromFilename (filename) {
  const match = String(filename || '').trim().match(/\.([a-z0-9]+)$/i)
  return match ? match[1].toLowerCase() : ''
}

function extensionFromContentType (contentType) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (type === 'image/jpeg') return 'jpg'
  if (type === 'image/png') return 'png'
  if (type === 'image/gif') return 'gif'
  if (type === 'image/webp') return 'webp'
  return ''
}

function safeSegment (value) {
  return encodeURIComponent(String(value || '').trim())
}

async function initFilesClient () {
  const { namespace, auth, source } = resolveRuntimeCredentials()
  const files = await filesLib.init({ ow: { namespace, auth } })
  return { files, runtimeSource: source }
}

async function initLocationAssetUploader () {
  if (String(process.env.LOCATION_MIGRATE_ASSETS_LOCAL || '').trim() === '1') {
    const opened = await initFilesClient()
    return {
      mode: 'local-files',
      runtimeSource: opened.runtimeSource,
      async upload ({ locationKey, kind, buffer, extension, contentId }) {
        const path = contentId
          ? `public/locations/content/${kind}/${safeSegment(contentId)}/migrate-${Date.now()}.${extension}`
          : `public/locations/${safeSegment(locationKey)}/${kind}-migrate-${Date.now()}.${extension}`
        await opened.files.write(path, buffer)
        const properties = await opened.files.getProperties(path)
        return { url: properties.url, path }
      }
    }
  }
  return {
    mode: 'runtime-invoke',
    runtimeSource: 'runtime-invoke (location-asset)',
    async upload ({ locationKey, kind, buffer, extension, contentId }) {
      const contentType = CONTENT_TYPES[extension]
      if (!contentType) throw new Error(`Unsupported image extension .${extension}`)
      return invokeLocationAssetUpload({
        locationKey,
        kind,
        contentType,
        buffer,
        contentId
      })
    }
  }
}

async function downloadBinary (sourceUrl) {
  const response = await fetch(sourceUrl, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${sourceUrl}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length || buffer.length > MAX_BYTES) {
    throw new Error(`Image size ${buffer.length} bytes (max ${MAX_BYTES}) for ${sourceUrl}`)
  }
  const headerType = response.headers.get('content-type') || ''
  return { buffer, contentType: headerType }
}

async function migrateLocationAsset ({
  locationKey,
  relativePath,
  field,
  kind,
  mediaBase,
  assetUploader,
  cache,
  contentId,
  profileSubfolder = false
}) {
  const sourceUrl = profileSubfolder
    ? legacyTeamProfileMediaUrl(relativePath, mediaBase)
    : legacyLocationMediaUrl(relativePath, mediaBase)
  if (!sourceUrl) return { field, sourceUrl: '', skipped: true }

  const cacheKey = `${kind}:${sourceUrl}`
  if (cache.has(cacheKey)) {
    return { field, sourceUrl, ...cache.get(cacheKey), cached: true }
  }

  try {
    const { buffer, contentType } = await downloadBinary(sourceUrl)
    let extension = extensionFromFilename(relativePath) || extensionFromContentType(contentType)
    if (!extension || !CONTENT_TYPES[extension]) {
      throw new Error(`Unsupported image type for ${relativePath} (${contentType || 'unknown'})`)
    }
    if (!assetUploader?.upload) {
      throw new Error('Asset uploader not initialized (run with --apply --migrate-assets)')
    }
    const uploaded = await assetUploader.upload({
      locationKey,
      kind,
      buffer,
      extension,
      contentId
    })
    const result = { url: uploaded.url, path: uploaded.path }
    cache.set(cacheKey, result)
    return { field, sourceUrl, ...result }
  } catch (error) {
    const message = error.message || String(error)
    const useLegacyUrl = /ERROR_BAD_CREDENTIALS|unauthorized access to the storage/i.test(message)
    if (useLegacyUrl) {
      return {
        field,
        sourceUrl,
        url: sourceUrl,
        path: '',
        legacyUrlFallback: true,
        error: message
      }
    }
    return { field, sourceUrl, error: message }
  }
}

async function applyLocationAssetFieldsFromCsv ({
  row,
  locationKey,
  mediaBase,
  dryRun,
  assetUploader,
  cache
}) {
  const assets = []
  const fieldUpdates = {}

  for (const job of LOCATION_ASSET_JOBS) {
    const relativePath = trimmed(row[job.csvKey])
    if (!relativePath) continue
    const sourceUrl = legacyLocationMediaUrl(relativePath, mediaBase)
    if (dryRun) {
      assets.push({ ...job, relativePath, sourceUrl, dryRun: true })
      continue
    }
    const result = await migrateLocationAsset({
      locationKey,
      relativePath,
      field: job.field,
      kind: job.kind,
      mediaBase,
      assetUploader,
      cache
    })
    assets.push({ ...job, relativePath, ...result })
    if (result.url) fieldUpdates[job.field] = result.url
  }

  return { assets, fieldUpdates }
}

async function migrateTeamImageFromCsv ({
  row,
  profileId,
  mediaBase,
  dryRun,
  assetUploader,
  cache
}) {
  const relativePath = trimmed(row.image)
  if (!relativePath) return { assets: [], fieldUpdates: {} }

  const sourceUrl = legacyTeamProfileMediaUrl(relativePath, mediaBase)
  if (dryRun) {
    return {
      assets: [{ field: 'image', relativePath, sourceUrl, dryRun: true }],
      fieldUpdates: {}
    }
  }

  const result = await migrateLocationAsset({
    locationKey: '',
    relativePath,
    field: 'image',
    kind: 'teamImage',
    mediaBase,
    assetUploader,
    cache,
    contentId: profileId,
    profileSubfolder: true
  })
  const fieldUpdates = result.url ? { image: result.url } : {}
  return {
    assets: [{ field: 'image', relativePath, ...result }],
    fieldUpdates
  }
}

async function migrateGalleryImageFromCsv ({
  row,
  galleryId,
  mediaBase,
  dryRun,
  assetUploader,
  cache
}) {
  const relativePath = trimmed(row.gallery)
  if (!relativePath) return { assets: [], fieldUpdates: {} }

  const sourceUrl = legacyLocationMediaUrl(relativePath, mediaBase)
  if (dryRun) {
    return {
      assets: [{ field: 'image', relativePath, sourceUrl, dryRun: true }],
      fieldUpdates: {}
    }
  }

  const result = await migrateLocationAsset({
    locationKey: '',
    relativePath,
    field: 'image',
    kind: 'galleryImage',
    mediaBase,
    assetUploader,
    cache,
    contentId: galleryId
  })
  const fieldUpdates = result.url ? { image: result.url } : {}
  return {
    assets: [{ field: 'image', relativePath, ...result }],
    fieldUpdates
  }
}

async function migrateServiceIconFromCsv ({
  row,
  serviceId,
  mediaBase,
  dryRun,
  assetUploader,
  cache
}) {
  const relativePath = trimmed(row.icon)
  if (!relativePath) return { assets: [], fieldUpdates: {} }

  const sourceUrl = legacyLocationMediaUrl(relativePath, mediaBase)
  if (dryRun) {
    return {
      assets: [{ field: 'icon', relativePath, sourceUrl, dryRun: true }],
      fieldUpdates: {}
    }
  }

  const result = await migrateLocationAsset({
    locationKey: '',
    relativePath,
    field: 'icon',
    kind: 'serviceIcon',
    mediaBase,
    assetUploader,
    cache,
    contentId: serviceId
  })
  const fieldUpdates = result.url ? { icon: result.url } : {}
  return {
    assets: [{ field: 'icon', relativePath, ...result }],
    fieldUpdates
  }
}

module.exports = {
  initLocationAssetUploader,
  applyLocationAssetFieldsFromCsv,
  migrateGalleryImageFromCsv,
  migrateServiceIconFromCsv,
  migrateTeamImageFromCsv,
  LOCATION_ASSET_JOBS
}
