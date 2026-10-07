# Implementation Plan: Brands module

**Approach:** Phase 3 Option A  
**Requirements:** REQUIREMENTS.md v1.9  
**Architecture:** ARCHITECTURE.md → Brands module (approved 2026-10-05)  
**Status:** Tasks 1–11 complete. Tasks 2 and 4 skipped. Not deployed. Phase 5 has not started.

Each task is finished and checked before the next one starts. No checkout webhook, domain YAML, or checkout onboarding script.

---

## Starter Kit Discovery Findings

**Starter Kit Structure Discovery ✅** (2026-10-05)

- **Kit shape:** This repo is Little Farms Admin (Admin UI SDK V2 + App Builder), not a Checkout webhook kit. There is no `actions/commerce-checkout-starter-kit-info/`, no `lib/` at the repo root, and no payment, shipping, or tax YAML.
- **Action pattern:** CommonJS single-file actions. Entrypoint is `exports.main = main`. Logger is `Core.Logger` from `@adobe/aio-sdk`. Errors use `actions/utils.js` `errorResponse`. Success is `{ statusCode: 200, body }`. Reference: `actions/block/admin/cache-flush/index.js` and `actions/block/storefront/blocks/index.js`. No `webhookVerify`, no `atob` body decode, no operations-array response.
- **Existing actions:** All under `actions/block/` (admin list/write/remove, condition-*, metadata, cache-flush, storefront blocks, evaluate). None are Brands. Do not remove Blocks actions.
- **Libs:** Shared code is `actions/block/lib/` (database via `@adobe/aio-lib-db`, State via `@adobe/aio-lib-state`, catalog via `attribute-catalog.js`). Brands get `actions/brand/lib/` and may call the existing attribute catalog. There is no root `lib/adobe-commerce.js`.
- **Admin UI:** `src/commerce-backend-ui-2/web-src/`. Module rail is `modules/registry.ts`. `app.tsx` renders `MainPage` only for `blocks-management`. Actions are POSTed with the admin IMS bearer token (`main-page.tsx` `invoke`). URLs come from generated `config.json` as `littlefarms-appbuilder/{actionName}`.
- **Config:** Root `app.config.yaml` includes `src/commerce-backend-ui-2/ext.config.yaml`. Brand actions are added there, next to the block actions. Database `auto-provision: true` and `region: $DB_REGION` are already set. No domain YAML. No onboarding script.
- **Storefront:** `api-mesh/schema.graphql` and `api-mesh/resolvers.js`. Mesh descriptions must stay single-line (CLI `jsmin` limitation). `brand-storefront` is a public read, same idea as `validateStorefrontSecretUnlessPublicPresetRead` in `actions/block/lib/storefront-auth.js`.
- **Env:** `env.dist` already has `LOG_LEVEL`, Commerce GraphQL, IMS, `STATE_REGION`, `DB_REGION`, `PRESET_RESULT_CACHE_TTL`. `.env` is gitignored and is not edited with secrets.
- **Node:** 22 preferred, `>=18` in `package.json`. Actions use `nodejs:22`.
- **Dependencies present:** `@adobe/aio-sdk`, `@adobe/aio-lib-db`, `@adobe/aio-lib-state`. **Missing:** `@adobe/aio-lib-files` (required for brand images).

### Lint / format

| Surface | Rules |
|---------|--------|
| Actions (`.eslintrc.json`, `eslint:recommended`, `ecmaVersion: latest`) | CommonJS `require` / `exports`. Single quotes. Semicolons. 2-space indent. Space before function parentheses (`async function main (params)`). No trailing commas in the block actions. Logger name matches the action. |
| Admin UI (`web-src`, TypeScript, `strict`) | ES modules. Double quotes. Semicolons. Trailing commas in multiline imports and objects. JSX in `.tsx`. |

`npm run lint` covers `actions/` and `src/`. It ignores `web-src`. Match the file you are editing.

