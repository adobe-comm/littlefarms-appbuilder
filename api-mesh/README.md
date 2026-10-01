# API Mesh for LittleFarms Blocks (EDS / headless)

This folder extends your **Adobe Commerce API Mesh** with GraphQL fields EDS can query alongside core Commerce data.

## Architecture

```text
EDS / Franklin
    → unified Mesh GraphQL endpoint
        → Commerce source (products, categories, …)
        → additionalResolvers (this repo)
            → block-storefront (saved presets: brands list, featured, …)
            → block-evaluate (PDP conditional rules)
```

Runtime actions live in this App Builder project. The mesh **never** exposes `EVALUATE_SHARED_SECRET` to the browser; only the mesh service calls App Builder with the header `x-conditional-block-secret`.

## GraphQL fields

| Field | Purpose |
|--------|---------|
| `littleFarmsBlock(id)` | One saved block by UUID (from Admin) |
| `littleFarmsBlocks(blockType)` | All enabled blocks; optional type filter |
| `littleFarmsConditionalBlocks(sku, storeViewCode)` | PDP rules for a product SKU |

See [`typeDefs.graphql`](./typeDefs.graphql) for the full schema.

### Example queries (EDS)

**Brands list block on homepage** (block id from Admin):

```graphql
query HomepageBrands($id: ID!) {
  littleFarmsBlock(id: $id) {
    name
    blockType
    brandsList {
      url
      items {
        image
        name
        link
      }
    }
  }
}
```

**All enabled brand blocks:**

```graphql
{
  littleFarmsBlocks(blockType: "littlefarms_brands_list") {
    id
    name
    brandsList {
      url
      items { name link image }
    }
  }
}
```

**PDP recommendations:**

```graphql
query PdpBlocks($sku: String!, $storeViewCode: String!) {
  littleFarmsConditionalBlocks(sku: $sku, storeViewCode: $storeViewCode) {
    title
    targetSkus
    contentHtml
  }
  products(filter: { sku: { eq: $sku } }) {
    items { sku name }
  }
}
```

For **Featured/Recommended** presets, use `littleFarmsBlock` to read `featuredRecommended.conditionsJson`, then resolve SKUs via Catalog Service / Commerce `products` in the same mesh query (product resolution is not duplicated in `block-storefront` v1).

## Setup

1. Deploy this app: `aio app deploy`
2. Copy action URLs from the deploy output into `sample.env`
3. Set `EVALUATE_SHARED_SECRET` in App Builder `.env` and the same value in the mesh env
4. Create or update a mesh using [`meshConfig.json`](./meshConfig.json), [`typeDefs.graphql`](./typeDefs.graphql), and [`resolvers.js`](./resolvers.js)

Follow [API Mesh documentation](https://developer.adobe.com/graphql-mesh-gateway/mesh/basic/create-mesh/) for your org (`aio api-mesh` CLI or Developer Console). Point the mesh workspace at this directory or upload the three artifacts.

5. Attach the mesh to your **EDS / Commerce** environment so Franklin can query the unified endpoint.

## REST fallback (without GraphQL wrapper)

Mesh resolvers call these JSON POST bodies:

**`block-storefront`**

```http
POST …/block-storefront
x-conditional-block-secret: <secret>
Content-Type: application/json

{"operation":"get","id":"<uuid>"}
{"operation":"list","blockType":"littlefarms_brands_list"}
```

**`block-evaluate`** — see [`../docs/storefront-contract.md`](../docs/storefront-contract.md).

## Block type ids

| Admin label | `blockType` |
|-------------|-------------|
| LittleFarms: Featured/Recommended Products | `littlefarms_featured_recommended` |
| LittleFarms: Brands List | `littlefarms_brands_list` |
