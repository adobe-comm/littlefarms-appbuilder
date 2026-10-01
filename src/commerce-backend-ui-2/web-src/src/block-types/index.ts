/**
 * Block type registry. Add a type here and implement its form component under ./forms/.
 */
export const BLOCK_TYPE_FEATURED_RECOMMENDED = 'littlefarms_featured_recommended'
export const BLOCK_TYPE_BRANDS_LIST = 'littlefarms_brands_list'

export type BlockTypeDefinition = {
  id: string
  label: string
  description: string
}

export const blockTypes: BlockTypeDefinition[] = [
  {
    id: BLOCK_TYPE_FEATURED_RECOMMENDED,
    label: 'LittleFarms: Featured/Recommended Products',
    description: 'Show products matching ALL or ANY conditions, up to a configured limit.',
  },
  {
    id: BLOCK_TYPE_BRANDS_LIST,
    label: 'LittleFarms: Brands List',
    description: 'Curated list of brands with image, name, and link, plus an optional view-all URL.',
  },
]

export function getBlockType(id: string): BlockTypeDefinition | undefined {
  return blockTypes.find(type => type.id === id)
}
