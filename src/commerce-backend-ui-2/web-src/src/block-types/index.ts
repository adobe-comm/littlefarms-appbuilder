/**
 * Block type registry. Add a type here and implement its form component under ./forms/.
 */
export const BLOCK_TYPE_FEATURED_RECOMMENDED = 'littlefarms_featured_recommended'

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
]

export function getBlockType(id: string): BlockTypeDefinition | undefined {
  return blockTypes.find(type => type.id === id)
}
