# Conditional Block Storefront Contract

Call the `block-evaluate` web action from API Mesh or another trusted
storefront server.

## Catalog prerequisites

The ACCS Catalog Service `products(skus)` response must expose:

- `sku`
- custom attributes `brand`, `amount`, and `ac_attribute_set`
- category IDs
- anonymous final price

A condition whose source value is absent does not match. Version 1 does not
support Custom Layout Update, nested condition groups, or customer-group price.

## Request

```http
POST /block-evaluate
Content-Type: application/json
x-conditional-block-secret: <EVALUATE_SHARED_SECRET>

{"sku":"7069","storeViewCode":"default"}
```

## Response

```json
{
  "blocks": [
    {
      "id": "rule-id",
      "name": "Related products",
      "priority": 10,
      "title": "You may also like",
      "contentHtml": "",
      "targetSkus": ["8425", "700644"]
    }
  ]
}
```

An unknown SKU, no match, or a Catalog Service failure returns HTTP 200 with
`{"blocks":[]}`. A missing or incorrect secret returns HTTP 401.

The shopper browser must never receive `EVALUATE_SHARED_SECRET` or an Admin IMS
token. API Mesh or the storefront server must inject and retain the secret.

If API Mesh is added later, the intended field is:

```graphql
conditionalBlocks(
  sku: String!
  storeViewCode: String!
): [ConditionalBlock!]!
```

This repository has no existing Mesh configuration, so no separate Mesh project
or configuration is introduced here.
