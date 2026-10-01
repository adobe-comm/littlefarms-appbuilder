# LittleFarms Blocks — Storefront & API Mesh Contract

Headless consumers (EDS, API Mesh, storefront servers) must **not** use Admin IMS tokens or call `block-condition-*` actions. Use the storefront actions below with a shared secret held only on the server / mesh.

## Security

| Header | Value |
|--------|--------|
| `x-conditional-block-secret` | Same as App Builder `EVALUATE_SHARED_SECRET` |

The shopper browser must never receive this secret. API Mesh stores it in mesh environment variables (see [`../api-mesh/sample.env`](../api-mesh/sample.env)).

---

## 1. Saved blocks (presets) — `block-storefront`

Used for **Brands List**, **Featured/Recommended** presets created in Blocks Management.

### List enabled blocks

```http
POST /api/v1/web/littlefarms-appbuilder/block-storefront
Content-Type: application/json
x-conditional-block-secret: <EVALUATE_SHARED_SECRET>

{"operation":"list"}
```

Optional filter:

```json
{"operation":"list","blockType":"littlefarms_brands_list"}
```

### Get one block

```json
{"operation":"get","id":"<preset-uuid>"}
```

### Response shapes

**Brands list (`littlefarms_brands_list`):**

```json
{
  "block": {
    "id": "…",
    "name": "Homepage brands",
    "blockType": "littlefarms_brands_list",
    "enabled": true,
    "brandsList": {
      "url": "https://example.com/brands",
      "items": [
        { "image": "/media/brand-a.png", "name": "Brand A", "link": "https://…" }
      ]
    },
    "featuredRecommended": null
  }
}
```

**Featured / recommended (`littlefarms_featured_recommended`):**

```json
{
  "block": {
    "id": "…",
    "name": "Summer picks",
    "blockType": "littlefarms_featured_recommended",
    "enabled": true,
    "brandsList": null,
    "featuredRecommended": {
      "aggregator": "all",
      "matchValue": true,
      "productsToDisplay": 12,
      "conditionsJson": "[{\"attribute\":\"category_id\",\"operator\":\"eq\",\"value\":\"42\"}]"
    }
  }
}
```

Disabled or unknown blocks return **404** on get. Unauthorized returns **401**.

---

## 2. PDP conditional rules — `block-evaluate`

Call from API Mesh or another trusted storefront server when the shopper views a product.

### Catalog prerequisites

The ACCS Catalog Service `products(skus)` response must expose:

- `sku`
- custom attributes `brand`, `amount`, and `ac_attribute_set`
- category IDs
- anonymous final price

A condition whose source value is absent does not match. Version 1 does not support Custom Layout Update, nested condition groups, or customer-group price.

### Request

```http
POST /api/v1/web/littlefarms-appbuilder/block-evaluate
Content-Type: application/json
x-conditional-block-secret: <EVALUATE_SHARED_SECRET>

{"sku":"7069","storeViewCode":"default"}
```

### Response

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

An unknown SKU, no match, or a Catalog Service failure returns HTTP 200 with `{"blocks":[]}`. A missing or incorrect secret returns HTTP 401.

---

## 3. API Mesh / EDS GraphQL

Deploy the mesh extension in [`../api-mesh/`](../api-mesh/) to expose:

```graphql
extend type Query {
  littleFarmsBlock(id: ID!): LittleFarmsBlock
  littleFarmsBlocks(blockType: String): [LittleFarmsBlock!]!
  littleFarmsConditionalBlocks(sku: String!, storeViewCode: String!): [LittleFarmsConditionalBlock!]!
}
```

EDS queries the **unified mesh endpoint** (Commerce + LittleFarms fields in one request). Setup steps are in [`../api-mesh/README.md`](../api-mesh/README.md).

---

## Environment variables (App Builder)

| Variable | Used by |
|----------|---------|
| `EVALUATE_SHARED_SECRET` | `block-storefront`, `block-evaluate` |
| `DB_REGION` | `block-storefront` (presets DB) |
| `COMMERCE_GRAPHQL_URL` + IMS | `block-evaluate` (catalog) |
| `COMMERCE_CORE_GRAPHQL_URL` / App Management config | Scope / environment id for presets |
