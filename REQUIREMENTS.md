# Extension Requirements: Little Farms Admin

<!--
  Schema: .cursor/references/requirements.schema.json
  Canonical code: repository root (App Builder + Admin UI SDK V2).
-->

## Document Control

| Field | Value |
|-------|-------|
| **Extension Name** | Little Farms Admin |
| **App metadata id** | `littlefarms-blocks` |
| **App metadata version** | 1.0.2 |
| **Requirements doc version** | 1.3 |
| **Status** | in-development |
| **Last Updated** | 2026-10-05 |
| **Product Manager** | Product Manager Agent |
| **Stakeholders** | Little Farms merchandising, storefront / EDS engineering |

---

## Executive Summary

### Business Objective

**Little Farms Admin** is a single Commerce Admin app (under **Apps**) for **multiple Little Farms capabilities over time**—one App Builder project, shared IMS/config patterns, and an Admin UI shell that can add modules without spinning up new apps.

**Currently implemented (v1):** the **Blocks** module—typed content and merchandising blocks (featured/recommended product carousels, brand lists, PDP placement rules). Storefront and EDS consume **Blocks** output through **API Mesh GraphQL** (`littleFarmsBlock` / `littleFarmsBlocks`); external docs may describe this surface as *product recommendation*, but that is **one feature area**, not the whole app.

**Future:** additional modules (e.g. brands tooling, other merchandising) register in the same Admin shell (`AppShell` module rail) with their own actions, storage, and optional mesh/REST contracts.

The app delivers shared runtime infrastructure (condition engine where needed, Admin SPA, App Builder actions, database persistence, Commerce catalog integration, caching).

### Priority

**Level**: high

### Success Criteria

**Platform (Little Farms Admin)**

1. Merchants open **Apps → Little Farms Admin**; the shell supports **more than one feature module** over time (Blocks shipped first).
2. App Management metadata and business config (e.g. `COMMERCE_CORE_GRAPHQL_URL`) apply across modules.

**Blocks module (v1)**

3. Merchants manage blocks with a visible numeric **Block ID**.
4. Merchants create/edit **Featured/Recommended** and **Brands List** block types.
5. Saved blocks persist in **`littlefarms_blocks`** (scoped by Commerce environment + store view); **Fetch SKUs** works in Admin.
6. Storefront uses **API Mesh GraphQL** for blocks; featured blocks return **`productSkus`** (State cache, default 10 minutes).
7. Optional PDP: **`littleFarmsBlocks(sku, storeViewCode)`** for placements via **`block-evaluate`** (secret in mesh only).
8. New **block types** can be registered without a new App Builder app.

---

## Technical Context

| Aspect | Value |
|--------|-------|
| **Platform** | SaaS (ACCS) |
| **Application Type** | Admin UI SDK V2 SPA + App Builder runtime actions |
| **Pattern** | App Management `commerce/extensibility/1` + `commerce/backend-ui/2` |
| **Menu** | **Apps** section (no `parentMenu: content`); label **Little Farms Admin**, `aclProtected: true` |
| **Runtime package** | `littlefarms-appbuilder` |

### Feature modules (roadmap)

| Module | Status | Admin entry | Storefront |
|--------|--------|-------------|------------|
| **Blocks** (content + recommendation carousels, brands list, PDP rules) | **Shipped (v1)** | MainPage / block list & editor | API Mesh GraphQL + `block-storefront` / `block-evaluate` |
| *Additional modules* | Planned | Future items on AppShell rail | TBD per feature |

### Constraints

- IMS mandatory on SaaS; DB-backed actions use `include-ims-credentials: true`.
- Out-of-process only (App Builder + Admin UI SDK).
- Preset scope from App Management / `MAGENTO_ENVIRONMENT_ID` and store view (`app-scope.js`).
- Catalog conditions require attributes on Commerce / Catalog Service product views.
- Storefront browsers must use **API Mesh** for Blocks (CORS); do not expose App Builder URLs or evaluate secret to the client.

### Blocks module — storefront integration

External storefront documentation may title this *Product recommendation*; technically it is the **Blocks** GraphQL API on API Mesh.

