const stateLib = require('@adobe/aio-lib-state')

const DIRECTORY_TTL = stateLib.MAX_TTL

function encodePart (value) {
  return Buffer.from(String(value)).toString('base64url')
}

function directoryKey (environmentId) {
  return `location.${encodePart(environmentId)}.directory.general`
}

function parseCached (result) {
  const raw = result?.value
  if (raw == null || raw === '') return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return raw
}

async function createLocationCache (params, stateFactory = stateLib.init) {
  const state = await stateFactory({ region: params.STATE_REGION || 'amer' })
  const { resolveEnvironmentId } = require('../../block/lib/app-scope')
  const environmentId = resolveEnvironmentId(params)
  const key = directoryKey(environmentId)

  return {
    environmentId,
    async getDirectory () {
      return parseCached(await state.get(key))
    },
    putDirectory (body) {
      return state.put(key, JSON.stringify(body), { ttl: DIRECTORY_TTL })
    },
    invalidateDirectory () {
      return state.delete(key)
    },
    invalidateAll () {
      return state.deleteAll({ match: 'location.*' })
    }
  }
}

module.exports = {
  directoryKey,
  DIRECTORY_TTL,
  createLocationCache
}
