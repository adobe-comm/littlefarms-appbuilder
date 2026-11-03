import { defineConfig } from '@adobe/aio-commerce-lib-app/config'
import { MENU_CONTENT } from '@adobe/aio-commerce-lib-admin-ui/menu'

export default defineConfig({
  metadata: {
    id: 'littlefarms-blocks',
    displayName: 'Little Farms Admin',
    version: '1.0.4',
    description: 'Blocks, brands, locations, blog, and other Little Farms admin tools.'
  },
  adminUi: {
    menu: {
      id: 'blocks_management',
      label: 'Little Farms Admin',
      pageTitle: 'Little Farms Admin',
      description: 'Manage Little Farms features such as content blocks, brands, locations, and blog.',
      parentMenu: MENU_CONTENT,
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
      },
      {
        name: 'COMMERCE_CORE_REST_URL',
        type: 'url',
        label: 'Commerce REST API base (V1)',
        default: '',
        description:
          'ACCS REST base through `/V1` (orders, custom attributes). Example: `https://na1-sandbox.api.commerce.adobe.com/<environment-id>/V1`',
        env: ['saas']
      }
    ]
  },
  eventing: {
    commerce: [
      {
        provider: {
          label: 'Little Farms Delivery Slot',
          description: 'Books delivery slot capacity when checkout completes.'
        },
        events: [
          {
            name: 'observer.sales_order_save_commit_after',
            label: 'Order saved (after commit)',
            description:
              'Increment booked delivery slot counts from order custom attributes delivery_date_time and delivery_date_time_slot.',
            fields: [
              { name: 'id', label: 'Order entity ID' },
              { name: 'increment_id', label: 'Order increment ID' },
              { name: 'custom_attributes', label: 'Order custom attributes (array)' }
            ],
            priority: true,
            env: ['saas'],
            runtimeActions: ['littlefarms-appbuilder/delivery-slot-order-book']
          }
        ]
      }
    ]
  }
})
