# LittleFarms Blocks — Storefront & API Mesh Contract

Headless consumers (EDS, API Mesh, storefront servers) must **not** use Admin IMS tokens or call `block-condition-*` actions.

## Security

| Action | Auth |
|--------|------|
| **`block-storefront`** (list / get presets) | **Public** — no secret; only **enabled** presets are returned. A 1-minute alarm sends `warm: true`. The action returns `{ "message": "action is live" }` and does not open the database |
| **`location-storefront`** (list / get locations) | **Public** — no secret; only **enabled** locations are returned. Same warm alarm as blocks/brands |
| **`block-evaluate`** (PDP placement) | **`x-conditional-block-secret`** = App Builder `EVALUATE_SHARED_SECRET` |

Browsers should call **API Mesh GraphQL**, not App Builder URLs directly. Mesh holds the evaluate secret for placement queries only ([`../api-mesh/`](../api-mesh/)).

---

## 1. Saved blocks (presets) — `block-storefront`

Used for **Brands List**, **Featured/Recommended** presets created in Blocks Management.

### List enabled blocks

```http
POST /api/v1/web/littlefarms-appbuilder/block-storefront
Content-Type: application/json

{"operation":"list"}
```

The list returns enabled presets only. It does not call Commerce and does not fill `productSkus`. The list is stored in App Builder State for the maximum TTL (365 days). A block save, a block delete, or **block-cache-flush** deletes that entry. Load one block with `operation: "get"` to resolve SKUs.

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

For **`littlefarms_featured_recommended`**, `operation: "get"` with `resolveConditions: true` (the default on get) evaluates conditions against Commerce, returns matching SKUs in **`productSkus`**, and caches that SKU list in **App Builder State** for **`PRESET_RESULT_CACHE_TTL`** seconds (default **600** / 10 minutes). The same TTL applies to a **full public block** cache keyed by **`blockId`** (or preset id) and **`updatedAt`**, so repeat gets skip the database and Commerce when the preset has not changed. Empty SKU lists are cached as well. Cache for a block is cleared when the block is saved or deleted, or when an admin runs **`block-cache-flush`**. `operation: "list"` does not resolve SKUs.

Set **`LOG_LEVEL=debug`** or **`PROFILE=true`** on the action to log per-phase timings (`config`, `stateInit`, `db`, `blockCacheRead`, `enrich`, etc.) in activation logs.

`block-storefront` does not create database indexes. `littlefarms_blocks` needs `block_name_scope`, `block_id_scope`, and `block_updated` once per Runtime namespace. Confirm with `aio app db index list littlefarms_blocks --json`. Create them from the repo root when a namespace does not have them yet. Add `--region` when `DB_REGION` is not `amer`. See [Block database indexes](../README.md#block-database-indexes).

```bash
aio app db index create littlefarms_blocks \
  --spec '{"scope.environmentId":1,"scope.storeViewCode":1,"normalizedName":1}' \
  --name block_name_scope \
  --unique

aio app db index create littlefarms_blocks \
  --spec '{"scope.environmentId":1,"scope.storeViewCode":1,"blockId":1}' \
  --name block_id_scope \
  --unique

aio app db index create littlefarms_blocks \
  --spec '{"updatedAt":-1}' \
  --name block_updated
```

API Mesh loads product details for a single block’s SKUs with Live Search `productSearch` (`phrase: ""`, filter attribute `sku` `in` the SKU list). `littleFarmsBlocks` does not call `productSearch`. `littleFarmsBlock` accepts an optional `filter` list (`attribute` plus `eq`, `in`, `startsWith`, `contains`, or `range`). The mesh sends those clauses first and always appends the block SKU clause. A client `sku` clause is rejected. The mesh returns them on **`products`** in the same order as the SKUs, leaving out SKUs that the extra filter excluded. **`productsStatus`** is `ok`, `empty`, `error`, or `commerce_unconfigured`. The SKU attribute, and every attribute in `filter`, must be filterable in search. Set `COMMERCE_CORE_GRAPHQL_URL` in mesh secrets. The REST action itself still returns SKUs only.

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
  littleFarmsBlocks: [LittleFarmsBlock!]!
}
```

`littleFarmsBlocks` takes no arguments and returns every enabled preset.

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

### Store locations

GraphQL: `littleFarmsLocation` and `littleFarmsLocations` (see [`../api-mesh/schema.graphql`](../api-mesh/schema.graphql)). Mesh calls the public **`location-storefront`** action.

**Directory (General Information, all enabled locations):**

```http
POST /api/v1/web/littlefarms-appbuilder/location-storefront
Content-Type: application/json

