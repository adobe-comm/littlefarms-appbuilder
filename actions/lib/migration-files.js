const filesLib = require('@adobe/aio-lib-files')
const { randomUUID } = require('crypto')

/** Max assembled CSV size in App Builder Files. */
const MAX_CSV_BYTES = 32 * 1024 * 1024
/** Raw bytes per chunk (base64 + JSON stays under typical ~1 MB web-action limit). */
const UPLOAD_CHUNK_BYTES = 512 * 1024
/** Files at or below this size use a single migration-upload request. */
const SINGLE_UPLOAD_MAX_BYTES = 700 * 1024

function safeFilename (name) {
  const base = String(name || 'upload.csv').trim().replace(/[^\w.-]+/g, '_')
  return base.slice(0, 120) || 'upload.csv'
}

function migrationPath (draftId, fileKind, filename) {
  const id = String(draftId || '').trim() || randomUUID()
  return `private/migration/${id}/${fileKind}/${safeFilename(filename)}`
}

function chunkPartPath (draftId, uploadId, chunkIndex) {
  return `private/migration/${draftId}/uploads/${uploadId}/part-${String(chunkIndex).padStart(5, '0')}`
}

async function openFiles () {
  return filesLib.init()
}

function assertCsvSize (buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw Object.assign(new Error('CSV file is empty.'), { statusCode: 400 })
  }
  if (buffer.length > MAX_CSV_BYTES) {
    throw Object.assign(
      new Error(`CSV must be at most ${Math.round(MAX_CSV_BYTES / (1024 * 1024))} MB.`),
      { statusCode: 400 }
    )
  }
}

async function writeMigrationCsv ({ draftId, fileKind, filename, buffer }) {
  assertCsvSize(buffer)
  const path = migrationPath(draftId, fileKind, filename)
  const files = await openFiles()
  await files.write(path, buffer)
  const properties = await files.getProperties(path)
  return {
    path,
    url: properties.url || '',
    size: buffer.length,
    filename: safeFilename(filename)
  }
}

async function writeMigrationChunk ({ draftId, uploadId, chunkIndex, buffer }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw Object.assign(new Error('Upload chunk is empty.'), { statusCode: 400 })
  }
  if (buffer.length > UPLOAD_CHUNK_BYTES) {
    throw Object.assign(new Error('Upload chunk exceeds allowed size.'), { statusCode: 400 })
  }
  const path = chunkPartPath(draftId, uploadId, chunkIndex)
  const files = await openFiles()
  await files.write(path, buffer)
  return { path, size: buffer.length }
}

async function assembleMigrationUpload ({
  draftId,
  uploadId,
  fileKind,
  filename,
  totalChunks,
  expectedSize
}) {
  const total = Number(totalChunks)
  if (!Number.isInteger(total) || total < 1) {
    throw Object.assign(new Error('totalChunks is not valid.'), { statusCode: 400 })
  }
  const files = await openFiles()
  const parts = []
  for (let index = 0; index < total; index += 1) {
    const path = chunkPartPath(draftId, uploadId, index)
    const part = await files.read(path)
    const buffer = Buffer.isBuffer(part) ? part : Buffer.from(String(part || ''), 'utf8')
    if (!buffer.length) {
      throw Object.assign(new Error(`Missing upload chunk ${index + 1} of ${total}.`), { statusCode: 400 })
    }
    parts.push(buffer)
  }
  const assembled = Buffer.concat(parts)
  const expected = Number(expectedSize)
  if (Number.isFinite(expected) && expected > 0 && assembled.length !== expected) {
    throw Object.assign(
      new Error(`Upload size mismatch (expected ${expected} bytes, got ${assembled.length}).`),
      { statusCode: 400 }
    )
  }
  assertCsvSize(assembled)
  const stored = await writeMigrationCsv({
    draftId,
    fileKind,
    filename,
    buffer: assembled
  })
  for (let index = 0; index < total; index += 1) {
    try {
      await files.delete(chunkPartPath(draftId, uploadId, index))
    } catch {
      // best-effort cleanup
    }
  }
  return stored
}

async function readMigrationCsv (path) {
  const files = await openFiles()
  const buffer = await files.read(String(path || '').trim())
  return Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '')
}

module.exports = {
  MAX_CSV_BYTES,
  UPLOAD_CHUNK_BYTES,
  SINGLE_UPLOAD_MAX_BYTES,
  writeMigrationCsv,
  writeMigrationChunk,
  assembleMigrationUpload,
  readMigrationCsv,
  migrationPath
}
