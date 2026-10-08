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

API Mesh then loads product details for those SKUs, and for placement `targetSkus`, with Live Search `productSearch` (`phrase: ""`, filter attribute `sku` `in` the SKU list). `littleFarmsBlock` accepts an optional `filter` list (`attribute` plus `eq`, `in`, `startsWith`, `contains`, or `range`). The mesh sends those clauses first and always appends the block SKU clause. A client `sku` clause is rejected. The mesh returns them on **`products`** in the same order as the SKUs, leaving out SKUs that the extra filter excluded. **`productsStatus`** is `ok`, `empty`, `error`, or `commerce_unconfigured`. The SKU attribute, and every attribute in `filter`, must be filterable in search. Set `COMMERCE_CORE_GRAPHQL_URL` in mesh secrets. The REST action itself still returns SKUs only.

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
  littleFarmsBlock(id: ID, title: String, blockId: Int, filter: [LittleFarmsProductSearchFilter!]): LittleFarmsBlock
  littleFarmsBlocks(blockType: String, sku: String): [LittleFarmsBlock!]!
}
```

PDP rules use the same `LittleFarmsBlock` type with `blockType: "littlefarms_placement"` and `placement { … }`. Pass `sku` on `littleFarmsBlocks` for placements; omit it for Admin presets. The mesh sends the single store view to `block-evaluate`.

Use the mesh endpoint for block fields; use Commerce GraphQL separately for `products` until you merge sources. Setup: [`../api-mesh/README.md`](../api-mesh/README.md).

### Brands

`littleFarmsBrandsList` returns every active brand (`id`, `name`, `slug`, `image`).

`littleFarmsBrands` returns one page of full brand records. `page` starts at 1. `pageSize` defaults to 50 and cannot be higher than 50. `total` is the number of brands that match the filters. `pageCount` is `total` divided by `pageSize`, rounded up. Ask for the next page while `page` is less than `pageCount`. Filters combine: a brand must match every argument that is set.

```graphql
query {
  littleFarmsBrands(
    name: "farm"
    isActive: true
    isFeatured: true
    showInBrandListWidget: true
    page: 1
    pageSize: 50
  ) {
    page
    pageSize
    total
    pageCount
    items {
      id
      name
      urlAlias
      isNewBrand
      isTopBrand
      showInBrandSliderWidget
    }
  }
}
```

| Argument | Match |
|----------|--------|
| `name` | Brand name contains this text, ignoring case |
| `isActive` | Active flag. Omitted means active brands only |
| `isNewBrand` | New brand flag |
| `isTopBrand` | Top brand flag |
| `isFeatured` | Featured flag |
| `showInBrandListWidget` | Shown in the brand list widget |
| `showInBrandSliderWidget` | Shown in the brand slider widget |

`widget: LIST` and `widget: SLIDER` still apply with these filters. `pageSize` max is 50.

These filters read `littlefarms_brands`. Create the indexes once from the repo root, in the Runtime namespace that owns the database. Add `--region` when `DB_REGION` is not `amer`. See [Brand database indexes](../README.md#brand-database-indexes).

```bash
aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"hidden":1,"optionRemoved":1,"is_active":1,"optionLabel":1}' \
  --name brand_active

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"hidden":1,"optionRemoved":1,"is_new_brand":1,"optionLabel":1}' \
  --name brand_new

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"hidden":1,"optionRemoved":1,"is_top_brand":1,"optionLabel":1}' \
  --name brand_top

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"hidden":1,"optionRemoved":1,"is_featured":1,"optionLabel":1}' \
  --name brand_featured

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"hidden":1,"optionRemoved":1,"show_in_brand_list_widget":1,"optionLabel":1}' \
  --name brand_list_widget

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"hidden":1,"optionRemoved":1,"show_in_brand_slider_widget":1,"optionLabel":1}' \
  --name brand_slider_widget

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"normalizedLabel":1}' \
  --name brand_name
```

| Index | Speeds up |
|-------|-----------|
| `brand_active` | `isActive`, and the active-only `littleFarmsBrandsList` |
| `brand_new` | `isNewBrand` |
| `brand_top` | `isTopBrand` |
| `brand_featured` | `isFeatured` |
| `brand_list_widget` | `showInBrandListWidget` and `widget: LIST` |
| `brand_slider_widget` | `showInBrandSliderWidget` and `widget: SLIDER` |
| `brand_name` | `littleFarmsBrand(name:)` |

`littleFarmsBrands(name:)` still matches the brand name as a contains search on the rows the flag indexes return. Confirm the indexes with `aio app db index list littlefarms_brands --json`.

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
