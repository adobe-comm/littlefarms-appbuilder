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
| **Requirements doc version** | 1.9 |
| **Status** | in-development |
| **Last Updated** | 2026-10-05 |
| **Product Manager** | Product Manager Agent |
| **Stakeholders** | Little Farms merchandising, storefront / EDS engineering |

---

## Executive Summary

### Business Objective

**Little Farms Admin** is a single Commerce Admin app (under **Apps**) for **multiple Little Farms capabilities over time**—one App Builder project, shared IMS/config patterns, and an Admin UI shell that can add modules without spinning up new apps.

**Currently implemented (v1):** the **Blocks** module—typed content and merchandising blocks (featured/recommended product carousels, brand lists, PDP placement rules). Storefront and EDS consume **Blocks** output through **API Mesh GraphQL** (`littleFarmsBlock` / `littleFarmsBlocks`); external docs may describe this surface as *product recommendation*, but that is **one feature area**, not the whole app.

**Next module (in requirements):** **Brands** — brand records, a merchant-selected product dropdown attribute (no preset attribute code), Admin brand management, and storefront brand pages (PLP, PDP, widgets). It registers on the same Admin shell (`AppShell` module rail) with its own actions, database, file, and state storage, plus an API Mesh contract.

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
| **Brands** | **Phase 3 Option A** | AppShell rail → Brand Management | API Mesh GraphQL (by id, name, or URL alias) |

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

### FR-9: Brands module

See **Brands module** below. **Brands Phase 1: Complete ✅** (2026-10-05). **Brands Phase 2: Approved ✅** (2026-10-05). **Phase 3: Implementation Approach Selected: Option A.**

---

## Brands module

**Status:** **Brands Phase 1: Complete ✅** (2026-10-05). **Brands Phase 2: Approved ✅** (2026-10-05). **Phase 3: Implementation Approach Selected: Option A.** Plan: `IMPLEMENTATION_PLAN.md`. Code generation waits for discovery sign-off.

**Domain:** Admin UI SDK module inside **Little Farms Admin**, plus a storefront GraphQL read API. Checkout webhooks are out of scope for this module.

**Platform:** SaaS (ACCS), same app as Blocks. IMS is mandatory. Brand writes use `include-ims-credentials: true` because they use App Builder Database.

**Reference UI:** PaaS Brand Management grid and edit form (Amasty-style). The SaaS app reproduces that management flow. It omits Top CMS Block, Bottom CMS Block, and Display Additional Brand Information (the last one is an Amasty subscription add-on on the reference form).

### What this module does

1. **Brand attribute.** A Commerce product dropdown is the brand attribute. It is created in Commerce Admin (**Stores → Attributes → Product**). This app does not create EAV attributes. There is **no default attribute code**. Names such as `if_brand` or `lf_brand` are examples only. Until a merchant picks a dropdown in Brand settings, no attribute is active.
2. **Attribute picker.** Admin loads product attributes with Commerce GraphQL `attributesList(entityType: CATALOG_PRODUCT)`, keeps dropdowns (`frontend_input` select / `SELECT`), and saves the chosen code. Changing it asks for confirmation, then **hides** brands for the previous code. Those documents stay in the database. Selecting that code again shows the saved brands for edit.
3. **Brand rows.** One database row per dropdown option of the **active** attribute. Merchants manage details; they do not type a separate brand id. Option **label** is the brand name (example: option “Adelaide Hills” is the storefront name). Option **value** is the stable id.
4. **Brand management.** Grid and edit form follow the reference screens. Images go to File storage; the database stores the public URL and alt text.
5. **Storefront.** API Mesh GraphQL returns brand details by **id** (option value), **name** (option label), or **URL alias**. The storefront chooses fields. Product grids stay on Commerce `productSearch`, filtered by the active attribute code and the brand option value.

### Decisions

