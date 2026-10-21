const stateLib = require('@adobe/aio-lib-state')
const { randomUUID } = require('crypto')

const CURRENT_KEY = 'migration.current'
const DRAFT_KEY = 'migration.draft'
const JOB_PREFIX = 'migration.job.'
const STATE_TTL = stateLib.MAX_TTL

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

function jobKey (jobId) {
  return `${JOB_PREFIX}${String(jobId || '').trim()}`
}

async function createMigrationState (params, stateFactory = stateLib.init) {
  const state = await stateFactory({ region: params.STATE_REGION || 'amer' })

  async function readKey (key) {
    return parseValue(await state.get(key))
  }

  async function writeKey (key, body) {
    await state.put(key, JSON.stringify(body), { ttl: STATE_TTL })
    return body
  }

  return {
    async readDraft () {
      return readKey(DRAFT_KEY)
    },

    async writeDraft (body) {
      return writeKey(DRAFT_KEY, body)
    },

    async readCurrent () {
      return readKey(CURRENT_KEY)
    },

    async readJob (jobId) {
      if (!jobId) return null
      return readKey(jobKey(jobId))
    },

    async createJob (partial) {
      const jobId = partial?.jobId || randomUUID()
      const now = Date.now()
      const job = {
        jobId,
        status: 'pending',
        phase: '',
        progress: { done: 0, total: 0, label: '' },
        startedAt: null,
        finishedAt: null,
        error: null,
        summary: null,
        ...partial,
        createdAt: partial?.createdAt || now,
        updatedAt: now
      }
      await writeKey(jobKey(jobId), job)
      await writeKey(CURRENT_KEY, {
        jobId,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        service: job.service,
        mode: job.mode,
        updatedAt: job.updatedAt
      })
      return job
    },

    async patchJob (jobId, patch) {
      const existing = await readKey(jobKey(jobId))
      if (!existing) return null
      const job = {
        ...existing,
        ...patch,
        jobId: existing.jobId,
        updatedAt: Date.now()
      }
      await writeKey(jobKey(jobId), job)
      await writeKey(CURRENT_KEY, {
        jobId: job.jobId,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        service: job.service,
        mode: job.mode,
        error: job.error || null,
        summary: job.summary || null,
        updatedAt: job.updatedAt
      })
      return job
    }
  }
}

module.exports = {
  CURRENT_KEY,
  DRAFT_KEY,
  createMigrationState
}
