const { randomUUID } = require('crypto')
const { createMigrationState } = require('../lib/migration-state')
const {
  writeMigrationCsv,
  writeMigrationChunk,
  assembleMigrationUpload,
  MAX_CSV_BYTES,
  UPLOAD_CHUNK_BYTES,
  SINGLE_UPLOAD_MAX_BYTES
} = require('../lib/migration-files')
const {
  listServices,
  getService,
  normalizeDatasets,
  serviceAllowsWrite
} = require('../lib/migration-catalog')
const { invokeProcessDataNonBlocking } = require('../lib/invoke-process-data')

function parseBase64Csv (content) {
  const raw = String(content || '').replace(/\s/g, '')
  if (!raw || !/^[A-Za-z0-9+/]+=*$/.test(raw)) {
    throw Object.assign(new Error('CSV content is not valid base64.'), { statusCode: 400 })
  }
  return Buffer.from(raw, 'base64')
}

async function migrationCatalog () {
  return {
    services: listServices(),
    maxCsvBytes: MAX_CSV_BYTES,
    uploadChunkBytes: UPLOAD_CHUNK_BYTES,
    singleUploadMaxBytes: SINGLE_UPLOAD_MAX_BYTES
  }
}

function resolveDataset (serviceId, fileKind) {
  const service = getService(serviceId)
  if (!service) {
    throw Object.assign(new Error('Migration service is not valid.'), { statusCode: 400 })
  }
  const dataset = Object.values(service.datasets).find(entry => entry.fileKind === fileKind)
  if (!dataset) {
    throw Object.assign(new Error('File kind is not valid for this service.'), { statusCode: 400 })
  }
  return { service, dataset }
}

async function readOrCreateDraft (migrationState, serviceId) {
  const draft = (await migrationState.readDraft()) || {
    draftId: randomUUID(),
    service: serviceId,
    files: {}
  }
  if (draft.service !== serviceId) {
    draft.service = serviceId
    draft.files = {}
  }
  return draft
}

async function migrationStatus (params) {
  const migrationState = await createMigrationState(params)
  const [current, draft] = await Promise.all([
    migrationState.readCurrent(),
    migrationState.readDraft()
  ])
  let job = null
  if (current?.jobId) {
    job = await migrationState.readJob(current.jobId)
  }
  return { current, job, draft }
}

async function migrationUpload (params) {
  const serviceId = String(params.service || 'location').trim()
  const fileKind = String(params.fileKind || '').trim()
  const filename = String(params.filename || 'upload.csv').trim()
  const { dataset } = resolveDataset(serviceId, fileKind)

  const buffer = parseBase64Csv(params.content)
  if (buffer.length > SINGLE_UPLOAD_MAX_BYTES) {
    throw Object.assign(
      new Error(
        `File is too large for a single upload (${buffer.length} bytes). Use chunked upload.`
      ),
      { statusCode: 400 }
    )
  }

  const migrationState = await createMigrationState(params)
  const draft = await readOrCreateDraft(migrationState, serviceId)
  const stored = await writeMigrationCsv({
    draftId: draft.draftId,
    fileKind,
    filename,
    buffer
  })
  draft.files[dataset.id] = {
    path: stored.path,
    filename: stored.filename,
    size: stored.size,
    uploadedAt: Date.now()
  }
  draft.updatedAt = Date.now()
  await migrationState.writeDraft(draft)
  return { draft }
}

async function migrationUploadChunk (params) {
  const serviceId = String(params.service || 'location').trim()
  const fileKind = String(params.fileKind || '').trim()
  const uploadId = String(params.uploadId || '').trim()
  const chunkIndex = Number(params.chunkIndex)
  const totalChunks = Number(params.totalChunks)
  resolveDataset(serviceId, fileKind)
  if (!uploadId) {
    throw Object.assign(new Error('uploadId is required.'), { statusCode: 400 })
  }
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    throw Object.assign(new Error('chunkIndex is not valid.'), { statusCode: 400 })
  }
  if (!Number.isInteger(totalChunks) || totalChunks < 1 || chunkIndex >= totalChunks) {
    throw Object.assign(new Error('totalChunks is not valid.'), { statusCode: 400 })
  }

  const buffer = parseBase64Csv(params.content)
  const migrationState = await createMigrationState(params)
  const draft = await readOrCreateDraft(migrationState, serviceId)
  await writeMigrationChunk({
    draftId: draft.draftId,
    uploadId,
    chunkIndex,
    buffer
  })
  draft.updatedAt = Date.now()
  await migrationState.writeDraft(draft)
  return {
    uploadId,
    chunkIndex,
    totalChunks,
    receivedBytes: buffer.length
  }
}