| Topic | Decision |
|-------|----------|
| Attribute code | No preset. Merchant selects a dropdown. `if_brand` and `lf_brand` are examples only. |
| Brand rows | Sync from the active attribute’s dropdown options. New options become editable brands. Removed options are hidden, not deleted. |
| Attribute change | Confirm, then hide the previous attribute’s brands. Switching back shows the old data. |
| Brand name | Commerce option label, on the grid title and on the storefront. |
| Lookup | GraphQL by id, name, or `url_alias`. Frontend selects the fields it needs (PDP, PLP, widgets). |
| URL alias | Unique per store view. Generated from the option label. A colliding slug gets a numeric postfix (`adelaide-hills-2`). Merchant can edit it; save keeps it unique. |
| Widgets | `show_in_brand_list_widget`, `show_in_brand_slider_widget`, and `slider_position` are brand fields returned by GraphQL. They do not write the Blocks **Brands List** editor. |
| CMS / extra PaaS fields | **Removed:** `top_cms_block_id`, `bottom_cms_block_id`, `display_additional_brand_information`. |
| Scope | Store view, matching the PaaS module. Default scope is **All Store Views** (default store view values). Grid shows website, store, and store view. Edit fields are store-view scoped, with **Use Default Value** where the reference form has it (Meta Title, Page Title). |
| Tests | Recommendations only. No generated test suite unless requested later. |

### Documentation sources