---

## Task list

### Task 1 — Runtime config

**File:** `src/commerce-backend-ui-2/ext.config.yaml`

Add five actions under package `littlefarms-appbuilder`. Reuse the existing `admin-inputs` and `admin-annotations` anchors.

| Action | Auth | Timeout | Memory | Extra inputs |
|--------|------|---------|--------|----------------|
| `brand-settings` | `require-adobe-auth: true` | 15000 | 256 | Commerce GraphQL + IMS inputs, same set as `block-metadata` |
| `brand-list` | `require-adobe-auth: true` | 20000 | 512 | Same Commerce inputs as `brand-settings` |
| `brand-write` | `require-adobe-auth: true` | 10000 | 256 | `admin-inputs` only |
| `brand-asset` | `require-adobe-auth: true` | 20000 | 512 | `admin-inputs` only |
| `brand-storefront` | no `require-adobe-auth` | 15000 | 512 | `admin-inputs` plus `PRESET_RESULT_CACHE_TTL` (used as the 600s brand cache TTL) |

Every action: `web: yes`, `runtime: nodejs:22`, `final: true`, `include-ims-credentials: true`.

Function paths:

- `../../actions/brand/admin/settings/index.js`
- `../../actions/brand/admin/list/index.js`
- `../../actions/brand/admin/write/index.js`
- `../../actions/brand/admin/asset/index.js`
- `../../actions/brand/storefront/brand/index.js`

**Checkpoint:** YAML still includes every existing block action. No second Commerce menu. **Done 2026-10-05.**

### Task 2 — Domain YAML

**Skip.** Architecture: no payment, shipping, or tax YAML.

### Task 3 — Environment template

**File:** `env.dist`

Add a comment that brand storefront cache uses `PRESET_RESULT_CACHE_TTL` (600). Do not add a default attribute code. Do not write secrets into `.env`.

**Checkpoint:** `env.dist` has no real credentials. **Done 2026-10-05.**

### Task 4 — Onboarding script

**Skip.** No checkout onboarding script. Database collection `littlefarms_brands` and `littlefarms_brand_settings` are created on first action use, same as `preset-store.js`.

### Task 5 — Dependency

Install `@adobe/aio-lib-files` in the root `package.json` and update the lockfile.

**Checkpoint:** `require('@adobe/aio-lib-files')` resolves. **Done 2026-10-05.** Installed `@adobe/aio-lib-files` ^4.1.4.

### Task 6 — Brand library

**Path:** `actions/brand/lib/`

| File | Responsibility |
|------|----------------|
| `constants.js` | Collection names, page size 50, scope code `all`, field defaults |
| `slug.js` | Slug from the option label; postfix `-2`, `-3` when the alias is taken in that scope |
| `brand-store.js` | Open DB, ensure collections, settings get/save, upsert options, page query, write one scope, resolve store view over `all` |
| `brand-cache.js` | State get/put/delete for id, name, alias, and slim widget pages. TTL from `PRESET_RESULT_CACHE_TTL` or 600 |
| `sync-options.js` | Read the selected attribute from `attributesList` via `actions/block/lib/attribute-catalog.js`. Insert, rename, or mark removed. Never delete a document |

Attribute code stays empty until `brand-settings` saves one. A different code without `confirmAttributeChange: true` returns 409 and writes nothing.

**Checkpoint:** Library has no Admin UI imports. Lint passes for `actions/brand/lib`. **Done 2026-10-05.**

### Task 7 — Admin actions

One `index.js` per action. Validate inputs in that file. Log with `Core.Logger`. Never log IMS tokens.

