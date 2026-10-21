const { spawnSync } = require('child_process')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '../../..')
const BRANDS_COLLECTION = 'littlefarms_brands'

function runAio (args, { allowFailure = false } = {}) {
  const result = spawnSync('aio', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  if (result.error) throw result.error
  if (result.status !== 0 && !allowFailure) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(detail || `aio ${args.join(' ')} failed with code ${result.status}`)
  }
  return result.stdout
}

function aioFindDocuments (collection, filter, { limit = 100, skip = 0, projection } = {}) {
  const args = [
    'app', 'db', 'document', 'find',
    collection,
    JSON.stringify(filter),
    '--limit', String(Math.min(100, limit)),
    '--skip', String(skip),
    '--json'
  ]
  if (projection) args.push('--projection', JSON.stringify(projection))
  const stdout = runAio(args)
  const payload = JSON.parse(stdout)
  return payload.results || []
}

function stripInternalFields (document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) return document
  const copy = { ...document }
  delete copy._id
  return copy
}

function aioUpdateDocument (collection, filter, setFields, { upsert = false } = {}) {
  const args = [
    'app', 'db', 'document', 'update',
    collection,
    JSON.stringify(filter),
    JSON.stringify({ $set: setFields })
  ]
  if (upsert) args.push('-u')
  runAio(args)
}

function aioInsertDocuments (collection, documents) {
  const payload = Array.isArray(documents)
    ? documents.map(stripInternalFields)
    : stripInternalFields(documents)
  runAio([
    'app', 'db', 'document', 'insert',
    collection,
    JSON.stringify(payload)
  ])
}

function aioReplaceDocument (collection, filter, document, { upsert = false } = {}) {
  const args = [
    'app', 'db', 'document', 'replace',
    collection,
    JSON.stringify(filter),
    JSON.stringify(stripInternalFields(document))
  ]
  if (upsert) args.push('-u')
  runAio(args)
}

async function loadBaseBrandsViaCli (attributeCode) {
  const filter = {
    attributeCode,
    storeViewCode: 'all',
    hidden: false,
    optionRemoved: false
  }

  const docs = []
  let skip = 0
  for (;;) {
    const batch = aioFindDocuments(BRANDS_COLLECTION, filter, { limit: 100, skip })
    docs.push(...batch)
    if (batch.length < 100) break
    skip += batch.length
  }

  return docs
}

const LOCATIONS_COLLECTION = 'littlefarms_locations'
const LOCATION_CONTENT_COLLECTION = 'littlefarms_location_content'
const BLOG_POSTS_COLLECTION = 'littlefarms_blog_posts'
const BLOG_CATEGORIES_COLLECTION = 'littlefarms_blog_categories'
const BLOG_TAGS_COLLECTION = 'littlefarms_blog_tags'

function loadDocumentsViaCli (collection, filter) {
  const docs = []
  let skip = 0
  for (;;) {
    const batch = aioFindDocuments(collection, filter, { limit: 100, skip })
    docs.push(...batch)
    if (batch.length < 100) break
    skip += batch.length
  }
  return docs
}

module.exports = {
  loadBaseBrandsViaCli,
  loadDocumentsViaCli,
  aioUpdateDocument,
  aioInsertDocuments,
  aioReplaceDocument,
  stripInternalFields,
  BRANDS_COLLECTION,
  LOCATIONS_COLLECTION,
  LOCATION_CONTENT_COLLECTION,
  BLOG_POSTS_COLLECTION,
  BLOG_CATEGORIES_COLLECTION,
  BLOG_TAGS_COLLECTION
}
