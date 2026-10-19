/*
 * API Mesh programmatic resolvers (ES5-safe for mesh lint).
 * URLs and secret: context.secrets (see secrets.yaml + --secrets on deploy).
 */

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

function secretsFrom (context) {
  return (context && context.secrets) || {}
}

var WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function mapDayHours (row) {
  row = row || {}
  return {
    open: row.open === true,
    from: row.from || '',
    to: row.to || ''
  }
}

function mapWeekHours (source) {
  source = source || {}
  var hours = {}
  WEEK_DAYS.forEach(function (day) {
    hours[day] = mapDayHours(source[day])
  })
  return hours
}

function mapLocationGeneral (entry) {
  if (!entry || entry.locationId == null) return null
  return {
    id: String(entry.locationId),
    locationId: Number(entry.locationId),
    title: entry.title || '',
    storeUrl: entry.storeUrl || '',
    country: entry.country || '',
    state: entry.state || '',
    city: entry.city || '',
    street: entry.street || '',
    zip: entry.zip || '',
    phone: entry.phone || '',
    email: entry.email || '',
    websiteUrl: entry.websiteUrl || '',
    openInNewTab: entry.openInNewTab === true,
    storeViews: Array.isArray(entry.storeViews) ? entry.storeViews.filter(Boolean) : [],
    storeViewLabel: entry.storeViewLabel || '',
    description: entry.description || '',
    sortOrder: entry.sortOrder || '',
    logo: entry.logo || '',
    locationImage: entry.locationImage || '',
    mapMarker: entry.mapMarker || '',
    metaTitle: entry.metaTitle || '',
    metaKeywords: entry.metaKeywords || '',
    metaDescription: entry.metaDescription || '',
    isFeatured: entry.isFeatured === true
  }
}