| Channel | Mechanism |
|---------|-----------|
| **GraphQL (primary)** | Adobe API Mesh — `littleFarmsBlock`, `littleFarmsBlocks` (`api-mesh/schema.graphql`, `docs/storefront-contract.md`) |
| **Stage mesh example** | `https://edge-sandbox-graph.adobe.io/api/d905d6da-cf4c-4979-a302-3b156dce3ae4/graphql` (POST JSON `{ "query", "variables" }`) |
| **REST backing** | Mesh resolvers → `block-storefront` (presets, public), `block-evaluate` (PDP, shared secret in mesh `secrets.yaml`) |

Full product data remains on **Commerce GraphQL**; block responses supply SKUs and placement metadata.

### Documentation Sources

- [Admin UI SDK V2 menu](https://developer.adobe.com/commerce/extensibility/admin-ui-sdk/extension-points/v2/menu)
- [App Management Admin UI config](https://developer.adobe.com/commerce/extensibility/app-management/installation/admin-ui-sdk)
- [API Mesh](https://developer.adobe.com/graphql-mesh-gateway/mesh/basic/create-mesh/)
- `ARCHITECTURE.md`, `docs/codebase-map.md`, `docs/blocks-concepts.md`, `docs/storefront-contract.md`, `api-mesh/README.md`

---

## Extension Context (Admin UI)

| Aspect | Value |
|--------|-------|
| **Domain** | Admin UI — multi-feature Little Farms tooling (Blocks v1) |
| **Checkout webhooks** | N/A (not Checkout Starter Kit) |

---

## Blocks module — block type registry

| Type ID | Display name | Purpose | Storefront payload |
|---------|--------------|---------|-------------------|
| `littlefarms_featured_recommended` | Featured/Recommended Products | `productsToDisplay` (1–50), condition `logic` | `featuredRecommended` incl. **`productSkus`**, **`productSkusStatus`** |
| `littlefarms_brands_list` | Brands List | Brand items (image, name, link), optional URL | `brandsList` |
| `littlefarms_placement` | (PDP rules only) | Not an Admin preset type; from **`conditional_blocks`** + evaluate | `placement` on mesh when querying with `sku` + `storeViewCode` |

Register Admin preset types in `src/.../block-types/index.ts` and `actions/block/lib/constants.js` (`BLOCK_TYPES`).

---

## Implementation Summary (repo root)

### Admin UI

- **AppShell** — module rail for **Little Farms Admin** (Blocks active; room for additional modules).
- **MainPage (Blocks)** — block list (Block ID column), create/edit by type, **Flush storefront cache** for preset SKU cache.
- **Actions (SPA, Blocks):** `block-condition-list`, `block-condition-write`, `block-condition-remove`, `block-metadata`, `block-cache-flush`.

### Runtime actions (Blocks + shared)

| Area | Paths / names |
|------|----------------|
| Condition presets (CRUD) | `actions/block/admin/condition-*` |
| Metadata / preview | `actions/block/admin/metadata/` |
| Preset SKU cache flush | `actions/block/admin/cache-flush/` → `block-cache-flush` |
| Storefront presets | `actions/block/storefront/blocks/` → `block-storefront` |
| PDP rules | `actions/block/admin/list|write|remove/`, `actions/block/storefront/evaluate/` → `block-evaluate` |
| Shared libs | `actions/block/lib/*` (`preset-store.js`, `enrich-storefront-blocks.js`, `resolve-preset-skus.js`, …) |

### Storage (Blocks module)

| Data | Storage | Notes |
|------|---------|--------|
| Saved blocks (presets) | App Builder Database **`littlefarms_blocks`** | Business key **`blockId`** (int); document **`id`** = `"<blockId>"`; optional **`legacyUuid`** |
| Merchandising rules (PDP) | App Builder Database **`conditional_blocks`** | Unchanged |
| Preset SKU results | App Builder State | Keyed by block id; TTL **`PRESET_RESULT_CACHE_TTL`** (default 600s) |
| Evaluate cache | App Builder State | TTL 300s |

**Data migration:** Legacy **`condition_presets`** migrated to **`littlefarms_blocks`** on Stage (2026-10-01). One-time migration scripts removed from repo after cutover.

### API Mesh (Blocks storefront)

- Config: `api-mesh/meshConfig.json`, `api-mesh/schema.graphql`, `api-mesh/resolvers.js`, `api-mesh/secrets.yaml`.
- Deploy: `aio api-mesh update meshConfig.json -s secrets.yaml` from `api-mesh/`.
- GraphQL schema must avoid block-string descriptions in imported `.graphql` files (CLI `jsmin` limitation).

Future Little Farms features may extend this mesh or add separate endpoints; v1 mesh is **blocks-only** (no Commerce catalog in schema).

### Config

- `app.commerce.config.ts` — app display name **Little Farms Admin**, menu, business config (`COMMERCE_CORE_GRAPHQL_URL`)
- `src/commerce-backend-ui-2/ext.config.yaml` — actions, DB auto-provision, IMS annotation
- `env.dist` — GraphQL, IMS, DB/State, evaluate secret

---

## Functional Requirements

### FR-1: Little Farms Admin shell

Register Admin UI SDK V2 under **Apps** as **Little Farms Admin** with ACL protection. Shell must allow **additional feature modules** without a new App Builder application.

### FR-2: Blocks — Featured/Recommended

Product count (1–50), ALL/ANY conditions (nested groups), **Fetch SKUs** preview via Commerce GraphQL.

### FR-3: Blocks — Brands List

Configurable brand items and optional view-all URL; validated max items per `constants.js`.

### FR-4: Blocks — persist and list

CRUD via condition actions; monotonic **`blockId`** per scope on create; **`id`** as string block id; **Block ID** column in Admin grid.

### FR-5: Blocks — storefront presets

- **`block-storefront`**: public list/get by **`blockId`**, numeric **`id`**, **title**, or legacy UUID.
- Condition resolution: **`productSkus`**, **`productSkusStatus`** (`ok`, `empty`, `error`, `commerce_unconfigured`).
- Invalidate SKU cache on preset save/delete and via **`block-cache-flush`**.

### FR-6: Blocks — PDP placement (optional)

**`block-evaluate`** with **`x-conditional-block-secret`**; storefront access via mesh **`littleFarmsBlocks(sku, storeViewCode)`** only.

### FR-7: Blocks — API Mesh GraphQL

**`littleFarmsBlock`** and **`littleFarmsBlocks`** per `api-mesh/schema.graphql`; CORS for approved storefront origins.

### FR-8: Blocks — extensible types

Type registry drives admin forms; v1 ships Featured/Recommended and Brands List; placement uses evaluate/rules path.

### FR-9: Future modules (placeholder)

New Little Farms features add Admin navigation entries, actions, and contracts under the same app; requirements for each module documented in this file or linked addenda when scoped.

---

## Alignment decisions

| Item | Decision |
|------|----------|
| App name | **Little Farms Admin** (multi-feature container) |
| Code location | Repository root only |
| Menu | **Apps → Little Farms Admin** (not Content) |
| v1 shipped feature | **Blocks** module (includes recommendation carousels—not the entire app) |
| Storefront docs label | May say *product recommendation* for EDS; maps to **Blocks** GraphQL on API Mesh |
| Preset identity | **`blockId`** + string **`id`** |
| Preset collection | **`littlefarms_blocks`** |
| Block scope | Environment + store view via `app-scope.js` |
| Concepts | `docs/blocks-concepts.md` |

---

## Acceptance Criteria (Master Checklist)

**Little Farms Admin (platform)**

- [x] Single app at repo root
- [x] Apps menu + **Little Farms Admin** shell (extensible module rail)
- [ ] Second admin module shipped (future)

**Blocks module (v1)**

- [x] Featured/Recommended and Brands List types in Admin
- [x] **`littlefarms_blocks`** + **`blockId`** persistence
- [x] Stage data migrated from **`condition_presets`**
- [x] **`block-storefront`** + **`productSkus`** + State cache + admin cache flush
- [x] API Mesh GraphQL documented (`api-mesh/`, `docs/storefront-contract.md`)
- [ ] Production mesh URL and CORS origins for live EDS domains
- [ ] Production deploy + App Management upgrade (metadata 1.0.2) verified
- [ ] Optional: drop legacy **`condition_presets`** collection after production smoke test

- [x] Phase 1: Complete ✅

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-09-30 | Agent | Initial draft |
| 1.0 | 2026-09-30 | Agent | Merged implementation to repo root |
| 1.1 | 2026-10-01 | Agent | Removed `conditional-block/` copy; docs point to root only |
| 1.2 | 2026-10-05 | Agent | Apps menu, **`littlefarms_blocks`** / **`blockId`**, Brands List, API Mesh, cache flush, migration complete |
| 1.3 | 2026-10-05 | Agent | Reframe app as **Little Farms Admin** (multi-feature); **Blocks** as v1 module; *product recommendation* = storefront label for Blocks only |
