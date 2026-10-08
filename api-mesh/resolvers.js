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

function commerceHeaders (secrets) {
  var url = String(secrets.COMMERCE_CORE_GRAPHQL_URL || '')
  var saas = /api\.commerce\.adobe\.com/i.test(url)
  var headers = { 'Content-Type': 'application/json' }
  if (secrets.MAGENTO_ENVIRONMENT_ID) headers['Magento-Environment-Id'] = secrets.MAGENTO_ENVIRONMENT_ID
  headers['Magento-Store-View-Code'] = secrets.MAGENTO_STORE_VIEW_CODE || 'default'
  if (secrets.MAGENTO_STORE_CODE) headers['Magento-Store-Code'] = secrets.MAGENTO_STORE_CODE
  if (secrets.MAGENTO_WEBSITE_CODE) headers['Magento-Website-Code'] = secrets.MAGENTO_WEBSITE_CODE
  headers['x-api-key'] = saas ? (secrets.MAGENTO_API_KEY || 'not_used') : (secrets.MAGENTO_API_KEY || '')
  return headers
}

var PRODUCT_SEARCH_QUERY = [
  'query LittleFarmsBlockProducts($filter: [SearchClauseInput!], $pageSize: Int!) {',
  '  productSearch(phrase: "", page_size: $pageSize, current_page: 1, filter: $filter) {',
  '    total_count',
  '    items {',
  '      productView {',
  '        sku',
  '        name',
  '        url',
  '        urlKey',
  '        inStock',
  '        addToCartAllowed',
  '        images { url label roles }',
  '        attributes { name label value roles }',
  '        ... on SimpleProductView {',
  '          price {',
  '            regular { amount { value currency } }',
  '            final { amount { value currency } }',
  '          }',
  '        }',
  '        ... on ComplexProductView {',
  '          priceRange {',
  '            minimum {',
  '              regular { amount { value currency } }',
  '              final { amount { value currency } }',
  '            }',
  '            maximum {',
  '              regular { amount { value currency } }',
  '              final { amount { value currency } }',
  '            }',
  '          }',
  '        }',
  '      }',
  '    }',
  '  }',
  '}'
].join('\n')

function uniqueSkus (skus) {
  var seen = {}
  var result = []
  ;(skus || []).forEach(function (value) {
    var sku = String(value || '').trim()
    if (!sku || seen[sku]) return
    seen[sku] = true
    result.push(sku)
  })
  return result
}

function money (amount) {
  if (!amount || amount.value == null) return null
  return { value: Number(amount.value), currency: amount.currency || '' }
}

function pricePair (price) {
  if (!price) return null
  return {
    regular: money(price.regular && price.regular.amount),
    final: money(price.final && price.final.amount)
  }
}

function mapProductView (view) {
  if (!view || !view.sku) return null
  return {
    sku: String(view.sku),
    name: view.name || '',
    url: view.url || '',
    urlKey: view.urlKey || '',
    inStock: view.inStock === true,
    addToCartAllowed: view.addToCartAllowed === true,
    images: (view.images || []).filter(Boolean).map(function (image) {
      return { url: image.url || '', label: image.label || '', roles: image.roles || [] }
    }),
    attributes: (view.attributes || []).filter(Boolean).map(function (attribute) {
      return {
        name: attribute.name || '',
        label: attribute.label || '',
        value: attribute.value == null ? '' : String(attribute.value),
        roles: attribute.roles || []
      }
    }),
    price: pricePair(view.price),
    priceRange: view.priceRange ? {
      minimum: pricePair(view.priceRange.minimum),
      maximum: pricePair(view.priceRange.maximum)
    } : null
  }
}

function storefrontSearchFilters (filters) {
  var list = filters || []
  if (list.length > 8) {
    return Promise.reject(new Error('filter accepts at most 8 clauses.'))
  }
  var clauses = []
  for (var index = 0; index < list.length; index += 1) {
    var clause = searchClause(list[index])
    if (!clause) {
      return Promise.reject(new Error(
        'filter clause ' + (index + 1) + ' needs attribute plus one of eq, in, startsWith, contains, or range. The sku attribute stays on the block.'
      ))
    }
    clauses.push(clause)
  }
  return Promise.resolve(clauses)
}

