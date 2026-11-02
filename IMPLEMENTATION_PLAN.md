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

---

# Implementation Plan: Delivery Slot module

**Approach:** Phase 3 Option A  
**Requirements:** REQUIREMENTS.md v2.8 (Delivery Slot module)  
**Architecture:** ARCHITECTURE.md → Delivery Slot module v0.3 (approved 2026-10-27)  
**Legacy reference:** `/home/ranjeet/projects/littlefarms/littlefarms2024` (`LittleFarms_Checkout`, `LittleFarms_Sales`, `Brainvire_DeliveryDate`)  
**Launch scope:** MVP-A + B + C + D (full legacy parity)  
**Status:** Tasks DS-0–DS-13 complete. **Phase 4 ✅ Phase 5 ✅** (2026-10-27). Deploy smoke + DS-14 EDS tracked in `REQUIREMENTS.md`.

Each task is completed and checked before the next starts. No Checkout Starter Kit webhooks or domain YAML.

---

## Starter Kit Discovery Findings (Delivery Slot)

**Starter Kit Structure Discovery ✅** (2026-10-27)

| Area | Finding |
|------|---------|
| **Kit shape** | Little Farms Admin — Admin UI SDK V2 + App Builder. Not Checkout Starter Kit. |
| **Action pattern** | CommonJS `exports.main`, `Core.Logger`, `actions/utils.js` `errorResponse`, `{ statusCode, body }`. Multi-op routers: `actions/lib/operation-router.js` (used by `location-admin`, `blog-admin`). Reference storefront: `actions/location/storefront/location/index.js`. |
| **Libs** | Per-feature under `actions/{feature}/lib/`. Shared: `actions/utils.js`, `actions/lib/operation-router.js`, `actions/lib/storefront-swr-cache.js`, `actions/block/lib/attribute-catalog.js` (Commerce GraphQL attributes/products). |
| **Config** | Actions registered in `src/commerce-backend-ui-2/ext.config.yaml`. Root `app.config.yaml` includes that extension. **First commerce eventing** for this app — add `eventing` in `app.commerce.config.ts`, then `npx aio-commerce-lib-app generate all`. |
| **Alarms** | Precedent: `attribute-sync-monthly` trigger in `ext.config.yaml` (`/whisk.system/alarms/interval`). Delivery reset uses daily alarm → `delivery-slot-reset`. |
| **Admin UI** | `src/commerce-backend-ui-2/web-src/src/modules/registry.ts`, `app.tsx` module switch. Add `delivery-slot-management`. |
| **Storefront** | `api-mesh/schema.graphql`, `resolvers.js`, `secrets.yaml`, `meshConfig.json`. |
| **Database** | `@adobe/aio-lib-db`, collections created on first use (Locations/Brands pattern). `DB_REGION` in env. |
| **Cache** | `@adobe/aio-lib-state`, SWR helper in `actions/lib/storefront-swr-cache.js`. |
| **Env** | `env.dist` — extend with comments for delivery slot URLs/secrets if needed; mesh secret for storefront action URL. |
| **Node / runtime** | `nodejs:22`, `web: yes`, admin actions `require-adobe-auth: true`, `include-ims-credentials: true`. |

### Lint / format (unchanged from Brands plan)

| Surface | Rules |
|---------|--------|
| Actions | `.eslintrc.json`, CommonJS, single quotes, semicolons, 2-space indent, `async function main (params)` |
| Admin UI | TypeScript/React, double quotes, semicolons, trailing commas in multiline structures |

`npm run lint` on touched `actions/` and `src/` paths.

### Port source (legacy PHP → JS)

Primary files to port into `actions/delivery-slot/lib/slot-builder.js` and related:

- `littlefarms2024/app/code/LittleFarms/Checkout/Model/DeliverySlot.php` (cutoffs **12:00 / 19:30**, morning **11:00–15:00**)
- `.../Model/Config.php`, `SpecialDeliveryConfig.php`
- `.../Observer/SalesConvertQuoteToOrder.php` (booking rules)
- `.../Cron/DeliverySlotReset.php`

Post-order edit behavior from `LittleFarms/Sales/Controller/.../SavedDeliveryDateTime.php` (order fields only).

---

## Task list (Delivery Slot)

### Task DS-0 — Discovery sign-off (gate)

**Blocking for DS-1+:** Product owner confirms discovery table above. Reply in chat: *“Delivery Slot discovery sign-off — proceed with code.”*

**Checkpoint:** Record sign-off date in this file. **✅ 2026-10-27** (user: proceed with next phase)

---

### Task DS-1 — Commerce custom attributes (platform)

**Owner:** Merchandising / Commerce admin (may be manual on ACCS).

Register OOPE custom attributes on **Cart** and **Order** (same codes):

- `delivery_date_time` (string/datetime semantics per Commerce)
- `delivery_date_time_slot` (string)
- `delivery_date_reset` (optional, quote/cart — legacy on `quote` only)

**Doc:** Link to provisioning steps in `docs/delivery-slot-storefront-contract.md` (Task DS-14).

