/*
 * API Mesh additional resolvers — call LittleFarms App Builder storefront actions.
 * Set env vars when creating/updating the mesh (see sample.env).
 */

const SECRET_HEADER = 'x-conditional-block-secret'

async function postJson (url, secret, body) {
  if (!url) {
    throw new Error('Missing App Builder action URL in mesh environment.')
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [SECRET_HEADER]: secret || ''
    },
    body: JSON.stringify(body)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload.error || payload.message || `HTTP ${response.status}`
    throw new Error(message)
  }
  return payload
}

function mapConditionalBlock (entry) {
  if (!entry) return null
  return {
    id: entry.id,
    name: entry.name,
    priority: Number(entry.priority) || 0,
    title: entry.title || '',
    contentHtml: entry.contentHtml || '',
    targetSkus: Array.isArray(entry.targetSkus) ? entry.targetSkus : []
  }
}

module.exports = {
  resolvers: {
    Query: {
      littleFarmsBlock: {
        resolve: async (_root, args) => {
          const payload = await postJson(
            process.env.LITTLEFARMS_BLOCK_STOREFRONT_URL,
            process.env.EVALUATE_SHARED_SECRET,
            { operation: 'get', id: args.id }
          )
          return payload.block || null
        }
      },
      littleFarmsBlocks: {
        resolve: async (_root, args) => {
          const payload = await postJson(
            process.env.LITTLEFARMS_BLOCK_STOREFRONT_URL,
            process.env.EVALUATE_SHARED_SECRET,
            {
              operation: 'list',
              ...(args.blockType ? { blockType: args.blockType } : {})
            }
          )
          return payload.blocks || []
        }
      },
      littleFarmsConditionalBlocks: {
        resolve: async (_root, args) => {
          const payload = await postJson(
            process.env.LITTLEFARMS_BLOCK_EVALUATE_URL,
            process.env.EVALUATE_SHARED_SECRET,
            {
              sku: args.sku,
              storeViewCode: args.storeViewCode
            }
          )
          const blocks = payload.blocks || []
          return blocks.map(mapConditionalBlock).filter(Boolean)
        }
      }
    }
  }
}