function searchClause (clause) {
  if (!clause || typeof clause !== 'object') return null
  var attribute = String(clause.attribute || '').trim()
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(attribute)) return null
  if (attribute.toLowerCase() === 'sku') return null
  var next = { attribute: attribute }
  var operators = 0
  if (clause.eq != null && String(clause.eq).trim()) {
    next.eq = String(clause.eq).trim().slice(0, 200)
    operators += 1
  }
  if (Array.isArray(clause.in)) {
    var values = clause.in.map(function (value) {
      return String(value == null ? '' : value).trim().slice(0, 100)
    }).filter(Boolean).slice(0, 20)
    if (values.length) {
      next.in = values
      operators += 1
    }
  }
  if (clause.startsWith != null && String(clause.startsWith).trim()) {
    var startsWith = String(clause.startsWith).trim()
    if (startsWith.length < 2 || startsWith.length > 10) return null
    next.startsWith = startsWith
    operators += 1
  }
  if (clause.contains != null && String(clause.contains).trim()) {
    var contains = String(clause.contains).trim()
    if (contains.length < 2 || contains.length > 10) return null
    next.contains = contains
    operators += 1
  }
  if (clause.range && typeof clause.range === 'object') {
    var range = {}
    if (clause.range.from != null && Number.isFinite(Number(clause.range.from))) range.from = Number(clause.range.from)
    if (clause.range.to != null && Number.isFinite(Number(clause.range.to))) range.to = Number(clause.range.to)
    if (range.from != null || range.to != null) {
      next.range = range
      operators += 1
    }
  }
  if (operators !== 1) return null
  return next
}

function searchFilter (skus, extra) {
  return (extra || []).concat([{ attribute: 'sku', in: skus }])
}

function searchProductGroup (secrets, skus, extra) {
  return fetch(String(secrets.COMMERCE_CORE_GRAPHQL_URL).trim(), {
    method: 'POST',
    headers: commerceHeaders(secrets),
    body: JSON.stringify({
      query: PRODUCT_SEARCH_QUERY,
      variables: { filter: searchFilter(skus, extra), pageSize: skus.length }
    })
  }).then(function (response) {
    return response.json().catch(function () {
      return {}
    }).then(function (payload) {
      if (!response.ok || (payload.errors && payload.errors.length)) {
        var message = (payload.errors && payload.errors[0] && payload.errors[0].message) || ('HTTP ' + response.status)
        return Promise.reject(new Error(message))
      }
      return ((payload.data && payload.data.productSearch && payload.data.productSearch.items) || [])
        .map(function (item) { return item && item.productView })
        .filter(Boolean)
    })
  })
}

function searchProducts (secrets, skus, extra) {
  var list = uniqueSkus(skus)
  if (!list.length) return Promise.resolve({ status: 'empty', bySku: {} })
  if (!String(secrets.COMMERCE_CORE_GRAPHQL_URL || '').trim()) {
    return Promise.resolve({ status: 'commerce_unconfigured', bySku: {} })
  }
  var groups = []
  for (var index = 0; index < list.length; index += 50) groups.push(list.slice(index, index + 50))
  var chain = Promise.resolve([])
  groups.forEach(function (group) {
    chain = chain.then(function (views) {
      return searchProductGroup(secrets, group, extra).then(function (next) {
        return views.concat(next)
      })
    })
  })
  return chain.then(function (views) {
    var bySku = {}
    views.forEach(function (view) {
      var product = mapProductView(view)
      if (product) bySku[product.sku] = product
    })
    return { status: 'ok', bySku: bySku }
  }).catch(function () {
    return { status: 'error', bySku: {} }
  })
}

function productsFor (skus, lookup) {
  return uniqueSkus(skus).map(function (sku) {
    return lookup.bySku[sku]
  }).filter(Boolean)
}

