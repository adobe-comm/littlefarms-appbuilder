/*
 * API Mesh programmatic resolvers (ES5-safe for mesh lint).
 * URLs and secret: context.secrets (see secrets.yaml + --secrets on deploy).
 */

var PLACEMENT_BLOCK_TYPE = 'littlefarms_placement'
var SECRET_HEADER = 'x-conditional-block-secret'

function postJson (url, secret, body, options) {
  if (!url) {
    return Promise.reject(new Error('Missing App Builder action URL in mesh secrets.'))
  }
  var opts = options || {}
  var headers = { 'Content-Type': 'application/json' }
  if (!opts.skipSecret && secret) {
    headers[SECRET_HEADER] = secret
  }
  return fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  }).then(function (response) {
    return response.json().catch(function () {
      return {}
    }).then(function (payload) {
      if (!response.ok) {
        var message = payload.error || payload.message || ('HTTP ' + response.status)
        return Promise.reject(new Error(message))
      }
      return payload
    })
  })
}

function mapPlacementToBlock (entry) {
  if (!entry) return null
  return {
    id: entry.id,
    name: entry.name,
    blockType: PLACEMENT_BLOCK_TYPE,
    enabled: true,
    brandsList: null,
    featuredRecommended: null,
    placement: {
      priority: Number(entry.priority) || 0,
      title: entry.title || '',
      contentHtml: entry.contentHtml || '',
      targetSkus: Array.isArray(entry.targetSkus) ? entry.targetSkus : []
    }
  }
}

function filterByBlockType (blocks, blockType) {
  if (!blockType) return blocks
  return blocks.filter(function (block) {
    return block.blockType === blockType
  })
}

function secretsFrom (context) {
  return (context && context.secrets) || {}
}

module.exports = {
  resolvers: {
    Query: {
      littleFarmsBlock: {
        resolve: function (_root, args, context) {
          var secrets = secretsFrom(context)
          return postJson(
            secrets.LITTLEFARMS_BLOCK_STOREFRONT_URL,
            secrets.EVALUATE_SHARED_SECRET,
            { operation: 'get', id: args.id, resolveConditions: true },
            { skipSecret: true }
          ).then(function (payload) {
            var block = payload.block || null
            if (block && block.placement === undefined) {
              block.placement = null
            }
            return block
          })
        }
      },
      littleFarmsBlocks: {
        resolve: function (_root, args, context) {
          var secrets = secretsFrom(context)
          var sku = String(args.sku || '').trim()
          var storeViewCode = String(args.storeViewCode || '').trim()
          var blockType = String(args.blockType || '').trim()

          if (sku || storeViewCode) {
            if (!sku || !storeViewCode) {
              return Promise.reject(new Error('sku and storeViewCode must both be provided for PDP placement blocks.'))
            }
            return postJson(
              secrets.LITTLEFARMS_BLOCK_EVALUATE_URL,
              secrets.EVALUATE_SHARED_SECRET,
              { sku: sku, storeViewCode: storeViewCode }
            ).then(function (payload) {
              var blocks = (payload.blocks || [])
                .map(mapPlacementToBlock)
                .filter(Boolean)
              return filterByBlockType(blocks, blockType || PLACEMENT_BLOCK_TYPE)
            })
          }

          var listBody = { operation: 'list', resolveConditions: true }
          if (blockType) {
            listBody.blockType = blockType
          }
          if (storeViewCode) {
            listBody.storeViewCode = storeViewCode
          }
          return postJson(
            secrets.LITTLEFARMS_BLOCK_STOREFRONT_URL,
            secrets.EVALUATE_SHARED_SECRET,
            listBody,
            { skipSecret: true }
          ).then(function (payload) {
            return (payload.blocks || []).map(function (block) {
              if (block.placement === undefined) {
                block.placement = null
              }
              return block
            })
          })
        }
      }
    }
  }
}