| Topic | Source |
|-------|--------|
| Database (brand records, selected attribute code) | [App Builder Database Storage](https://developer.adobe.com/app-builder/docs/guides/app_builder_guides/storage/database) — document DB via `aio-lib-db`; workspace database already provisioned (`region` from `$DB_REGION`) |
| Cache | [Application State](https://developer.adobe.com/app-builder/docs/guides/app_builder_guides/storage/application-state) — key-value, TTL; max value 1MB; default TTL 1 day |
| Images | [aio-lib-files](https://github.com/adobe/aio-lib-files) — write under `public/` and store the public `url` from `getProperties` |
| Dropdown attribute list | [attributesList](https://developer.adobe.com/commerce/webapi/graphql/schema/attributes/queries/attributes-list) — `entityType: CATALOG_PRODUCT`, `frontend_input`, `options { value label }` |
| Product filter for brand PLP | [productSearch](https://developer.adobe.com/commerce/webapi/graphql/schema/live-search/queries/product-search) — filter by attribute; attribute must be **filterable in search** or the query fails |

Existing Blocks code already calls `attributesList` in `actions/block/lib/attribute-catalog.js`. Brand attribute discovery should follow that Commerce GraphQL path.

### Admin surfaces

Register the module on the AppShell rail in `src/commerce-backend-ui-2/web-src/src/modules/registry.ts` (id `brands-management`, label **Brands**).

| Screen | Behavior |
|--------|----------|
| **Brand settings** | Dropdown product attributes. Saved code is the active brand attribute. A different code requires confirmation, then hides the previous set. |
| **Brand management** | Grid of brands for the active attribute and selected store view. Columns from the reference screen: **Title**, **Store View** (website / store / store view), **Brand Attribute**, **Slider image**, **Show in Slider**, **Position in Slider**, **URL alias**, **Description**, **Action** (Edit). Filters, column chooser, pagination. |
| **Edit brand** | Page title is the option label. Scope switcher defaults to **All Store Views**. Actions: Back, Reset, Save, Save and Continue Edit. |

### Edit form

| Section | Fields |
|---------|--------|
| General Options | Is Active (default Yes), Is New Brand (default No), Is Top Brand (default No). Each is store-view scoped. |
| Brand Options | Is Featured (default No; help text: non-featured brands can be placed under a “show more” treatment on the storefront), Show in Brand List Widget (default Yes), Show in Brand Slider Widget (default No), Position in Slider (default 0). |
| SEO | URL alias. |
| Meta Data | Meta Title (defaults to the brand name, **Use Default Value** checked), Meta Description, Meta Keywords. |
| Page Content | Page Title (defaults to the brand name, **Use Default Value** checked), Description (rich text, Show / Hide Editor), Short Description, Image (file), Image Alt. |
| Other | Small Image (file; slider, product page, swatch), Small Image Alt. |

### Brand attribute settings (database)

One settings document per environment. Store-view brand values hang off the brand documents.

| Field | Type | Notes |
|-------|------|--------|
| `brandAttributeCode` | string | Empty until a merchant selects a dropdown. No default code |
| `updatedAt` | string | ISO timestamp |

### Brand document fields

Collection: **`littlefarms_brands`**. Identity: `attributeCode` + `optionValue` + store view. `hidden` is true when this `attributeCode` is not the active one.

| Section | Field label | Field name | Data type | Input | Default | Required | Notes |
|---------|-------------|------------|-----------|-------|---------|----------|-------|
| Identity | Title / name | `optionLabel` | String | Read-only | option label | Yes | Storefront brand name |
| Identity | Option id | `optionValue` | String | Read-only | option value | Yes | GraphQL id |
| Identity | Brand attribute | `attributeCode` | String | Read-only | selected code | Yes | Whatever dropdown is active. Not a fixed code |
| Identity | Hidden | `hidden` | Boolean | — | `false` | Yes | Set when another attribute is active |
| General Options | Is Active | `is_active` | Boolean | Yes/No | `true` | Yes | Inactive brands stay out of storefront queries |
| General Options | Is New Brand | `is_new_brand` | Boolean | Yes/No | `false` | No | |
| General Options | Is Top Brand | `is_top_brand` | Boolean | Yes/No | `false` | No | |
| Brand Options | Is Featured | `is_featured` | Boolean | Yes/No | `false` | No | |
| Brand Options | Show in Brand List Widget | `show_in_brand_list_widget` | Boolean | Yes/No | `true` | No | |
| Brand Options | Show in Brand Slider Widget | `show_in_brand_slider_widget` | Boolean | Yes/No | `false` | No | Grid column “Show in Slider” |
| Brand Options | Position in Slider | `slider_position` | Integer | Number | `0` | No | |
| SEO | URL Alias | `url_alias` | String | Text | slug of label | No | Unique per store view; postfix on collision |
| Meta Data | Meta Title | `meta_title` | String | Text | brand name | No | Use Default Value |
| Meta Data | Meta Description | `meta_description` | Text | Textarea | — | No | |
| Meta Data | Meta Keywords | `meta_keywords` | Text | Textarea | — | No | |
| Page Content | Page Title | `page_title` | String | Text | brand name | No | Use Default Value |
| Page Content | Description | `description` | HTML string | Rich text | — | No | |
| Page Content | Short Description | `short_description` | Text | Textarea | — | No | |
| Page Content | Image | `image` | String (URL) | File upload | — | No | Public file URL |
| Page Content | Image Alt | `image_alt` | String | Text | — | No | Brand page image |
| Other | Small Image | `small_image` | String (URL) | File upload | — | No | Slider image column, PDP, swatch |
| Other | Small Image Alt | `small_image_alt` | String | Text | — | No | |

Store-view overrides: a default-scope document holds All Store Views values. A store-view document stores only overridden fields. **Use Default Value** clears the override for Meta Title and Page Title (and the same pattern for any other field the edit form marks that way).

### Storage

| Data | Service | Notes |
|------|---------|--------|
| Brand documents, selected attribute code, store-view overrides | **Database** (`aio-lib-db`) | Source of truth. Same workspace database as Blocks |
| Storefront brand payloads (by id, name, alias, list, slider) | **State** (`aio-lib-state`) | Cache only. Invalidate on brand save and on attribute-code change |
| Brand image and small image binaries | **Files** (`aio-lib-files`) | `public/brands/...`; persist the public URL on the document |

### Storefront GraphQL

| Query need | Behavior |
|------------|----------|
| By id | `optionValue` of the active attribute |
| By name | `optionLabel` (example: Adelaide Hills) |
| By URL alias | Unique `url_alias` for the brand PLP |
| Field selection | Client requests page content, SEO, images, flags (`is_active`, `is_new_brand`, `is_top_brand`, `is_featured`, list/slider flags, `slider_position`) |
| Products on the brand PLP | Commerce `productSearch` filter on the active attribute and this option value. Attribute must be filterable in search |
| Widgets | Same brand type, filtered with the list or slider flag. Slider ordered by `slider_position` |

Inactive or hidden brands are omitted from storefront queries. This app does not copy the product catalog into its database.

### Testing

Recommendations only during implementation (manual Admin checks: sync options, edit, hide on attribute change, restore on switch-back, unique alias, GraphQL lookup by id, name, and alias). Generate unit tests only if requested later.

### Phase 2 (approved)

Full design: **`ARCHITECTURE.md` → Brands module**. Approved 2026-10-05.

**Phase 3: Implementation Approach Selected: Option A.** Task list: `IMPLEMENTATION_PLAN.md`.

| Item | Architecture choice |
|------|---------------------|
| Commerce webhook | None. Existing Apps menu plus API Mesh reads |
| Admin entry | AppShell module `brands-management`. V2 allows one Commerce menu item per app |
| Actions | `brand-settings`, `brand-list`, `brand-write`, `brand-asset`, `brand-storefront` |
| Database | `littlefarms_brand_settings`, `littlefarms_brands` |
| Cache | State, 600 seconds, slim widget payloads and single-brand keys |
| Images | Files under `public/brands/...` |
| Attribute code | Empty until a merchant selects a dropdown |

**Brands Phase 2: Approved ✅** (2026-10-05). **Phase 3: Implementation Approach Selected: Option A.**

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
| Block scope | Environment via `app-scope.js` (store view `*`; catalog calls use store view `default`) |
| Brand scope | Store view, default **All Store Views**, with per-store-view overrides |
| Brand identity | `attributeCode` + `optionValue`; name is the option label |
| Brand collection | **`littlefarms_brands`** |
| Brand attribute code | Merchant-selected dropdown. No default (`if_brand` was an example only) |
| Brand attribute change | Hide previous brands; restore when that attribute is selected again |
| Concepts | `docs/blocks-concepts.md` |

---

## Acceptance Criteria (Master Checklist)

**Little Farms Admin (platform)**

- [x] Single app at repo root
- [x] Apps menu + **Little Farms Admin** shell (extensible module rail)
- [ ] Second admin module shipped (Brands — Phase 1 complete, not built)

**Blocks module (v1)**

- [x] Featured/Recommended and Brands List types in Admin
- [x] **`littlefarms_blocks`** + **`blockId`** persistence
- [x] Stage data migrated from **`condition_presets`**
- [x] **`block-storefront`** + **`productSkus`** + State cache + admin cache flush
- [x] API Mesh GraphQL documented (`api-mesh/`, `docs/storefront-contract.md`)
- [ ] Production mesh URL and CORS origins for live EDS domains
- [ ] Production deploy + App Management upgrade (metadata 1.0.2) verified
- [ ] Optional: drop legacy **`condition_presets`** collection after production smoke test

**Brands module (Phase 1 complete, not built)**

- [ ] Dropdown attribute picker; change hides the previous set and restores it when selected again
- [ ] One brand per option; name is the option label
- [ ] Grid and edit form match the reference screens, without CMS block or additional-info fields
- [ ] Store-view scope with All Store Views defaults
- [ ] Unique `url_alias` with postfix on collision
- [ ] GraphQL by id, name, and URL alias
- [ ] Images in File storage; records in Database; storefront cache in State

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
| 1.4 | 2026-10-05 | Agent | Brands module Phase 1 draft: Admin brand management, configurable dropdown attribute, field model, storage split. Open questions still block Phase 2 |
| 1.5 | 2026-10-05 | Agent | Brands Phase 1 complete: option-synced rows, hide-on-attribute-change, store-view scope, GraphQL by id/name/alias, CMS fields removed |
| 1.6 | 2026-10-05 | Agent | Brand attribute has no default code. `if_brand` is an example only |
| 1.7 | 2026-10-05 | Agent | Brands Phase 2 draft in `ARCHITECTURE.md`. No checkout webhook |
| 1.8 | 2026-10-05 | Agent | Brands Phase 2 architecture approved |
| 1.9 | 2026-10-05 | Agent | Phase 3 Option A. Implementation plan and starter-kit discovery recorded |