{"operation":"directory"}
```

Returns `{ "items": [ … ], "total": N }` with General Information fields only (no store hours, map coordinates, or rich content). Disabled locations are omitted. Sorted by Admin **Sort Order**, then **Location ID**. The response is stored in App Builder State (max TTL) until a location **write** or **mass** action clears the cache.

GraphQL **`littleFarmsLocations`** calls this operation and returns the `items` array as `[LittleFarmsLocationGeneral!]!`.

**Get one location** — provide exactly one of `locationId`, `title` (exact, case-insensitive), or `storeUrl`:

```json
{"operation":"get","locationId":1}
```

Response shape matches the Admin location form (`location` object with hours, map fields, rich content, and image URLs). For **`operation: get`** only, linked **services**, **galleries**, and **teamProfiles** are expanded from `littlefarms_location_content` (enabled rows only, order matches the id lists on the location document). **`operation: directory`** and **`list`** still omit linked content.

### Blog (posts & categories)

GraphQL: `littleFarmsBlogPosts`, `littleFarmsBlogPostsByCategory`, `littleFarmsBlogPost`, `littleFarmsBlogCategories`, `littleFarmsMostReadBlogPosts`, and mutation **`littleFarmsRecordBlogVisit`** (see [`../api-mesh/schema.graphql`](../api-mesh/schema.graphql)). Mesh calls the public **`blog-storefront`** action.

| `operation` | Purpose |
|-------------|---------|
| `list-posts` | Paginated published posts (summary fields + listing/featured images). Optional filters: `categoryId`, `tagId`, `isFeatured`, `isRecipe`, `customerGroupId`. Body: `page`, `pageSize` (default 20, max 100). |
| `list-posts-by-category` | Same as `list-posts` but scoped to one category. Provide `categoryId` or `categoryUrlKey`. Response includes `categoryId`. |
| `get-post` | Full post by `postId` or `urlKey`. |
| `list-categories` | Enabled categories with `categoryId`, `title`, `url_key`, `image`, `sort_order`, `parent_id`. |
| `most-read` | Top posts by `view_count` (default `limit` 10, max 50). Same optional filters as list. |
| `record-visit` | Increment `view_count` for a published post (`postId` or `urlKey`). |

List responses: `{ "page", "pageSize", "total", "pageCount", "items": [ … ] }`. Only **published** posts within publish/end window are returned. Customer group restrictions apply when `customerGroupId` is sent.

Example:

```http
POST /api/v1/web/littlefarms-appbuilder/blog-storefront
Content-Type: application/json

{"operation":"list-posts","page":1,"pageSize":12}
```

#### Blog database indexes

`blog-storefront` and blog admin actions do not create indexes. Create them once from the repo root in the Runtime namespace that owns the blog collections. Add `--region` when `DB_REGION` is not `amer`. Full command list and index table: [Blog database indexes](../README.md#blog-database-indexes).

**Posts** — confirm with `aio app db index list littlefarms_blog_posts --json`:

```bash
aio app db index create littlefarms_blog_posts \
  --spec '{"environmentId":1,"type":1,"postId":1}' \
  --name blog_post_id \
  --unique

aio app db index create littlefarms_blog_posts \
  --spec '{"environmentId":1,"type":1,"url_key":1}' \
  --name blog_post_url_key \
  --unique

aio app db index create littlefarms_blog_posts \
  --spec '{"environmentId":1,"type":1,"status":1,"publish_at":-1}' \
  --name blog_post_published

aio app db index create littlefarms_blog_posts \
  --spec '{"environmentId":1,"type":1,"status":1,"view_count":-1}' \
  --name blog_post_most_read

aio app db index create littlefarms_blog_posts \
  --spec '{"environmentId":1,"type":1,"category_ids":1}' \
  --name blog_post_category

aio app db index create littlefarms_blog_posts \
  --spec '{"environmentId":1,"type":1,"tag_ids":1}' \
  --name blog_post_tag

aio app db index create littlefarms_blog_posts \
  --spec '{"environmentId":1,"type":1,"updatedAt":-1}' \
  --name blog_post_updated
```

**Categories** — `aio app db index list littlefarms_blog_categories --json`:

```bash
aio app db index create littlefarms_blog_categories \
  --spec '{"environmentId":1,"type":1,"taxonomyId":1}' \
  --name blog_category_id \
  --unique

aio app db index create littlefarms_blog_categories \
  --spec '{"environmentId":1,"type":1,"url_key":1}' \
  --name blog_category_url_key \
  --unique

aio app db index create littlefarms_blog_categories \
  --spec '{"environmentId":1,"type":1,"is_active":1,"sort_order":1}' \
  --name blog_category_active_sort
```

**Tags** (admin + post tag filters) — `aio app db index list littlefarms_blog_tags --json`:

```bash
aio app db index create littlefarms_blog_tags \
  --spec '{"environmentId":1,"type":1,"taxonomyId":1}' \
  --name blog_tag_id \
  --unique

aio app db index create littlefarms_blog_tags \
  --spec '{"environmentId":1,"type":1,"url_key":1}' \
  --name blog_tag_url_key \
  --unique
```

| Collection | Index | Storefront / admin |
|------------|-------|-------------------|
| `littlefarms_blog_posts` | `blog_post_id`, `blog_post_url_key` | `get-post`, `record-visit` |
| `littlefarms_blog_posts` | `blog_post_most_read` | `most-read` |
| `littlefarms_blog_posts` | `blog_post_category`, `blog_post_tag` | List filters by category/tag |
| `littlefarms_blog_categories` | `blog_category_url_key` | `list-posts-by-category` with `categoryUrlKey` |
| `littlefarms_blog_categories` | `blog_category_active_sort` | `list-categories` |

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