async function migrationUploadComplete (params) {
  const serviceId = String(params.service || 'location').trim()
  const fileKind = String(params.fileKind || '').trim()
  const filename = String(params.filename || 'upload.csv').trim()
  const uploadId = String(params.uploadId || '').trim()
  const totalChunks = Number(params.totalChunks)
  const totalSize = Number(params.totalSize)
  const { dataset } = resolveDataset(serviceId, fileKind)
  if (!uploadId) {
    throw Object.assign(new Error('uploadId is required.'), { statusCode: 400 })
  }
  if (!Number.isInteger(totalChunks) || totalChunks < 1) {
    throw Object.assign(new Error('totalChunks is not valid.'), { statusCode: 400 })
  }

  const migrationState = await createMigrationState(params)
  const draft = await readOrCreateDraft(migrationState, serviceId)
  const stored = await assembleMigrationUpload({
    draftId: draft.draftId,
    uploadId,
    fileKind,
    filename,
    totalChunks,
    expectedSize: totalSize
  })
  draft.files[dataset.id] = {
    path: stored.path,
    filename: stored.filename,
    size: stored.size,
    uploadedAt: Date.now()
  }
  draft.updatedAt = Date.now()
  await migrationState.writeDraft(draft)
  return { draft }
}

async function migrationStart (params, logger) {
  const serviceId = String(params.service || 'location').trim()
  const mode = String(params.mode || 'update').trim().toLowerCase()
  if (!['update', 'write'].includes(mode)) {
    throw Object.assign(new Error('mode must be update or write.'), { statusCode: 400 })
  }
  const service = getService(serviceId)
  if (!service) {
    throw Object.assign(new Error('Migration service is not valid.'), { statusCode: 400 })
  }
  if (mode === 'write' && !serviceAllowsWrite(serviceId)) {
    throw Object.assign(
      new Error(`${service.label} migration only supports update mode.`),
      { statusCode: 400 }
    )
  }

  const migrationState = await createMigrationState(params)
  const current = await migrationState.readCurrent()
  if (current?.status === 'running') {
    throw Object.assign(new Error('A migration is already running.'), { statusCode: 409 })
  }

  const draft = (await migrationState.readDraft()) || {}
  const datasets = normalizeDatasets(serviceId, params.datasets || draft.datasets)
  if (!datasets) {
    throw Object.assign(new Error('datasets could not be parsed.'), { statusCode: 400 })
  }
  const enabled = Object.entries(datasets).filter(([, on]) => on)
  if (!enabled.length) {
    throw Object.assign(new Error('Select at least one dataset to migrate.'), { statusCode: 400 })
  }
  for (const [datasetId] of enabled) {
    if (!draft.files?.[datasetId]?.path) {
      throw Object.assign(
        new Error(`Upload a CSV for ${datasetId} before starting.`),
        { statusCode: 400 }
      )
    }
  }
  if (serviceId === 'brand' && !datasets.options) {
    throw Object.assign(new Error('Brand migration requires the brand options CSV.'), { statusCode: 400 })
  }
  if (serviceId === 'location' && !datasets.locations) {
    throw Object.assign(new Error('Location migration requires the locations CSV.'), { statusCode: 400 })
  }
  if (serviceId === 'blog') {
    if (!datasets.categories && !datasets.posts) {
      throw Object.assign(new Error('Blog migration requires categories and/or posts.'), { statusCode: 400 })
    }
    if (datasets.posts && !datasets.categories && !draft.files?.categories?.path) {
      throw Object.assign(
        new Error('Upload categories CSV when importing posts so category names resolve.'),
        { statusCode: 400 }
      )
    }
  }

  const job = await migrationState.createJob({
    service: serviceId,
    mode,
    datasets,
    files: draft.files,
    draftId: draft.draftId,
    migrateAssets: String(params.migrateAssets || '').trim() === '1' ||
      params.migrateAssets === true
  })

  const invoke = await invokeProcessDataNonBlocking(params, job.jobId, logger)
  await migrationState.patchJob(job.jobId, {
    activationId: invoke.activationId || '',
    status: 'queued',
    phase: 'queued',
    progress: { done: 0, total: 0, label: 'Waiting for worker' }
  })
  logger.info(`Started migration job ${job.jobId}`)
  return { jobId: job.jobId, activationId: invoke.activationId || null }
}

module.exports = {
  migrationCatalog,
  migrationStatus,
  migrationUpload,
  migrationUploadChunk,
  migrationUploadComplete,
  migrationStart
}
