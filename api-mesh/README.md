# API Mesh — Little Farms Blocks (REST → GraphQL)

This mesh exposes Little Farms **blocks**, **brands**, **store locations**, and **blog** App Builder actions as GraphQL. It does **not** include Adobe Commerce catalog in the schema for now. EDS can call a dedicated mesh endpoint for `littleFarmsBlock`, `littleFarmsBrand`, `littleFarmsLocation`, and related fields; Commerce `products` queries stay on the Commerce GraphQL endpoint (or a separate mesh you add later).

## Architecture

```text
EDS / server
    → Little Farms API Mesh (this config)
        → resolvers.js
            → block-storefront (presets: list / get)
            → brand-storefront (brands: list / get / directory)
            → location-storefront (locations: list / get)
            → blog-storefront (posts / categories / visits)
```

**Preset list/get** is public on `block-storefront` (no shared secret). `littleFarmsBlocks` takes no arguments and returns every enabled preset.

Browser clients should use this mesh endpoint (with CORS); do not call App Builder action URLs from the shopper page.

## GraphQL API

| Field | Purpose |
|--------|---------|
| `littleFarmsBlock(blockId:)` / `id` / `title` | One preset by Admin **Block ID**, UUID, or title. Optional `filter` is added to Live Search `productSearch` together with the block SKU list. Featured and placement blocks also include **`products`** |
| `littleFarmsBlocks` | Every enabled preset. No arguments. Returns block fields only. SKUs and `products` come from `littleFarmsBlock` |
| `littleFarmsBrandsList` | Every active brand as `id`, `name`, `slug`, and `image`. Inactive, hidden, and removed brands are left out. The action stores that directory in State until a brand save flushes it |
| `littleFarmsBrand` / `littleFarmsBrands` | One brand, or one page of full brand records. `littleFarmsBrands` returns `page`, `pageSize`, `total`, `pageCount`, and `items`. It accepts `name`, `isActive`, `isNewBrand`, `isTopBrand`, `isFeatured`, `showInBrandListWidget`, and `showInBrandSliderWidget`. Omit a flag to skip that filter. Omit `isActive` to keep active brands only |
| `littleFarmsLocation` / `littleFarmsLocations` | **`littleFarmsLocations`** returns every **enabled** location’s **General Information** in one array (no pagination): id, title, store URL, address, contact, store views, description, sort order, logo/images, meta, featured flag. Cached in App Builder State until a location save or mass action. **`littleFarmsLocation`** loads one full record (all sections) by **locationId**, **title**, or **storeUrl** |
| `littleFarmsBlogPosts` | Paginated blog summaries (`page`, `pageSize`, optional category/tag/featured/recipe/customer-group filters) |
| `littleFarmsBlogPostsByCategory` | Paginated posts for one category (`categoryId` or `categoryUrlKey`) |
| `littleFarmsBlogPost` | Full post by `postId` or `urlKey` |
| `littleFarmsBlogCategories` | Enabled categories with image and sort order |
| `littleFarmsMostReadBlogPosts` | Top posts by view count (`limit`, optional filters) |
| `littleFarmsRecordBlogVisit` | **Mutation**: increment view count (`postId` or `urlKey`). Requires mesh config stub `lfMeshStubMutation` (see `meshConfig.json`). |

See [`schema.graphql`](./schema.graphql) and [`meshConfig.json`](./meshConfig.json) (JsonSchema stub source + programmatic resolvers; no Commerce).

### Examples

**One block (by id or title):**

```graphql
query {
  littleFarmsBlock(
    blockId: 3
    filter: [
      { attribute: "categoryPath", eq: "meat" }
      { attribute: "price", range: { from: 0, to: 50 } }
    ]
  ) {
    id
    blockId
    name
    featuredRecommended {
      productSkus
      productsToDisplay
      productsStatus
      products { sku name urlKey inStock addToCartAllowed images { url roles } price { final { value currency } } }
    }
  }
}
```

`filter` is optional. Each clause needs `attribute` and one of `eq`, `in`, `startsWith`, `contains`, or `range`. The mesh always adds `{ attribute: "sku", in: <block SKUs> }` after those clauses. A `sku` clause from the client is rejected. `startsWith` and `contains` must be 2–10 characters. At most 8 clauses. Omit `filter` to load the block products as before. The attribute must be filterable in Live Search.

