const {
  BLOCK_TYPE_BRANDS_LIST,
  BLOCK_TYPE_PLACEMENT,
  DEFAULT_BLOCK_TYPE
} = require('./constants')
const { readBlockId } = require('./preset-store')

/** Storefront-safe block payload for EDS / API Mesh (no internal DB fields). */
function toPublicBlock (preset) {
  if (!preset) return null
  const blockType = preset.blockType || DEFAULT_BLOCK_TYPE
  const blockId = readBlockId(preset)
  const base = {
    id: blockId != null ? String(blockId) : String(preset.id || ''),
    blockId,
    name: preset.name,
    blockType,
    enabled: preset.enabled !== false,
    placement: null
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
      conditionsJson: JSON.stringify(preset.logic?.conditions || []),
      productSkus: [],
      productSkusStatus: 'pending'
    }
  }
}

/** PDP placement rule (block-evaluate) in the same storefront shape as presets. */
function toPublicPlacementBlock (entry) {
  if (!entry) return null
  return {
    id: entry.id,
    name: entry.name,
    blockType: BLOCK_TYPE_PLACEMENT,
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

module.exports = { toPublicBlock, toPublicPlacementBlock }
