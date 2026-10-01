# Extension Requirements: LittleFarms Blocks Management

<!--
  Schema: .cursor/references/requirements.schema.json
  Canonical code: repository root (App Builder + Admin UI SDK V2).
-->

## Document Control

| Field | Value |
|-------|-------|
| **Extension Name** | LittleFarms Blocks Management |
| **Version** | 1.1 |
| **Status** | in-review |
| **Last Updated** | 2026-10-01 |
| **Product Manager** | Product Manager Agent |
| **Stakeholders** | Little Farms merchandising, storefront engineering |

---

## Executive Summary

### Business Objective

Merchants manage **typed content blocks** from Commerce Admin. The first type is **LittleFarms: Featured/Recommended Products**: **Number of Products to Display** plus a Magento-style **Conditions** builder (ALL / ANY, nested groups). Additional block types with different field maps will be added later without redesigning the admin shell.

The app implements the condition engine, admin SPA, runtime actions, persistence, and an optional storefront evaluate contract on **Adobe Commerce SaaS (ACCS)**.

### Priority

**Level**: high

### Success Criteria

1. Admin opens **Content → LittleFarms → Blocks Management**.
2. Merchants create/edit the Featured/Recommended type with product count + conditions.
3. Saved blocks persist globally (per Commerce environment); matching SKUs can be previewed in admin.
4. Optional: storefront PDP resolves blocks via `block-evaluate` (`docs/storefront-contract.md`).
5. New block types can be registered without a new App Builder app.

---

## Technical Context

| Aspect | Value |
|--------|-------|
| **Platform** | saas (ACCS) |
| **Application Type** | Admin UI SDK V2 SPA + App Builder runtime actions |
| **Pattern** | App Management `commerce/extensibility/1` + `commerce/backend-ui/2` |
| **Menu** | `parentMenu: content`, label **Blocks Management**, `aclProtected: true` |
| **Runtime package** | `littlefarms-appbuilder` |

### Constraints

- IMS mandatory on SaaS.
- Out-of-process only (App Builder + Admin UI SDK).
- Saved blocks use **global** scope (`storeViewCode: *` in DB); storefront evaluate still accepts per-request `storeViewCode`.
- Catalog conditions require attributes on Commerce / Catalog Service product views.

### Documentation Sources

- [Admin UI SDK V2 menu](https://developer.adobe.com/commerce/extensibility/admin-ui-sdk/extension-points/v2/menu)
- [App Management Admin UI config](https://developer.adobe.com/commerce/extensibility/app-management/installation/admin-ui-sdk)
- `ARCHITECTURE.md`, `docs/codebase-map.md`, `docs/blocks-concepts.md`

---

## Extension Context (Admin UI)

| Aspect | Value |
|--------|-------|
| **Domain** | Admin UI — Blocks / conditional merchandising |
| **Checkout webhooks** | N/A |

---

## Block Type Registry

| Type ID | Display name | Fields (v1) | UI / code |
|---------|--------------|-------------|-----------|
| `littlefarms_featured_recommended` | LittleFarms: Featured/Recommended Products | `productsToDisplay` (1–50), `logic` (aggregator, conditions) | `src/.../block-types/index.ts`, `pages/main-page.tsx` |

Register future types in `block-types/index.ts` and `actions/block/lib/constants.js` (`BLOCK_TYPES`).

---

## Implementation Summary (repo root)

### Admin UI

- **AppShell** — left module rail (logo, **Blocks Management**, future modules).
- **MainPage** — grid, type select (**Frontend Properties**), edit (**Frontend Properties** | **Block Options**).
- **Actions (SPA):** `block-condition-list`, `block-condition-write`, `block-condition-remove`, `block-metadata`.

### Runtime actions

| Area | Paths |
|------|--------|
| Condition presets | `actions/block/admin/condition-list|write|remove/` |
| Metadata / preview | `actions/block/admin/metadata/` |
| Storefront rules | `actions/block/admin/list|write|remove/`, `actions/block/storefront/evaluate/` |
| Shared libs | `actions/block/lib/*` (incl. `app-scope.js`, `preset-store.js`, `evaluate.js`) |

### Storage

| Data | Storage |
|------|---------|
| Saved blocks (presets) | App Builder Database (`condition_presets`, global scope) |
| Merchandising rules | App Builder Database (`conditional_blocks`) |
| Evaluate cache | App Builder State, TTL 300s |

### Config

- `app.commerce.config.ts` — menu, metadata id `littlefarms-blocks`
- `app.config.yaml` — extension includes
- `env.dist` — GraphQL, IMS, DB/State (no required `MAGENTO_STORE_VIEW_CODE`)

---

## Functional Requirements (consolidated)

### FR-1: Blocks Management menu

Register Admin UI SDK V2 menu under **Content** with label **Blocks Management** and ACL.

### FR-2: Type — Featured/Recommended Products

Product count (1–50) and conditions builder with **Fetch SKUs** preview.

### FR-3: Persist and list saved blocks

CRUD via condition actions; numeric **Block ID** (`sequence`) on save.

### FR-4: Storefront evaluation (optional)

`block-evaluate` + `docs/storefront-contract.md` when PDP integration is enabled.

### FR-5: Extensible types

Type registry drives admin forms; v1 ships one type.

---

## Alignment decisions

| Item | Decision |
|------|----------|
| Code location | Repository root only |
| Menu | **Content → Blocks Management** |
| Type label | **LittleFarms: Featured/Recommended Products** |
| Block scope | Global per environment (`app-scope.js`) |
| Concepts | `docs/blocks-concepts.md` |

---

## Acceptance Criteria (Master Checklist)

- [x] Single app at repo root (reference folder removed)
- [x] Content menu + Blocks Management UI
- [x] Global block storage (no env store view)
- [ ] Storefront path chosen (preset-only vs rules/evaluate)
- [x] Phase 1: Complete ✅
- [ ] Phase 2 / 3 / 5 as needed

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-09-30 | Agent | Initial draft |
| 1.0 | 2026-09-30 | Agent | Merged implementation to repo root |
| 1.1 | 2026-10-01 | Agent | Removed `conditional-block/` copy; docs point to root only |
