const stateLib = require('@adobe/aio-lib-state')

const ATTRIBUTE_STATE_KEY = 'catalog.product-attributes'
const ATTRIBUTE_STATE_TTL = stateLib.MAX_TTL
const MONTH_MS = 30 * 24 * 60 * 60 * 1000
const MAX_VALUE_BYTES = 900000

function parseValue (result) {
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

function needsAttributeSync (record, expiration, now = Date.now()) {
  if (!record || !Array.isArray(record.attributes)) return true
  const lastSync = Number(record.lastSync)
  if (!Number.isFinite(lastSync) || lastSync <= 0) return true
  if (now - lastSync >= MONTH_MS) return true
  const expiresAt = Date.parse(expiration || '')
  if (Number.isFinite(expiresAt) && expiresAt - now <= MONTH_MS) return true
  return false
}

function eventType (params) {
  const headers = params?.__ow_headers || {}
  const values = [
    headers['ce-type'],
    headers['x-adobe-event-code'],
    params?.type,
    params?.eventType,
    params?.event_code,
    params?.event?.type,
    params?.event?.event_code,
    params?.event?.event?.type,
    params?.data?.type
  ]
  for (const value of values) {
    const text = String(value || '').trim().toLowerCase()
    if (text) return text
  }
  return ''
}

function isAttributeChangeEvent (params) {
  const type = eventType(params)
  if (!type || type.includes('catalog_product')) return false
  return /entity_attribute_|attribute_option|attribute_save|attribute_delete/.test(type)
}

function chunkText (text, maxBytes) {
  const chunks = []
  let current = ''
  let bytes = 0
  for (const char of text) {
    const size = Buffer.byteLength(char)
    if (current && bytes + size > maxBytes) {
      chunks.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  if (current) chunks.push(current)
  return chunks
}

function chunkKey (index) {
  return `${ATTRIBUTE_STATE_KEY}.${index}`
}

async function refreshBrandChoice (params) {
  try {
    const { createBrandStore } = require('../../brand/lib/brand-store')
    await createBrandStore(params).refreshChoice()
  } catch {
    // The attribute catalog is still stored when the brand database is unavailable.
  }
}

async function createAttributeState (params, stateFactory = stateLib.init) {
  const state = await stateFactory({ region: params.STATE_REGION || 'amer' })

  async function read () {
    const stored = await state.get(ATTRIBUTE_STATE_KEY)
    const record = parseValue(stored)
    const expiration = stored?.expiration || ''
    if (!record) return { record: null, expiration }
    if (Array.isArray(record.attributes)) return { record, expiration }
    const count = Number(record.chunks)
    if (!Number.isFinite(count) || count < 1) return { record: null, expiration }
    const parts = []
    for (let index = 0; index < count; index += 1) {
      const part = parseValue(await state.get(chunkKey(index)))
      if (typeof part !== 'string') return { record: null, expiration }
      parts.push(part)
    }
    try {
      const assembled = JSON.parse(parts.join(''))
      if (!assembled || !Array.isArray(assembled.attributes)) return { record: null, expiration }
      return { record: assembled, expiration }
    } catch {
      return { record: null, expiration }
    }
  }

  async function write (attributes) {
    const body = { lastSync: Date.now(), attributes }
    const text = JSON.stringify(body)
    const chunks = Buffer.byteLength(text) <= MAX_VALUE_BYTES ? [text] : chunkText(text, MAX_VALUE_BYTES)
    if (chunks.length === 1) {
      await state.put(ATTRIBUTE_STATE_KEY, text, { ttl: ATTRIBUTE_STATE_TTL })
      await refreshBrandChoice(params)
      return body
    }
    for (let index = 0; index < chunks.length; index += 1) {
      await state.put(chunkKey(index), JSON.stringify(chunks[index]), { ttl: ATTRIBUTE_STATE_TTL })
    }
    await state.put(
      ATTRIBUTE_STATE_KEY,
      JSON.stringify({ lastSync: body.lastSync, chunks: chunks.length }),
      { ttl: ATTRIBUTE_STATE_TTL }
    )
    await refreshBrandChoice(params)
    return body
  }

  return {
    read,
    async load (fetchAttributes) {
      const { record, expiration } = await read()
      if (!needsAttributeSync(record, expiration)) return record.attributes
      const attributes = await fetchAttributes()
      const saved = await write(attributes)
      return saved.attributes
    },
    async sync (fetchAttributes) {
      const attributes = await fetchAttributes()
      const saved = await write(attributes)
      return { lastSync: saved.lastSync, count: saved.attributes.length }
    }
  }
}

module.exports = {
  ATTRIBUTE_STATE_KEY,
  ATTRIBUTE_STATE_TTL,
  MONTH_MS,
  needsAttributeSync,
  isAttributeChangeEvent,
  createAttributeState
}