**List presets:**

```graphql
{
  littleFarmsBlocks {
    id
    name
    blockType
    enabled
  }
}
```

**Active brands, then a filtered page:**

```graphql
{
  littleFarmsBrandsList { id name slug image }
  littleFarmsBrands(name: "farm", isFeatured: true, showInBrandListWidget: true, page: 1, pageSize: 50) {
    page
    pageSize
    total
    pageCount
    items {
      id
      name
      isActive
      isNewBrand
      isTopBrand
      isFeatured
    }
  }
}
```

**Store locator directory (General Information, all enabled):**

```graphql
{
  littleFarmsLocations {
    id
    locationId
    title
    storeUrl
    street
    state
    city
    zip
    country
    phone
    email
    websiteUrl
    sortOrder
    isFeatured
  }
}
```

**Single location detail (full record):**

```graphql
{
  littleFarmsLocation(locationId: 1) {
    title
    latitude
    longitude
    storeContent
    storeHours { monday { open from to } }
  }
}
```

## Response cache

`meshConfig.responseConfig.cache` is `true`, and the mesh response sets:

`Cache-Control: public, max-age=60, stale-while-revalidate=60, stale-if-error=300`

([Caching](https://developer.adobe.com/graphql-mesh-gateway/mesh/advanced/caching/), [cache-control headers](https://developer.adobe.com/graphql-mesh-gateway/mesh/advanced/caching/cache-control-headers/)).

| Directive | Value | Role |
|-----------|-------|------|
| `max-age` | **60** | Fresh cache for 1 minute (was 300). Shorter fresh window so Mesh revalidates sooner while App Builder State still holds block/SKU data. |
| `stale-while-revalidate` | **60** | After `max-age`, Mesh may return stale GraphQL for up to 1 minute while revalidating (confirm behavior in stage with `Cache-Status` / timing). |
| `stale-if-error` | **300** | On upstream/resolver errors, serve stale cache for up to 5 minutes when available. |

If homepage still feels slow right after the fresh minute expires, raise `stale-while-revalidate` (for example `300`) before raising `max-age` again.

The cache key is the whole GraphQL request, so a different `blockId` or different arguments is a different entry. There is no per-query or per-id setting.

A brand or block save does not clear one mesh entry. `aio api-mesh:cache:purge -a` clears every cached response for this mesh. After a mesh update that changes cached data, purge before measuring again.

Check the HTTP headers `Cache-Status` (`HIT` or `MISS`) and `Age`. The first call with no cached entry still runs the full resolver (App Builder + `productSearch`).

After deploy: `aio api-mesh update meshConfig.json -s secrets.yaml` then purge cache if you need a clean baseline.

## CORS (browser / EDS)

Configured in `meshConfig.json` → `responseConfig.CORS` per [Adobe API Mesh CORS](https://developer.adobe.com/graphql-mesh-gateway/mesh/advanced/cors/). List every storefront origin explicitly (do not use `*`). Clients must send an `Origin` header matching an allowed origin. Add your Franklin / preview hosts to the `origin` array, then `aio api-mesh update meshConfig.json -s secrets.yaml`.

## Setup

1. Deploy App Builder: `aio app deploy` (from repo root).
2. Copy action URLs into mesh env:

```bash
cd api-mesh
cp sample.env .env
# edit .env — no COMMERCE_ENDPOINT required
```

3. Create or update the mesh from **`api-mesh/`** ([Create a mesh](https://developer.adobe.com/graphql-mesh-gateway/mesh/basic/create-mesh/)). Resolvers use `context.secrets`, not `process.env` — pass **`secrets.yaml`**:

```bash
cd api-mesh
aio api-mesh create meshConfig.json -e .env -s secrets.yaml
# or
aio api-mesh update meshConfig.json -e .env -s secrets.yaml
aio api-mesh status
aio api-mesh describe
```

**Import errors:** run commands from `api-mesh/`; keep paths like `./schema.graphql` and `./resolvers.js` in the same folder; do not use a `.graphql` file as a graphql `endpoint`. The CLI minifies imported files with `jsmin` — **do not use GraphQL block strings (`"""…"""`)** in `schema.graphql` or import fails with *Unable to import the files in the mesh config*.

**Mutations:** The JsonSchema stub defines both `lfMeshStub` (Query) and `lfMeshStubMutation` (Mutation) so the merged schema registers a **Mutation** root. Custom fields such as `littleFarmsRecordBlogVisit` use `extend type Mutation` and programmatic resolvers; do not remove the mutation stub or the edge returns *Schema is not configured to execute mutation operation*.

### Troubleshooting: `The secret LITTLEFARMS_BLOCK_STOREFRONT_URL is not available`

Per [Secrets management](https://developer.adobe.com/graphql-mesh-gateway/mesh/advanced/secrets/), secrets must be:

1. **Defined** in `secrets.yaml` (literal quoted values — do not rely on `$VAR` unless your shell exports them before the CLI runs).
2. **Uploaded** on every create/update: `-s secrets.yaml` (omitting `-s` on update **clears** stored secrets).
3. **Referenced** in `meshConfig.json` (this repo references them in `Stub` → `operationHeaders` so the runtime registers them for `context.secrets` in resolvers).

**Fix:**

```bash
cd api-mesh
# Edit secrets.yaml — paste real URLs + EVALUATE_SHARED_SECRET (quoted strings)
aio api-mesh update meshConfig.json -s secrets.yaml
aio api-mesh status   # wait until active
```

**Verify registration** (values are redacted; you should see placeholders, not missing keys):

```bash
aio api-mesh get --active | grep -E 'LITTLEFARMS|EVALUATE|context.secrets'
```

You should see `{context.secrets.LITTLEFARMS_BLOCK_STOREFRONT_URL}` in the published config under `operationHeaders`. If you see a bare `$LITTLEFARMS_...` string, secrets were not applied — edit `secrets.yaml` with literals and update again with `-s`.

## REST backing (unchanged)

Mesh resolvers POST JSON to:

- `block-storefront` — `{"operation":"get","blockId":3,"resolveConditions":true}` / `{"operation":"list"}`

See [`../docs/storefront-contract.md`](../docs/storefront-contract.md).

## Block type ids

| Admin / context | `blockType` |
|-----------------|-------------|
| Featured/Recommended preset | `littlefarms_featured_recommended` |
| Brands List preset | `littlefarms_brands_list` |
| PDP placement (evaluate) | `littlefarms_placement` |

## Adding product details

`littleFarmsBlock` loads that block’s SKUs from App Builder, then the mesh calls Commerce Live Search [`productSearch`](https://developer.adobe.com/commerce/webapi/graphql/schema/live-search/queries/product-search) with `phrase: ""` and `filter: [{ attribute: "sku", in: [...] }]`. `littleFarmsBlocks` returns the block list only and does not call `productSearch`. `littleFarmsBlock` also accepts `filter`. Those clauses are sent first, and the SKU clause is always appended. The SKU attribute, and any attribute in `filter`, must be filterable in search. Results are returned in the block’s SKU order as `products`. `productsStatus` is `ok`, `empty`, `error`, or `commerce_unconfigured`.

Paste the same Commerce GraphQL endpoint the admin app uses into `secrets.yaml` before the next mesh update:

```yaml
COMMERCE_CORE_GRAPHQL_URL: "https://na1-sandbox.api.commerce.adobe.com/<environment-id>/graphql"
MAGENTO_ENVIRONMENT_ID: "<environment-id>"
MAGENTO_STORE_VIEW_CODE: "default"
MAGENTO_STORE_CODE: ""
MAGENTO_WEBSITE_CODE: ""
MAGENTO_API_KEY: ""
```

On ACCS, leave `MAGENTO_API_KEY` empty. The mesh sends `x-api-key: not_used` for `api.commerce.adobe.com`.

## Adding the full Commerce schema later

To expose Commerce queries such as `productSearch` directly on this endpoint, add a `Commerce` graphql source with that same URL and keep `extend type Query` in `schema.graphql`. Block product details do not require that source.
