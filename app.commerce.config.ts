import { defineConfig } from '@adobe/aio-commerce-lib-app/config'

export default defineConfig({
  metadata: {
    id: 'littlefarms-blocks',
    displayName: 'LittleFarms',
    version: '1.0.0',
    description: 'Blocks Management for LittleFarms content types.'
  },
  adminUi: {
    menu: {
      id: 'blocks_management',
      label: 'Blocks Management',
      pageTitle: 'Blocks Management',
      description: 'Create and manage typed content blocks.',
      parentMenu: 'content',
      aclProtected: true
    }
  }
})