**Product attributes (OQ-7):** Confirmed in ACCS Admin 2026-10-27 — `days_availability`, `offset_delivery_date` (plus optional `days_availability_info`). ☐ GraphQL on sample SKU optional before go-live.

**Checkpoint:** Stage GraphQL `setCustomAttributesOnCart` succeeds with test cart. **✅ Verified 2026-10-27** — `delivery_date_time` + `delivery_date_time_slot` persisted on guest cart (no OOPE Admin pre-create required). Optional: confirm copy to **order** after test place-order; `delivery_date_reset` when testing offset SKU.

---

### Task DS-2 — Runtime config (`ext.config.yaml`)

Add under package `littlefarms-appbuilder`:

| Action | Path | Auth | Timeout | Memory |
|--------|------|------|---------|--------|
| `delivery-slot-admin` | `../../actions/delivery-slot/admin/index.js` | require-adobe-auth | 20000 | 512 |
| `delivery-slot-storefront` | `../../actions/delivery-slot/storefront/index.js` | final, IMS | 20000 | 1024 |
| `delivery-slot-order-book` | `../../actions/delivery-slot/events/order-book/index.js` | final, IMS | 30000 | 256 |
| `delivery-slot-reset` | `../../actions/delivery-slot/jobs/reset/index.js` | final, IMS | 60000 | 256 |

Reuse `admin-inputs` / storefront cache env vars where applicable (`STOREFRONT_CACHE_*`, Commerce GraphQL inputs for catalog reads).

**Checkpoint:** Existing block/location/brand actions unchanged. **✅ 2026-10-27**

---

### Task DS-3 — App Management eventing + daily alarm

1. **`app.commerce.config.ts`** — add `eventing.commerce` provider with event `observer.checkoutsubmitallafter` → runtime action `littlefarms-appbuilder/delivery-slot-order-book` (exact package/action names match deploy).
2. Run `npx aio-commerce-lib-app generate all` and commit generated manifest changes.
3. **`ext.config.yaml`** — add trigger `delivery-slot-reset-daily` (cron-style interval or daily alarm per Adobe docs) → rule → `delivery-slot-reset`. Schedule aligned with legacy `1 0 * * *` in **store timezone** (handled in action logic).

**Checkpoint:** Generated manifest includes event registration. Alarm rule present. **✅ 2026-10-27** (run `generate all` after deploy to register events in Commerce)

---

### Task DS-4 — Environment template

**File:** `env.dist`

Add comments (no secrets) for mesh URL secret name `LITTLEFARMS_DELIVERY_SLOT_STOREFRONT_URL` and any booking-specific vars if needed.

**Checkpoint:** `.env` still gitignored. **✅ 2026-10-27**

---

### Task DS-5 — Delivery Slot library

**Path:** `actions/delivery-slot/lib/`

| File | Responsibility |
|------|----------------|
| `constants.js` | Collection names, weekday keys, cache key prefixes |
| `regular-store.js` | CRUD `littlefarms_delivery_regular` |
| `special-store.js` | CRUD `littlefarms_delivery_special` |
| `booking-store.js` | Idempotency `littlefarms_delivery_bookings` |
| `slot-builder.js` | Port legacy slot math (regular + special, MVP-C rules, mixed cart) |
| `booking.js` | Increment booked (regular weekday vs special JSON date) |
| `catalog-cart.js` | Load SKU attributes `days_availability`, `offset_delivery_date` via existing catalog GraphQL helpers |
| `delivery-cache.js` | State invalidate/get; integrate `storefront-swr-cache` where useful |
| `scope.js` | Environment + store view scoping (align with Locations) |

**Checkpoint:** `slot-builder` unit-testable; no HTTP in pure functions. Lint passes. **✅ 2026-10-27**

---

### Task DS-6 — Admin action router

**File:** `actions/delivery-slot/admin/index.js` + handlers:

| Operation | Behavior |
|-----------|----------|
| `regular-get` | Load weekday slot grids for store view |
| `regular-write` | Save start/end/max; do not allow client to set booked |
| `special-get` | Load special config + weekday grids |
| `special-write` | Save enable, dates, category offsets, slots |

Validate times, max ≥ 0, date ranges.

**Checkpoint:** POST from Admin SPA with IMS returns 200/4xx consistently. **✅ scaffold** (smoke after deploy)

---

### Task DS-7 — Storefront action

**File:** `actions/delivery-slot/storefront/index.js`

| Operation | Behavior |
|-----------|----------|
| `slots-for-cart` | Body: storeViewCode, cart line SKUs/category ids, optional saved slot → slot list + flags |
| `validate-saved-slot` | Recompute `selectedTimeValid` |
| `slots-for-order` | MVP-D: order context for reschedule (line items from order GraphQL in handler) |

Uses `slot-builder` + catalog reads. Does **not** mutate cart (EDS calls Commerce for that).

**Checkpoint:** 400 on missing required fields; cache headers behave like location-storefront. **✅ scaffold** (smoke after deploy)

---

### Task DS-8 — Order book event action

**File:** `actions/delivery-slot/events/order-book/index.js`

- Parse I/O Event payload for order identifier.
- Idempotent booking via `booking-store.js`.
- Load order custom attributes (Commerce GraphQL S2S).
- Call `booking.js`; invalidate cache.