| Action | Behavior |
|--------|----------|
| `brand-settings` | GET-style body `{ operation: "get" }` returns dropdowns plus the saved code. `{ operation: "save", brandAttributeCode, confirmAttributeChange }` saves and hides the previous set |
| `brand-list` | Syncs options, then returns one page: `page`, `pageSize` (max 50), `storeViewCode` (default `default`) |
| `brand-write` | Saves editable fields for `all` or one store view. Rejects a duplicate `url_alias`. Does not change `optionValue` |
| `brand-asset` | Accepts base64 `content`, `contentType`, and `kind` (`image` or `small`). Writes `public/brands/{attributeCode}/{optionValue}/...`. Returns the public URL. Does not log file bytes |

**Checkpoint:** Each action returns `{ statusCode, body }` or `errorResponse`. Admin actions assume `require-adobe-auth`. **Done 2026-10-05.**

### Task 8 — Storefront action

**File:** `actions/brand/storefront/brand/index.js`

| Operation | Input | Result |
|-----------|--------|--------|
| `get` | Exactly one of `id`, `name`, `urlAlias`. `storeViewCode` defaults to `default` | One resolved brand, or 404 |
| `list` | `widget` = `LIST`, `SLIDER`, or omitted. `page`, `pageSize` max 50 | Slim cards |

Omit inactive, hidden, and removed options. Cache hits skip the database. This action does not call `productSearch`.

**Checkpoint:** A request with no id, name, or alias on `get` returns 400. **Done 2026-10-05.**

### Task 9 — API Mesh

Update `api-mesh/schema.graphql`, `api-mesh/resolvers.js`, and `api-mesh/secrets.yaml` with `littleFarmsBrand` and `littleFarmsBrands` as specified in ARCHITECTURE.md. Resolver POSTs to the `brand-storefront` URL from mesh secrets. Keep GraphQL descriptions on one line.

**Checkpoint:** Existing `littleFarmsBlock` / `littleFarmsBlocks` fields stay. Mesh file is not deployed in this task. **Done 2026-10-05.**

### Task 10 — Admin UI

| File | Change |
|------|--------|
| `modules/registry.ts` | `{ id: "brands-management", menuLabel: "Brands", pageTitle: "Brands", available: true }` |
| `app.tsx` | Render a Brands page when that module is active |
| New page + form components | Settings (dropdown picker, confirm on change), grid (columns from the reference screen, page size 50), edit form (sections and defaults from REQUIREMENTS.md). No CMS block fields. No additional-brand-information field |
| Styles | Follow existing `web-src` class patterns |

Scope switcher defaults to All Store Views (`all`). Meta Title and Page Title support Use Default Value. Image and small image upload call `brand-asset`, then `brand-write` stores the URL.

**Checkpoint:** Blocks still render when `blocks-management` is selected. Brands is reachable from the rail. **Done 2026-10-05.** Admin UI was not opened in Commerce Admin; that needs a signed-in session and `aio app dev`.

### Task 11 — Verify

- `npm run lint` on the new actions
- YAML structure of `ext.config.yaml` still lists block actions and brand actions
- Do not run `aio app deploy` in this plan. Deployment is Phase 5, after implementation is reviewed

**Checkpoint:** `npx eslint actions/brand` passed. All 10 block actions and 5 brand actions are in `ext.config.yaml`. `aio app deploy` was not run. **Done 2026-10-05.** `npm run lint` still reports 4 existing `globalThis` errors in `actions/block/lib/attribute-catalog.js` and `catalog-client.js`. Those files were not part of this module.

### Testing

Recommendations only. No new test suite.

Manual checks after a later deploy: pick a dropdown, refuse a change that is not confirmed, confirm a change hides the old rows and restores them when selected again, edit All Store Views, override one store view, unique alias postfix, upload, mesh query by id, name, and alias.

---

## Out of scope for these tasks

- Creating the Commerce attribute
- Product cards inside this app
- Writing the Blocks Brands List editor
- Phase 5 cleanup and `aio app deploy`
- Generated unit tests

---

## Sign-off

Starter kit discovery is complete and documented. Code generation starts after you confirm these conventions.
