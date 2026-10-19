const fetch = require('node-fetch')
const filesLib = require('@adobe/aio-lib-files')

const { legacyBrandMediaUrl } = require('./legacy-media-urls')
const { resolveRuntimeCredentials } = require('./aio-runtime-config')
const { invokeBrandAssetUpload, resolveBrandAssetActionFqn } = require('./aio-runtime-invoke')

const MAX_BYTES = 1000000
const CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp'
}

function safeSegment (value) {
  return encodeURIComponent(String(value || '').trim())
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

async function initFilesClient () {
  const { namespace, auth, source } = resolveRuntimeCredentials()
  const files = await filesLib.init({ ow: { namespace, auth } })
  return { files, runtimeSource: source }
}

/**
 * Upload path for local CLI: invoke deployed brand-asset on Runtime (Files only works in-process there).
 * Set BRAND_MIGRATE_ASSETS_LOCAL=1 to attempt direct aio-lib-files from the host (usually fails).
 */
async function initAssetUploader () {
  if (String(process.env.BRAND_MIGRATE_ASSETS_LOCAL || '').trim() === '1') {
    const opened = await initFilesClient()
    return {
      mode: 'local-files',
      runtimeSource: opened.runtimeSource,
      async upload ({ attributeCode, optionValue, kind, buffer, extension }) {
        return uploadBrandAsset({
          filesClient: opened.files,
          attributeCode,
          optionValue,
          kind,
          buffer,
          extension
        })
      }
    }
  }
  const actionFqn = resolveBrandAssetActionFqn()
  return {
    mode: 'runtime-invoke',
    runtimeSource: `runtime-invoke (${actionFqn})`,
    async upload ({ attributeCode, optionValue, kind, buffer, extension }) {
      const contentType = CONTENT_TYPES[extension]
      if (!contentType) {
        throw new Error(`Unsupported image extension .${extension}`)
      }
      return invokeBrandAssetUpload({
        attributeCode,
        optionValue,
        kind: kind === 'small' ? 'small' : 'image',
        contentType,
        buffer
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

async function uploadBrandAsset ({ filesClient, attributeCode, optionValue, kind, buffer, extension }) {
  const files = filesClient
  const path = `public/brands/${safeSegment(attributeCode)}/${safeSegment(optionValue)}/${kind}-migrate-${Date.now()}.${extension}`
  await files.write(path, buffer)
  const properties = await files.getProperties(path)
  return { url: properties.url, path }
}

/**
 * Download a legacy Commerce media file and store it in App Builder Files (public/brands/...).
 * Returns { field, sourceUrl, url, path } or { field, sourceUrl, error }.
 */
async function migrateBrandAsset ({
  attributeCode,
  optionValue,
  filename,
  kind,
  mediaBase,
  assetUploader,
  cache
}) {
  const field = kind === 'small' ? 'small_image' : 'image'
  const sourceUrl = legacyBrandMediaUrl(filename, kind, mediaBase)
  if (!sourceUrl) return { field, sourceUrl: '', skipped: true }

  const cacheKey = `${kind}:${sourceUrl}`
  if (cache.has(cacheKey)) {
    return { field, sourceUrl, ...cache.get(cacheKey), cached: true }
  }

  try {
    const { buffer, contentType } = await downloadBinary(sourceUrl)
    let extension = extensionFromFilename(filename) || extensionFromContentType(contentType)
    if (!extension || !CONTENT_TYPES[extension]) {
      throw new Error(`Unsupported image type for ${filename} (${contentType || 'unknown'})`)
    }

    if (!assetUploader?.upload) {
      throw new Error('Asset uploader not initialized (run with --apply --migrate-assets)')
    }
    const uploaded = await assetUploader.upload({
      attributeCode,
      optionValue,
      kind: kind === 'small' ? 'small' : 'image',
      buffer,
      extension
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

async function applyAssetFieldsFromCsv ({
  row,
  attributeCode,
  optionValue,
  mediaBase,
  dryRun,
  assetUploader,
  cache
}) {
  const assets = []
  const fieldUpdates = {}

  const jobs = [
    { csvKey: 'image', kind: 'image' },
    { csvKey: 'slider_image', kind: 'small' }
  ]

  for (const job of jobs) {
    const filename = String(row[job.csvKey] || '').trim()
    if (!filename) continue

    const sourceUrl = legacyBrandMediaUrl(filename, job.kind, mediaBase)
    if (dryRun) {
      assets.push({ ...job, filename, sourceUrl, dryRun: true })
      continue
    }

    const result = await migrateBrandAsset({
      attributeCode,
      optionValue,
      filename,
      kind: job.kind,
      mediaBase,
      assetUploader,
      cache
    })
    assets.push({ ...job, filename, ...result })
    if (result.url) fieldUpdates[result.field] = result.url
  }

  return { assets, fieldUpdates }
}

module.exports = {
  initFilesClient,
  initAssetUploader,
  migrateBrandAsset,
  applyAssetFieldsFromCsv,
  legacyBrandMediaUrl
}
