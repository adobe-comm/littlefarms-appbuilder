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

function mapBrand (entry) {
  if (!entry || entry.id == null || entry.id === '') return null
  return {
    id: String(entry.id),
    name: entry.name || '',
    attributeCode: entry.attributeCode || '',
    urlAlias: entry.urlAlias || '',
    isActive: entry.isActive !== false,
    isNewBrand: entry.isNewBrand === true,
    isTopBrand: entry.isTopBrand === true,
    isFeatured: entry.isFeatured === true,
    showInBrandListWidget: entry.showInBrandListWidget !== false,
    showInBrandSliderWidget: entry.showInBrandSliderWidget === true,
    sliderPosition: Number(entry.sliderPosition) || 0,
    metaTitle: entry.metaTitle || '',
    metaDescription: entry.metaDescription || '',
    metaKeywords: entry.metaKeywords || '',
    pageTitle: entry.pageTitle || '',
    description: entry.description || '',
    shortDescription: entry.shortDescription || '',
    image: entry.image || '',
    imageAlt: entry.imageAlt || '',
    smallImage: entry.smallImage || '',
    smallImageAlt: entry.smallImageAlt || '',
    storeViewCode: entry.storeViewCode || 'default'
  }
}

module.exports = {
  resolvers: {
    Query: {
      littleFarmsBlock: {
        resolve: function (_root, args, context) {
          var secrets = secretsFrom(context)
          var id = String(args.id || '').trim()
          var title = String(args.title || '').trim()
          var blockId = args.blockId != null ? Number(args.blockId) : null
          if (!id && !title && !(blockId > 0)) {
            return Promise.reject(new Error('littleFarmsBlock requires blockId, id, or title.'))
          }
          var body = { operation: 'get', resolveConditions: true }
          if (blockId > 0) body.blockId = blockId
          else if (id) body.id = id
          else body.title = title
          return postJson(
            secrets.LITTLEFARMS_BLOCK_STOREFRONT_URL,
            secrets.EVALUATE_SHARED_SECRET,
            body,
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
      },
      littleFarmsBrand: {
        resolve: function (_root, args, context) {
          var secrets = secretsFrom(context)
          var id = String(args.id || '').trim()
          var name = String(args.name || '').trim()
          var urlAlias = String(args.urlAlias || '').trim()
          var lookups = [id, name, urlAlias].filter(Boolean)
          if (lookups.length !== 1) {
            return Promise.reject(new Error('littleFarmsBrand requires exactly one of id, name, or urlAlias.'))
          }
          var body = { operation: 'get' }
          if (id) body.id = id
          else if (name) body.name = name
          else body.urlAlias = urlAlias
          if (args.storeViewCode) body.storeViewCode = String(args.storeViewCode).trim()
          return postJson(
            secrets.LITTLEFARMS_BRAND_STOREFRONT_URL,
            '',
            body,
            { skipSecret: true }
          ).then(function (payload) {
            return mapBrand(payload.brand)
          })
        }
      },
      littleFarmsBrandsList: {
        resolve: function (_root, args, context) {
          var secrets = secretsFrom(context)
          var body = { operation: 'directory' }
          if (args.storeViewCode) body.storeViewCode = String(args.storeViewCode).trim()
          return postJson(
            secrets.LITTLEFARMS_BRAND_STOREFRONT_URL,
            '',
            body,
            { skipSecret: true }
          ).then(function (payload) {
            return (payload.items || []).filter(function (item) {
              return item && item.id
            }).map(function (item) {
              return {
                id: String(item.id),
                name: item.name || '',
                slug: item.slug || '',
                image: item.image || ''
              }
            })
          })
        }
      },
      littleFarmsBrands: {
        resolve: function (_root, args, context) {
          var secrets = secretsFrom(context)
          var body = { operation: 'list' }
          if (args.storeViewCode) body.storeViewCode = String(args.storeViewCode).trim()
          if (args.widget) body.widget = String(args.widget).trim()
          if (args.page != null) body.page = args.page
          if (args.pageSize != null) body.pageSize = args.pageSize
          return postJson(
            secrets.LITTLEFARMS_BRAND_STOREFRONT_URL,
            '',
            body,
            { skipSecret: true }
          ).then(function (payload) {
            return (payload.items || []).map(mapBrand).filter(Boolean)
          })
        }
      }
    }
  }
}
