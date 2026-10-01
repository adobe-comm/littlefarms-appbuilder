const { BLOCK_TYPE_BRANDS_LIST, DEFAULT_BLOCK_TYPE } = require('./constants')

/** Storefront-safe block payload for EDS / API Mesh (no internal DB fields). */
function toPublicBlock (preset) {
  if (!preset) return null
  const blockType = preset.blockType || DEFAULT_BLOCK_TYPE
  const base = {
    id: preset.id,
    name: preset.name,
    blockType,
    enabled: preset.enabled !== false
  }

  if (blockType === BLOCK_TYPE_BRANDS_LIST) {
    return {
      ...base,
      brandsList: {
        url: String(preset.logic?.url || '').trim(),
        items: (preset.logic?.items || []).map(item => ({
          image: String(item?.image || '').trim(),
          name: String(item?.name || '').trim(),
          link: String(item?.link || '').trim()
        }))
      },
      featuredRecommended: null
    }
  }

  return {
    ...base,
    brandsList: null,
    featuredRecommended: {
      aggregator: preset.logic?.aggregator || 'all',
      matchValue: preset.logic?.matchValue !== false,
      productsToDisplay: Number(preset.logic?.productsToDisplay) || 10,
      conditionsJson: JSON.stringify(preset.logic?.conditions || [])
    }
  }
}

module.exports = { toPublicBlock }
