const { createMigrationState } = require('../lib/migration-state')
const { readMigrationCsv } = require('../lib/migration-files')
const { getService } = require('../lib/migration-catalog')
const { clearLocationMigrationData } = require('../../migration/data/lib/clear-location-migration')
const { clearBlogMigrationData } = require('../../migration/data/lib/clear-blog-migration')
const { runLocationImport } = require('../../migration/data/import-locations')
const { runBrandImport } = require('../../migration/data/import-brand-options')
const { runBlogImport } = require('../../migration/data/import-blog')
const { createLocationCache } = require('../location/lib/location-cache')
const { createBrandCache } = require('../brand/lib/brand-cache')

async function loadCsvTexts (files, datasets) {
  const texts = {}
  for (const [datasetId, enabled] of Object.entries(datasets || {})) {
    if (!enabled) continue
    const entry = files?.[datasetId]
    if (!entry?.path) {
      throw new Error(`Missing uploaded CSV for ${datasetId}.`)
    }
    texts[datasetId] = await readMigrationCsv(entry.path)
  }
  return texts
}

function buildLocationImportOptions (job, csvTexts) {
  const datasets = job.datasets || {}
  const modeWrite = job.mode === 'write'
  return {
    apply: true,
    preferSdk: true,
    skipCacheFlush: true,
    skipReportFile: true,
    createMissing: true,
    updateAll: modeWrite,
    migrateAssets: Boolean(job.migrateAssets),
    importServices: Boolean(datasets.services),
    importTeam: Boolean(datasets.team),
    importGallery: Boolean(datasets.gallery),
    locationCsvText: csvTexts.locations,
    serviceCsvText: csvTexts.services,
    teamCsvText: csvTexts.team,
    galleryCsvText: csvTexts.gallery
  }
}

function buildBrandImportOptions (job, csvTexts) {
  return {
    apply: true,
    preferSdk: true,
    skipCacheFlush: true,
    skipReportFile: true,
    updateAll: false,
    migrateAssets: Boolean(job.migrateAssets),
    csvText: csvTexts.options
  }
}

function buildBlogImportOptions (job, csvTexts) {
  const datasets = job.datasets || {}
  const modeWrite = job.mode === 'write'
  return {
    apply: true,
    preferSdk: true,
    skipReportFile: true,
    updateAll: modeWrite,
    importCategories: Boolean(datasets.categories),
    importPosts: Boolean(datasets.posts),
    categoryCsvText: csvTexts.categories,
    postCsvText: csvTexts.posts
  }
}

async function runServiceImport (params, job, jobId, migrationState, logger) {
  const csvTexts = await loadCsvTexts(job.files, job.datasets)
  const hooks = {
    onPhase (phase, progress) {
      void migrationState.patchJob(jobId, { phase, progress })
    }
  }

  if (job.service === 'brand') {
    if (!csvTexts.options) {
      throw new Error('Brand migration requires a brand options CSV upload.')
    }
    const summary = await runBrandImport(params, buildBrandImportOptions(job, csvTexts), hooks)
    try {
      const cache = await createBrandCache(params)
      await cache.invalidateAll()
    } catch (error) {
      logger.warn(`Brand cache flush failed: ${error.message}`)
    }
    return summary
  }

  if (job.service === 'location') {
    if (!csvTexts.locations) {
      throw new Error('Location migration requires a locations CSV upload.')
    }
    if (job.mode === 'write') {
      await migrationState.patchJob(jobId, {
        phase: 'cleanup',
        progress: { done: 0, total: 1, label: 'Removing existing location data' }
      })
      const cleanup = await clearLocationMigrationData(params)
      await migrationState.patchJob(jobId, {
        progress: { done: 1, total: 1, label: 'Cleanup complete' },
        summary: { cleanup }
      })
    }
    const summary = await runLocationImport(params, buildLocationImportOptions(job, csvTexts), hooks)
    try {
      const cache = await createLocationCache(params)
      await cache.invalidateDirectory()
    } catch (error) {
      logger.warn(`Location cache flush failed: ${error.message}`)
    }
    return summary
  }

  if (job.service === 'blog') {
    if (!csvTexts.categories && !csvTexts.posts) {
      throw new Error('Blog migration requires at least one uploaded CSV.')
    }
    if (job.mode === 'write') {
      await migrationState.patchJob(jobId, {
        phase: 'cleanup',
        progress: { done: 0, total: 1, label: 'Removing existing blog data' }
      })
      const cleanup = await clearBlogMigrationData(params)
      await migrationState.patchJob(jobId, {
        progress: { done: 1, total: 1, label: 'Cleanup complete' },
        summary: { cleanup }
      })
    }
    return runBlogImport(params, buildBlogImportOptions(job, csvTexts), hooks)
  }

  throw new Error(`Migration service "${job.service}" is not implemented.`)
}

async function runMigrationJob (params, jobId, logger) {
  const migrationState = await createMigrationState(params)
  const job = await migrationState.readJob(jobId)
  if (!job) {
    throw new Error(`Migration job ${jobId} was not found.`)
  }
  const service = getService(job.service)
  if (!service) {
    await migrationState.patchJob(jobId, {
      status: 'failed',
      finishedAt: Date.now(),
      error: `Unknown migration service: ${job.service}`
    })
    return migrationState.readJob(jobId)
  }

  await migrationState.patchJob(jobId, {
    status: 'running',
    startedAt: Date.now(),
    phase: 'prepare',
    progress: { done: 0, total: 1, label: 'Loading CSV files' },
    error: null
  })

  try {
    const summary = await runServiceImport(params, job, jobId, migrationState, logger)
    await migrationState.patchJob(jobId, {
      status: 'completed',
      finishedAt: Date.now(),
      phase: 'done',
      progress: { done: 1, total: 1, label: 'Migration finished' },
      summary
    })
  } catch (error) {
    logger.error(error.message || error)
    await migrationState.patchJob(jobId, {
      status: 'failed',
      finishedAt: Date.now(),
      error: error.message || 'Migration failed.',
      phase: 'error'
    })
  }

  return migrationState.readJob(jobId)
}

module.exports = {
  runMigrationJob
}
