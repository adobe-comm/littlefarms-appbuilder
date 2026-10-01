# Codebase map — LittleFarms Blocks Management

All application code lives at the **repository root** (single App Builder project).

## Top-level layout

| Path | Role |
|------|------|
| `app.commerce.config.ts` | App Management + Admin UI SDK registration (menu under **Apps**, **Little Farms Admin**) |
| `app.config.yaml` | Wires `commerce/extensibility/1`, `commerce/configuration/1`, and `commerce/backend-ui/2` |
| `install.yaml` | Commerce install manifest (must list all three extension points for Configure + Admin UI) |
| `env.dist` | Environment template (Catalog GraphQL, IMS, DB/State regions, evaluate secret) |
| `actions/block/` | Runtime actions for admin + storefront |
| `actions/utils.js` | Shared HTTP/error helpers for actions |
| `src/commerce-extensibility-1/` | App Management generated actions (`app-config`, `association`, `installation`) |
| `src/commerce-backend-ui-2/web-src/` | Admin SPA embedded in Commerce (React 19 + UIX Guest) |
| `docs/blocks-concepts.md` | Preset vs rule vs placement explained |
| `docs/storefront-contract.md` | PDP evaluate API contract |
| `ARCHITECTURE.md` | Runtime actions, storage, integrations |
| `REQUIREMENTS.md` | Product requirements and checklist |

Removed scaffolding: legacy root `web-src/`, `actions/generic/`, and the duplicate `conditional-block/` reference tree (2026-10-01).

## Admin UI flow

1. Merchant opens **Apps → Little Farms Admin** (iframe).
2. `app.tsx` obtains IMS token via `@adobe/uix-guest` / EXC runtime.
3. **`AppShell`** — left-hand **Features** menu lists modules (bundled logo: `web-src/src/assets/little-farms-logo.png`). Add modules in `appModules`.
4. **`main-page.tsx`** (**Blocks** feature) — list / type select / edit with **SectionLayout** (Frontend Properties | Block Options), Page Builder–style.
5. SPA calls web actions using URLs from `web-src/src/config.json` (updated by `aio app dev`).

## Block types (extensibility)

- Registry: `web-src/src/block-types/index.ts`
- Server allowlist: `actions/block/lib/constants.js` (`BLOCK_TYPES`)
- v1 single type: `littlefarms_featured_recommended`

## Runtime actions

| Action | Purpose |
|--------|---------|
| `block-condition-list` | List saved blocks (presets) |
| `block-condition-write` | Create/update preset |
| `block-metadata` | Attributes, categories, catalog browse, SKU match preview |
| `block-list` / `block-write` / `block-remove` | Full **rules** for storefront PDP |
| `block-evaluate` | Storefront: matching blocks for current SKU |

Preset pipeline: `actions/block/admin/condition-*` + `lib/preset-store.js` → DB collection `condition_presets`.

Rule pipeline: `actions/block/admin/{list,write,remove}` + `lib/rules-store.js` + `lib/evaluate.js` → collection `conditional_blocks` + State cache.

## Commands

```bash
npm install --legacy-peer-deps
npx aio-commerce-lib-app generate all   # after changing app.commerce.config.ts
aio app dev                             # local Admin UI + action URLs
```

Regenerate manifest whenever `app.commerce.config.ts` changes.