function mapLocation (entry) {
  if (!entry || entry.locationId == null) return null
  return {
    locationId: Number(entry.locationId),
    title: entry.title || '',
    status: entry.status === 'disabled' ? 'disabled' : 'enabled',
    logo: entry.logo || '',
    storeUrl: entry.storeUrl || '',
    country: entry.country || '',
    state: entry.state || '',
    city: entry.city || '',
    street: entry.street || '',
    zip: entry.zip || '',
    phone: entry.phone || '',
    email: entry.email || '',
    websiteUrl: entry.websiteUrl || '',
    openInNewTab: entry.openInNewTab === true,
    storeViews: Array.isArray(entry.storeViews) ? entry.storeViews.filter(Boolean) : [],
    description: entry.description || '',
    sortOrder: entry.sortOrder || '',
    locationImage: entry.locationImage || '',
    mapMarker: entry.mapMarker || '',
    metaTitle: entry.metaTitle || '',
    metaKeywords: entry.metaKeywords || '',
    metaDescription: entry.metaDescription || '',
    isFeatured: entry.isFeatured === true,
    zoom: entry.zoom || '',
    latitude: entry.latitude || '',
    longitude: entry.longitude || '',
    storeBanner: entry.storeBanner || '',
    travelSuggestion: entry.travelSuggestion || '',
    services: Array.isArray(entry.services) ? entry.services.filter(Boolean) : [],
    storeContent: entry.storeContent || '',
    galleries: Array.isArray(entry.galleries) ? entry.galleries.filter(Boolean) : [],
    galleryTitle: entry.galleryTitle || '',
    galleryDescription: entry.galleryDescription || '',
    teamProfiles: Array.isArray(entry.teamProfiles) ? entry.teamProfiles.filter(Boolean) : [],
    promotions: entry.promotions || '',
    isStore: entry.isStore === true,
    storeHours: mapWeekHours(entry.storeHours),
    isCafe: entry.isCafe === true,
    cafeHours: mapWeekHours(entry.cafeHours)
  }
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

function mapBlogPostSummary (item) {
  if (!item || item.postId == null) return null
  return {
    postId: Number(item.postId),
    title: item.title || '',
    urlKey: item.url_key || '',
    publishAt: item.publish_at || '',
    isFeatured: item.is_featured === true,
    isRecipe: item.is_recipe === true,
    listingImage: item.listing_image || '',
    featuredImage: item.featured_image || '',
    shortContent: item.short_content || '',
    viewCount: Number(item.view_count) || 0,
    categoryIds: (item.category_ids || []).map(function (id) { return Number(id) }).filter(function (id) { return id > 0 }),
    tagIds: (item.tag_ids || []).map(function (id) { return Number(id) }).filter(function (id) { return id > 0 })
  }
}

function mapBlogPostDetail (item) {
  var summary = mapBlogPostSummary(item)
  if (!summary) return null
  return {
    postId: summary.postId,
    title: summary.title,
    urlKey: summary.urlKey,
    publishAt: summary.publishAt,
    isFeatured: summary.isFeatured,
    isRecipe: summary.isRecipe,
    listingImage: summary.listingImage,
    featuredImage: summary.featuredImage,
    shortContent: summary.shortContent,
    viewCount: summary.viewCount,
    categoryIds: summary.categoryIds,
    tagIds: summary.tagIds,
    content: item.content || '',
    useShortContent: item.use_short_content === true,
    mobileImage: item.mobile_image || '',
    featuredImageTitle: item.featured_image_title || '',
    featuredImageAlt: item.featured_image_alt || '',
    featuredImageLink: item.featured_image_link || '',
    listingImageTitle: item.listing_image_title || '',
    listingImageAlt: item.listing_image_alt || '',
    metaTitle: item.meta_title || '',
    metaDescription: item.meta_description || '',
    metaKeywords: item.meta_keywords || '',
    metaPrefix: item.meta_prefix || '',
    metaSuffix: item.meta_suffix || '',
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || ''
  }
}

function mapBlogPostsPayload (payload) {
  payload = payload || {}
  return {
    page: Number(payload.page) || 1,
    pageSize: Number(payload.pageSize) || 20,
    total: Number(payload.total) || 0,
    pageCount: Number(payload.pageCount) || 0,
    items: (payload.items || []).map(mapBlogPostSummary).filter(Boolean)
  }
}

function mapBlogCategory (item) {
  if (!item || item.categoryId == null) return null
  return {
    categoryId: Number(item.categoryId),
    title: item.title || '',
    urlKey: item.url_key || '',
    image: item.image || '',
    sortOrder: Number(item.sort_order) || 0,
    parentId: item.parent_id == null || item.parent_id === '' ? null : Number(item.parent_id)
  }
}

function blogListFiltersFrom (args) {
  var body = {}
  if (args.categoryId != null) body.categoryId = args.categoryId
  if (args.tagId != null) body.tagId = args.tagId
  if (typeof args.isFeatured === 'boolean') body.isFeatured = args.isFeatured
  if (typeof args.isRecipe === 'boolean') body.isRecipe = args.isRecipe
  if (args.customerGroupId != null) body.customerGroupId = args.customerGroupId
  return body
}

function blogStorefrontPost (secrets, body) {
  return postJson(
    secrets.LITTLEFARMS_BLOG_STOREFRONT_URL,
    '',
    body,
    { skipSecret: true }
  )
}

function resolveLittleFarmsRecordBlogVisit (_root, args, context) {
  var secrets = secretsFrom(context)
  var postId = args.postId != null ? Number(args.postId) : null
  var urlKey = String(args.urlKey || '').trim()
  var lookups = [(postId > 0 ? String(postId) : ''), urlKey].filter(Boolean)
  if (lookups.length !== 1) {
    return Promise.reject(new Error('littleFarmsRecordBlogVisit requires exactly one of postId or urlKey.'))
  }
  var body = { operation: 'record-visit' }
  if (postId > 0) body.postId = postId
  else body.urlKey = urlKey
  return blogStorefrontPost(secrets, body).then(function (payload) {
    return {
      postId: Number(payload.postId),
      viewCount: Number(payload.view_count) || 0
    }
  })
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
        resolve: function (_root, _args, context) {
          var secrets = secretsFrom(context)
          var listBody = { operation: 'list' }
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
      },
      littleFarmsLocation: {
        resolve: function (_root, args, context) {
          var secrets = secretsFrom(context)
          var locationId = args.locationId != null ? String(args.locationId).trim() : ''
          var title = String(args.title || '').trim()
          var storeUrl = String(args.storeUrl || '').trim()
          var lookups = [locationId, title, storeUrl].filter(Boolean)
          if (lookups.length !== 1) {
            return Promise.reject(new Error('littleFarmsLocation requires exactly one of locationId, title, or storeUrl.'))
          }
          var body = { operation: 'get' }
          if (locationId) body.locationId = locationId
          else if (title) body.title = title
          else body.storeUrl = storeUrl
          return postJson(
            secrets.LITTLEFARMS_LOCATION_STOREFRONT_URL,
            '',
            body,
            { skipSecret: true }
          ).then(function (payload) {
            return mapLocation(payload.location)
          })
        }
      },
      littleFarmsLocations: {
        resolve: function (_root, _args, context) {
          var secrets = secretsFrom(context)
          return postJson(
            secrets.LITTLEFARMS_LOCATION_STOREFRONT_URL,
            '',
            { operation: 'directory' },
            { skipSecret: true }
          ).then(function (payload) {
            return (payload.items || []).map(mapLocationGeneral).filter(Boolean)
          })
        }
      },
      littleFarmsBlogPosts: {
        resolve: function (_root, args, context) {
          var secrets = secretsFrom(context)
          var body = { operation: 'list-posts' }
          if (args.page != null) body.page = args.page
          if (args.pageSize != null) body.pageSize = args.pageSize
          Object.assign(body, blogListFiltersFrom(args))
          return blogStorefrontPost(secrets, body).then(mapBlogPostsPayload)
        }
      },
      littleFarmsBlogPostsByCategory: {
        resolve: function (_root, args, context) {
          var secrets = secretsFrom(context)
          var categoryId = args.categoryId != null ? Number(args.categoryId) : null
          var categoryUrlKey = String(args.categoryUrlKey || '').trim()
          if (!(categoryId > 0) && !categoryUrlKey) {
            return Promise.reject(new Error('littleFarmsBlogPostsByCategory requires categoryId or categoryUrlKey.'))
          }
          var body = { operation: 'list-posts-by-category' }
          if (categoryId > 0) body.categoryId = categoryId
          if (categoryUrlKey) body.categoryUrlKey = categoryUrlKey
          if (args.page != null) body.page = args.page
          if (args.pageSize != null) body.pageSize = args.pageSize
          Object.assign(body, blogListFiltersFrom(args))
          return blogStorefrontPost(secrets, body).then(function (payload) {
            var mapped = mapBlogPostsPayload(payload)
            mapped.categoryId = Number(payload.categoryId) || categoryId || 0
            return mapped
          })
        }
      },
      littleFarmsBlogPost: {
        resolve: function (_root, args, context) {
          var secrets = secretsFrom(context)
          var postId = args.postId != null ? Number(args.postId) : null
          var urlKey = String(args.urlKey || '').trim()
          var lookups = [(postId > 0 ? String(postId) : ''), urlKey].filter(Boolean)
          if (lookups.length !== 1) {
            return Promise.reject(new Error('littleFarmsBlogPost requires exactly one of postId or urlKey.'))
          }
          var body = { operation: 'get-post' }
          if (postId > 0) body.postId = postId
          else body.urlKey = urlKey
          return blogStorefrontPost(secrets, body).then(function (payload) {
            return mapBlogPostDetail(payload.post)
          })
        }
      },
      littleFarmsBlogCategories: {
        resolve: function (_root, _args, context) {
          var secrets = secretsFrom(context)
          return blogStorefrontPost(secrets, { operation: 'list-categories' }).then(function (payload) {
            return (payload.items || []).map(mapBlogCategory).filter(Boolean)
          })
        }
      },
      littleFarmsMostReadBlogPosts: {
        resolve: function (_root, args, context) {
          var secrets = secretsFrom(context)
          var body = { operation: 'most-read' }
          if (args.limit != null) body.limit = args.limit
          Object.assign(body, blogListFiltersFrom(args))
          return blogStorefrontPost(secrets, body).then(function (payload) {
            return (payload.items || []).map(mapBlogPostSummary).filter(Boolean)
          })
        }
      }
    },
    Mutation: {
      littleFarmsRecordBlogVisit: {
        resolve: resolveLittleFarmsRecordBlogVisit
      }
    }
  }
}
