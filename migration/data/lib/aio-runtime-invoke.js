const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '../../..')

function resolveBrandAssetActionFqn () {
  const pkg = String(process.env.AIO_RUNTIME_PACKAGE || 'littlefarms-appbuilder').trim()
  const action = String(process.env.BRAND_ASSET_ACTION || '__secured_brand-asset').trim()
  return `${pkg}/${action}`
}

function resolveLocationAssetActionFqn () {
  const pkg = String(process.env.AIO_RUNTIME_PACKAGE || 'littlefarms-appbuilder').trim()
  const action = String(process.env.LOCATION_ASSET_ACTION || '__secured_location-asset').trim()
  return `${pkg}/${action}`
}

/**
 * Invoke a deployed Runtime action via `aio runtime action invoke` (uses workspace runtime auth).
 * Returns parsed activation result (statusCode + body).
 */
function invokeRuntimeAction (actionFqn, params) {
  const tmp = path.join(
    os.tmpdir(),
    `aio-invoke-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`
  )
  fs.writeFileSync(tmp, JSON.stringify(params))
  try {
    const result = spawnSync(
      'aio',
      ['runtime', 'action', 'invoke', actionFqn, '--param-file', tmp, '-r'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 12 * 1024 * 1024
      }
    )
    const combined = `${result.stdout || ''}${result.stderr || ''}`.trim()
    if (result.status !== 0) {
      throw new Error(combined || `aio invoke failed for ${actionFqn}`)
    }
    const parsed = JSON.parse(result.stdout)
    if (parsed.error) {
      throw new Error(typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error))
    }
    return parsed
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {
      // ignore
    }
  }
}

function invokeBrandAssetUpload ({
  attributeCode,
  optionValue,
  kind,
  contentType,
  buffer
}) {
  const activation = invokeRuntimeAction(resolveBrandAssetActionFqn(), {
    attributeCode,
    optionValue,
    kind,
    contentType,
    content: buffer.toString('base64')
  })
  const statusCode = activation.statusCode ?? activation.response?.statusCode
  const body = activation.body ?? activation.response?.result?.body ?? activation.response?.result
  if (statusCode !== 200) {
    const message = typeof body === 'string' ? body : body?.error || JSON.stringify(body)
    throw new Error(message || `brand-asset invoke HTTP ${statusCode}`)
  }
  if (!body?.url) {
    throw new Error('brand-asset invoke returned no url')
  }
  return { url: body.url, path: body.path || '' }
}

function invokeLocationAssetUpload ({
  locationKey,
  kind,
  contentType,
  buffer,
  contentId
}) {
  const params = {
    locationKey,
    kind,
    contentType,
    content: buffer.toString('base64')
  }
  if (contentId) params.contentId = String(contentId)
  const activation = invokeRuntimeAction(resolveLocationAssetActionFqn(), params)
  const statusCode = activation.statusCode ?? activation.response?.statusCode
  const body = activation.body ?? activation.response?.result?.body ?? activation.response?.result
  if (statusCode !== 200) {
    const message = typeof body === 'string' ? body : body?.error || JSON.stringify(body)
    throw new Error(message || `location-asset invoke HTTP ${statusCode}`)
  }
  if (!body?.url) {
    throw new Error('location-asset invoke returned no url')
  }
  return { url: body.url, path: body.path || '' }
}

module.exports = {
  resolveBrandAssetActionFqn,
  resolveLocationAssetActionFqn,
  invokeRuntimeAction,
  invokeBrandAssetUpload,
  invokeLocationAssetUpload
}
