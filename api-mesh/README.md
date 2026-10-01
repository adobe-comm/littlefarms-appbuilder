# API Mesh — Little Farms Blocks (REST → GraphQL)

This mesh exposes **only** Little Farms block REST actions as GraphQL. It does **not** include Adobe Commerce catalog in the schema for now. EDS can call a dedicated mesh endpoint for `littleFarmsBlock` / `littleFarmsBlocks`; Commerce `products` queries stay on the Commerce GraphQL endpoint (or a separate mesh you add later).

## Architecture

```text
EDS / server
    → Little Farms API Mesh (this config)
        → resolvers.js
            → block-storefront (presets: list / get)
            → block-evaluate (PDP placements when sku + storeViewCode)
```

**Preset list/get** is public on `block-storefront` (no shared secret). **PDP placement** (`sku` + `storeViewCode`) still uses `block-evaluate` with a secret held in mesh secrets only.

Browser clients should use this mesh endpoint (with CORS); do not call App Builder action URLs from the shopper page.

## GraphQL API

| Field | Purpose |
|--------|---------|
| `littleFarmsBlock(blockId:)` / `id` / `title` | One preset by Admin **Block ID**, UUID, or title |
| `littleFarmsBlocks(blockType)` | Enabled presets; optional type filter. Featured blocks include **`productSkus`** (Commerce evaluation, cached 10 min in State) |
| `littleFarmsBlocks(sku, storeViewCode)` | PDP placement blocks (`blockType`: `littlefarms_placement`) |

See [`schema.graphql`](./schema.graphql) and [`meshConfig.json`](./meshConfig.json) (JsonSchema stub source + programmatic resolvers; no Commerce).

### Examples

**One block (by id or title):**

```graphql
query {
  littleFarmsBlock(blockId: 3) {
    id
    blockId
    name
    featuredRecommended { productSkus productsToDisplay }
  }
}
```

**List presets:**

```graphql
{
  littleFarmsBlocks(blockType: "littlefarms_brands_list") {
    id
    name
    brandsList { url items { name link image } }
  }
}
```

**List PDP placements:**

```graphql
query ($sku: String!, $storeViewCode: String!) {
  littleFarmsBlocks(sku: $sku, storeViewCode: $storeViewCode) {
    id
    blockType
    placement { title targetSkus contentHtml priority }
  }
}
```

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

- `block-storefront` — `{"operation":"get","id":"…"}` / `{"operation":"list","blockType":"…"}`
- `block-evaluate` — `{"sku":"…","storeViewCode":"…"}`

See [`../docs/storefront-contract.md`](../docs/storefront-contract.md).

## Block type ids

| Admin / context | `blockType` |
|-----------------|-------------|
| Featured/Recommended preset | `littlefarms_featured_recommended` |
| Brands List preset | `littlefarms_brands_list` |
| PDP placement (evaluate) | `littlefarms_placement` |

## Adding Commerce later

To unify Commerce + blocks in one endpoint, add a `Commerce` graphql source with `{{env.COMMERCE_ENDPOINT}}` and keep `extend type Query` in `schema.graphql`. Not required for blocks-only GraphQL.
