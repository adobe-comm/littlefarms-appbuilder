import { defineConfig } from '@adobe/aio-commerce-lib-app/config'

export default defineConfig({
  metadata: {
    id: 'littlefarms-blocks',
    displayName: 'Little Farms Admin',
    version: '1.0.1',
    description: 'Blocks, brands, and other Little Farms admin tools.'
  },
  adminUi: {
    menu: {
      id: 'blocks_management',
      label: 'Little Farms Admin',
      pageTitle: 'Little Farms Admin',
      description: 'Manage Little Farms features such as content blocks and brands.',
      parentMenu: 'content',
      aclProtected: true
    }
  },
  businessConfig: {
    schema: [
      {
        name: 'COMMERCE_CORE_GRAPHQL_URL',
        type: 'url',
        label: 'Commerce GraphQL endpoint',
        default: '',
        description:
          'ACCS GraphQL URL for admin catalog lookups (attributes, categories, products). Example: `https://na1-sandbox.api.commerce.adobe.com/<environment-id>/graphql`',
        env: ['saas']
      }
    ]
  }
})
