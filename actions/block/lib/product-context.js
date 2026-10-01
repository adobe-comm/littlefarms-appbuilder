function attributeMap (attributes = []) {
  return attributes.reduce((result, attribute) => {
    if (attribute?.name) {
      result[attribute.name] = attribute.value
    }
    return result
  }, {})
}

function getCategoryIds (product) {
  const categories = product.categories || []
  return categories
    .map(category => category.externalId ?? category.id ?? category.uid)
    .filter(value => value !== undefined && value !== null)
    .map(String)
}

function getPrice (product) {
  return product.price?.final?.amount?.value ??
    product.priceRange?.minimum?.final?.amount?.value
}

function mapProductContext (product) {
  if (!product) return null

  const attributes = attributeMap(product.attributes)
  const category = getCategoryIds(product)
  if (category.length === 0) {
    const categoryAttribute = attributes.category_ids ?? attributes.category
    if (categoryAttribute !== undefined) {
      category.push(...(Array.isArray(categoryAttribute)
        ? categoryAttribute.map(String)
        : String(categoryAttribute).split(',').map(value => value.trim()).filter(Boolean)))
    }
  }

  const context = {
    ...attributes,
    sku: product.sku?.trim()
  }
  const attributeSet = attributes.attribute_set ?? attributes.ac_attribute_set ?? attributes.attribute_set_id
  if (attributeSet !== undefined) {
    context.attribute_set = attributeSet
    context.attribute_set_id = attributes.attribute_set_id ?? attributeSet
  }
  const brand = attributes.brand ?? attributes.lf_brand
  if (brand !== undefined) {
    context.brand = brand
    if (attributes.lf_brand === undefined) context.lf_brand = brand
  }
  if (category.length > 0) {
    context.category = category
    context.category_ids = category
  }
  const price = getPrice(product)
  if (price !== undefined) {
    context.price = price
    if (context.from_price === undefined) context.from_price = price
  }
  if (attributes.amount !== undefined) context.amount = attributes.amount
  return context
}

module.exports = { mapProductContext }