**Checkpoint:** Second invocation for same order does not double-book. **✅ idempotency in code** (verify with event replay)

---

### Task DS-9 — Reset job action

**File:** `actions/delivery-slot/jobs/reset/index.js`

- Resolve store timezone(s).
- Zero yesterday’s weekday `bookedCount` on regular config documents.
- Log summary; invalidate cache.

**Checkpoint:** Manual invoke in dev clears only intended weekday. **✅ scaffold** (manual invoke)

---

### Task DS-10 — API Mesh

Update `api-mesh/schema.graphql`, `resolvers.js`, `secrets.yaml`, `meshConfig.json`:

- `littleFarmsDeliverySlots` → `slots-for-cart`
- `littleFarmsDeliverySlotValidate` → `validate-saved-slot`
- `littleFarmsDeliveryOrderSlots` → `slots-for-order`

Single-line GraphQL descriptions (CLI limitation).

**Checkpoint:** Existing mesh queries unchanged. **✅ 2026-10-27**

---

### Task DS-11 — Admin UI module

| File | Change |
|------|--------|
| `modules/registry.ts` | `{ id: "delivery-slot-management", menuLabel: "Delivery Slots", available: true }` |
| `app.tsx` | Route/render Delivery Slots module |
| New pages | **Regular delivery** weekday grid editor; **Special events** config screens (mirror legacy admin sections) |

Invoke `delivery-slot-admin` with `operation` param (same pattern as Locations).

**Checkpoint:** Other modules still load. **✅ 2026-10-27** (regular grid MVP; special grid editor minimal)

---

### Task DS-12 — Storefront contract doc

**File:** `docs/delivery-slot-storefront-contract.md`

Document: Mesh queries, Commerce mutations (`setCustomAttributesOnCart`, order attribute update for MVP-D), cart gate, field formats, error codes, legacy cutoff constants, EDS responsibilities.

**Checkpoint:** EDS team can implement cart/order UI from doc alone. **✅ 2026-10-27**

---

### Task DS-13 — Verify (local)

- `npm run lint` on new actions
- YAML sanity: all actions listed
- Optional: `aio app dev` smoke — admin load, invoke storefront action with fixture body
- **Do not** production deploy (Phase 5)

**Checkpoint:** Lint clean for new files. **✅ 2026-10-27** (`npm run lint` — no new delivery-slot errors)

---

### Task DS-14 — External: EDS storefront (tracking only)

Out of repo but required for launch:

- Cart calendar UI + proceed-to-checkout gate
- Order confirmation / order detail display (DS-FR-10)
- Customer order reschedule (MVP-D)
- Commerce GraphQL cart/order mutations with shopper token

Track completion in REQUIREMENTS acceptance checklist.

---

## Out of scope (Delivery Slot tasks)

- Importing PaaS booked/max (greenfield per OQ-5)
- Generated unit tests (unless requested)
- ~~Phase 5 scaffolding cleanup / production deploy~~ **Phase 5 complete ✅ 2026-10-27** (see Delivery Slot Phase 5 report below)
- Picker/warehouse (`Lf/Picker`) — only shares column names on orders

---

## Delivery Slot — Phase 5 report (2026-10-27)

**Domains in use:** Regular delivery + Special events (runtime + admin); storefront + order-book + daily reset.

| Area | Action |
|------|--------|
| Actions kept | `delivery-slot-admin`, `delivery-slot-storefront`, `delivery-slot-order-book`, `delivery-slot-reset` |
| Lib | All files under `actions/delivery-slot/lib/` — in use |
| Config | `src/commerce-backend-ui-2/ext.config.yaml` (actions + `delivery-slot-reset-daily` alarm) |
| Eventing | `app.commerce.config.ts` → `observer.checkoutsubmitallafter` → order-book (regenerate manifest after deploy) |
| Mesh | `api-mesh/schema.graphql`, `resolvers.js`, `secrets.yaml` |
| Admin UI | `delivery-slots-page.tsx`, route `delivery-slot-management` |
| Removed | None — no delivery scaffolding to delete |

**Verification (this session):** `npm run lint` — no errors under `actions/delivery-slot/`. `yamllint` not installed on host.

**Deferred (post–Phase 5, not blocking deploy):** Special admin **category offset** field-array UI; DS-14 EDS storefront; full launch acceptance checklist in `REQUIREMENTS.md`.

**Deploy (user-run on target workspace):**

```bash
cd /home/ranjeet/projects/littlefarms/littlefarms-appbuilder
npx aio-commerce-lib-app generate all   # if event manifest changed
npm run build
aio app deploy
```

After deploy: Commerce **App Management** event registration; confirm `delivery-slot-admin` URL in deployed `config.json`; enable **x-ow-extra-logging** only if debugging webhooks (N/A for delivery admin). Test admin save, Mesh slot query, optional place-order → booked increment.

---

## Sign-off (Delivery Slot)

Starter kit discovery for Delivery Slot is documented above.

**Code generation (Tasks DS-1 onward) starts after you confirm:**  
*“Delivery Slot discovery sign-off — proceed with code.”*
