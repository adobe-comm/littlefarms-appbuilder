# LittleFarms Blocks — Storefront & API Mesh Contract

Headless consumers (EDS, API Mesh, storefront servers) must **not** use Admin IMS tokens or call `block-condition-*` actions.

## Security

| Action | Auth |
|--------|------|
| **`block-storefront`** (list / get presets) | **Public** — no secret; only **enabled** presets are returned |
| **`block-evaluate`** (PDP placement) | **`x-conditional-block-secret`** = App Builder `EVALUATE_SHARED_SECRET` |

Browsers should call **API Mesh GraphQL**, not App Builder URLs directly. Mesh holds the evaluate secret for placement queries only ([`../api-mesh/`](../api-mesh/)).

---

## 1. Saved blocks (presets) — `block-storefront`

Used for **Brands List**, **Featured/Recommended** presets created in Blocks Management.

### List enabled blocks

```http
POST /api/v1/web/littlefarms-appbuilder/block-storefront
Content-Type: application/json

{"operation":"list","resolveConditions":true}
```

Optional filter:

```json
{"operation":"list","blockType":"littlefarms_brands_list","resolveConditions":true}
```

Set `"resolveConditions":false` to return block metadata only (no Commerce SKU resolution).

### Get one block

By **blockId** (same number as Admin **Block ID** — preferred for storefront):

```json
{"operation":"get","blockId":3,"resolveConditions":true}
```

Legacy request alias: `sequence`. Also: `blockNumber`. A numeric **`id`** (e.g. `"3"`) is treated as blockId.

By **title** (Admin **Title** / `name`; case-insensitive):

```json
{"operation":"get","title":"Homepage > Butchery","resolveConditions":true}
```

**Response:** **`blockId`** (int) and **`id`** (same value as string, e.g. `"3"`).

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
      "conditionsJson": "[{\"attribute\":\"category_id\",\"operator\":\"eq\",\"value\":\"42\"}]",
      "productSkus": ["SKU-1", "SKU-2"]
    }
  }
}
```

For **`littlefarms_featured_recommended`**, when `resolveConditions` is true (default), the action evaluates conditions against Commerce (same logic as Admin **Fetch SKUs**), returns matching SKUs in **`productSkus`**, and caches the SKU list in **App Builder State** for **`PRESET_RESULT_CACHE_TTL`** seconds (default **600** / 10 minutes). Cache for a block is cleared when the block is saved or deleted, or when an admin runs **`block-cache-flush`**.

Disabled or unknown blocks return **404** on get.

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

Deploy the mesh in [`../api-mesh/`](../api-mesh/) to expose blocks-only GraphQL (REST → GraphQL). **No Commerce catalog** in this mesh config for now.

```graphql
extend type Query {
  littleFarmsBlock(id: ID!): LittleFarmsBlock
  littleFarmsBlocks(blockType: String, sku: String, storeViewCode: String): [LittleFarmsBlock!]!
}
```

PDP rules use the same `LittleFarmsBlock` type with `blockType: "littlefarms_placement"` and `placement { … }`. Pass `sku` and `storeViewCode` on `littleFarmsBlocks` for placements; omit them for Admin presets.

Use the mesh endpoint for block fields; use Commerce GraphQL separately for `products` until you merge sources. Setup: [`../api-mesh/README.md`](../api-mesh/README.md).

---

## Environment variables (App Builder)

| Variable | Used by |
|----------|---------|
| `EVALUATE_SHARED_SECRET` | `block-evaluate` (storefront list/get is public) |
| `include-ims-credentials: true` | Any action that calls `@adobe/aio-lib-db` via `Core.AuthClient.generateAccessToken` — injects `__ims_oauth_s2s` at runtime (including public `block-storefront` / `block-evaluate`; does **not** require caller OAuth) |
| `IMS_CLIENT_ID` | Commerce GraphQL `x-api-key` where catalog calls need it (alongside annotation above) |
| `DB_REGION` | `block-storefront` (presets DB) |
| `COMMERCE_GRAPHQL_URL` + IMS | `block-evaluate` (catalog) |
| `COMMERCE_CORE_GRAPHQL_URL` / App Management config | Scope / environment id for presets |