function applyProducts (block, lookup) {
  if (!block) return block
  if (block.featuredRecommended) {
    block.featuredRecommended.products = productsFor(block.featuredRecommended.productSkus || [], lookup)
    block.featuredRecommended.productsStatus = lookup.status
  }
  if (block.placement) {
    block.placement.products = productsFor(block.placement.targetSkus || [], lookup)
    block.placement.productsStatus = lookup.status
  }
  return block
}

function blockSkus (block) {
  if (!block) return []
  var skus = []
  if (block.featuredRecommended) skus = skus.concat(block.featuredRecommended.productSkus || [])
  if (block.placement) skus = skus.concat(block.placement.targetSkus || [])
  return skus
}

function enrichBlocks (blocks, secrets, extra) {
  var skus = []
  ;(blocks || []).forEach(function (block) {
    skus = skus.concat(blockSkus(block))
  })
  return searchProducts(secrets, skus, extra).then(function (lookup) {
    return (blocks || []).map(function (block) {
      return applyProducts(block, lookup)
    })
  })
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
          return storefrontSearchFilters(args.filter).then(function (filters) {
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
              return enrichBlocks(block ? [block] : [], secrets, filters).then(function (blocks) {
                return blocks[0] || null
              })
            })
          })
        }
      },
      littleFarmsBlocks: {
        resolve: function (_root, args, context) {
          var secrets = secretsFrom(context)
          var sku = String(args.sku || '').trim()
          var blockType = String(args.blockType || '').trim()

          if (sku) {
            return postJson(
              secrets.LITTLEFARMS_BLOCK_EVALUATE_URL,
              secrets.EVALUATE_SHARED_SECRET,
              { sku: sku, storeViewCode: 'default' }
            ).then(function (payload) {
              var blocks = (payload.blocks || [])
                .map(mapPlacementToBlock)
                .filter(Boolean)
              return enrichBlocks(filterByBlockType(blocks, blockType || PLACEMENT_BLOCK_TYPE), secrets)
            })
          }

          var listBody = { operation: 'list', resolveConditions: true }
          if (blockType) {
            listBody.blockType = blockType
          }
          return postJson(
            secrets.LITTLEFARMS_BLOCK_STOREFRONT_URL,
            secrets.EVALUATE_SHARED_SECRET,
            listBody,
            { skipSecret: true }
          ).then(function (payload) {
            var blocks = (payload.blocks || []).map(function (block) {
              if (block.placement === undefined) {
                block.placement = null
              }
              return block
            })
            return enrichBlocks(blocks, secrets)
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
          if (args.widget) body.widget = String(args.widget).trim()
          if (args.name) body.name = String(args.name).trim()
          if (typeof args.isActive === 'boolean') body.isActive = args.isActive
          if (typeof args.isNewBrand === 'boolean') body.isNewBrand = args.isNewBrand
          if (typeof args.isTopBrand === 'boolean') body.isTopBrand = args.isTopBrand
          if (typeof args.isFeatured === 'boolean') body.isFeatured = args.isFeatured
          if (typeof args.showInBrandListWidget === 'boolean') body.showInBrandListWidget = args.showInBrandListWidget
          if (typeof args.showInBrandSliderWidget === 'boolean') body.showInBrandSliderWidget = args.showInBrandSliderWidget
          if (args.page != null) body.page = args.page
          if (args.pageSize != null) body.pageSize = args.pageSize
          return postJson(
            secrets.LITTLEFARMS_BRAND_STOREFRONT_URL,
            '',
            body,
            { skipSecret: true }
          ).then(function (payload) {
            var pageSize = Number(payload.pageSize) || 50
            var total = Number(payload.total) || 0
            return {
              page: Number(payload.page) || 1,
              pageSize: pageSize,
              total: total,
              pageCount: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
              items: (payload.items || []).map(mapBrand).filter(Boolean)
            }
          })
        }
      }
    }
  }
}
