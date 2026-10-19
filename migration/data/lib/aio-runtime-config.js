const { spawnSync } = require('child_process')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '../../..')

function readAioConfig () {
  const result = spawnSync('aio', ['config', 'ls', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(detail || 'Could not read aio config. Run aio login and aio app use.')
  }
  return JSON.parse(result.stdout)
}

function runtimeCredentialsFromEnv () {
  const namespace = process.env.AIO_RUNTIME_NAMESPACE || process.env.__OW_NAMESPACE
  const auth = process.env.AIO_RUNTIME_AUTH || process.env.__OW_API_KEY
  if (namespace && auth) {
    return { namespace, auth, source: 'env' }
  }
  return null
}

function runtimeCredentialsFromAioCli () {
  const config = readAioConfig()
  const namespace = String(config?.runtime?.namespace || '').trim()
  const auth = String(config?.runtime?.auth || '').trim()
  if (!namespace || !auth) {
    throw new Error('runtime.namespace or runtime.auth missing in aio config.')
  }
  return { namespace, auth, source: 'aio-cli' }
}

function resolveRuntimeCredentials () {
  return runtimeCredentialsFromEnv() || runtimeCredentialsFromAioCli()
}

function parseClientSecret (raw) {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed) && parsed.length) return String(parsed[0]).trim()
    } catch {
      return value
    }
  }
  return value
}

function normalizeScopes (raw) {
  if (Array.isArray(raw)) return raw.map(scope => String(scope).trim()).filter(Boolean)
  const text = String(raw ?? '').trim()
  if (!text) return []
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed.map(scope => String(scope).trim()).filter(Boolean)
    } catch {
      // fall through
    }
  }
  return text.split(/[\s,]+/).map(scope => scope.trim()).filter(Boolean)
}

function imsCredentialsFromEnv () {
  const clientId = String(
    process.env.IMS_CLIENT_ID ||
    process.env.AIO_COMMERCE_AUTH_IMS_CLIENT_ID ||
    ''
  ).trim()
  const clientSecret = parseClientSecret(
    process.env.IMS_CLIENT_SECRETS || process.env.AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS
  )
  const orgId = String(
    process.env.IMS_ORG_ID ||
    process.env.AIO_COMMERCE_AUTH_IMS_ORG_ID ||
    ''
  ).trim()
  const scopes = normalizeScopes(process.env.IMS_SCOPES || process.env.AIO_COMMERCE_AUTH_IMS_SCOPES)
  if (!clientId || !clientSecret || !orgId) return null
  return { clientId, clientSecret, orgId, scopes, source: 'env' }
}

function imsCredentialsFromAioCli () {
  const config = readAioConfig()
  const credentials = config?.project?.workspace?.details?.credentials || []
  const oauth = credentials.find(entry => entry.integration_type === 'oauth_server_to_server')
  const contextKey = String(oauth?.name || '').trim().toLowerCase()
  if (!contextKey) {
    throw new Error('No oauth_server_to_server credential in aio workspace config.')
  }
  const ims = config?.ims?.contexts?.[contextKey]
  if (!ims) {
    throw new Error(`IMS context "${contextKey}" missing in aio config.`)
  }
  const clientId = String(ims.client_id || '').trim()
  const clientSecret = parseClientSecret(ims.client_secrets)
  const orgId = String(ims.ims_org_id || '').trim()
  const scopes = normalizeScopes(ims.scopes)
  if (!clientId || !clientSecret || !orgId) {
    throw new Error('Incomplete IMS credentials in aio config (client_id, client_secrets, ims_org_id).')
  }
  return { clientId, clientSecret, orgId, scopes, source: 'aio-cli' }
}

function resolveImsCredentials () {
  return imsCredentialsFromEnv() || imsCredentialsFromAioCli()
}

/** Params for Core.AuthClient.generateAccessToken and aio-lib-db (clientId/orgId, not IMS_* alone). */
function applyImsToParams (params, ims) {
  if (!ims) return params
  return {
    ...params,
    clientId: ims.clientId,
    clientSecret: ims.clientSecret,
    orgId: ims.orgId,
    scopes: ims.scopes,
    IMS_ORG_ID: ims.orgId,
    IMS_CLIENT_ID: ims.clientId,
    IMS_CLIENT_SECRETS: ims.clientSecret,
    IMS_SCOPES: ims.scopes.join(','),
    imsCredentialSource: ims.source
  }
}

module.exports = {
  resolveRuntimeCredentials,
  resolveImsCredentials,
  applyImsToParams,
  readAioConfig
}
