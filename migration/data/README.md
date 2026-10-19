# Data migration (CSV → App Builder)

## Location migration (Store Locator)

Legacy Aheadworks Store Locator exports live under `stage/`. The importer maps rows into `littlefarms_locations` and optionally `littlefarms_location_content` (services).

### Source files

| File | Description |
|------|-------------|
| `stage/Location_data_1.csv` | Store / cafe locations |
| `stage/Location_service_data.csv` | Linked services (Butcher, Wine, …) |
| `stage/Team_data_store_locator.csv` | Team profiles linked to locations |

Gallery CSV is **not** wired yet (`store_gallery` is reported as deferred in the import plan).

### Join / identity

- **Locations:** match `location_id` (CSV) ↔ `locationId` (DB), then fallback `store_url` ↔ `storeUrl`.
- **Create:** `--create-missing` inserts CSV-only rows using legacy `location_id` as `locationId`.
- **Services:** `--import-services` upserts by legacy numeric `id` → `serviceId`.
- **Team:** `--import-team` upserts profiles by legacy `id` → `profileId`; links `teamProfiles` on each location from the team CSV `location_ids` column (and from `store_team` on the location CSV when present).

### Field mapping (locations)

| CSV | App Builder |
|-----|-------------|
| `title`, `description`, address fields | same (`country_id` → `country`, `region_name` → `state`) |
| `store_url` | `storeUrl` |
| `status` | `enabled` / `disabled` |
| `image`, `custom_marker`, `banner`, `logo` | `locationImage`, `mapMarker`, `storeBanner`, `logo` |
| `hoursofoperation`, `cafehoursofoperation` | `storeHours`, `cafeHours` (legacy JSON → week grid) |
| `content`, `travel_suggestion`, `store_promotions` | `storeContent`, `travelSuggestion`, `promotions` |
| `service_ids` | `services` (string ids, link after service import) |
| `is_store`, `is_cafe`, `is_featured`, `open_in_new_tab` | same semantics |
| Meta fields | `metaTitle`, `metaKeywords`, `metaDescription` |
| `store_codes` / Magento scope | `storeViews`: `["All Store Views"]` |

Relative media paths are expanded with `--media-base` (default below) so documents pass HTTPS validation; `--migrate-assets` replaces them with App Builder Files URLs.

### Run (locations)

```bash
# Plan only
node migration/data/import-locations.js --import-services --import-team --create-missing

# Services + team, then update existing locations
node migration/data/import-locations.js --apply --import-services --import-team

# Full greenfield: services + team + insert all CSV locations
node migration/data/import-locations.js --apply --import-services --import-team --create-missing

# Include legacy image download + location-asset runtime upload
node migration/data/import-locations.js --apply --import-services --create-missing --migrate-assets
```

Default legacy media root:

`https://mcstaging.littlefarms.com/media/aheadworks/store_locator`

Optional flags mirror the brand importer: `--media-base`, `--use-db-sdk`, `--update-all`, `--limit`, `--verbose`, `--skip-cache-flush`.

Reports: `migration/data/out/location-import-plan-<timestamp>.json`.

App Builder document storage is **not** partitioned by Commerce `environmentId` (that field is not used on saved rows). `MAGENTO_ENVIRONMENT_ID` in `.env` is only for **Commerce GraphQL API headers**.

---

# Brand option migration (CSV → App Builder)

Legacy Improved Navigation brand settings are exported as CSV under `stage/`. The importer maps rows into `littlefarms_brands` documents (same fields as the Brands admin UI).

## Source file

| File | Description |
|------|-------------|
| `stage/Brand_Option_data.csv` | Stage export (`lf_brand`, admin scope) |

## Join rule

- **Use brand name:** `brand_name` (CSV) ↔ `optionLabel` (database).
- **Do not use** `brand_option_id` / `value` from CSV for matching; Commerce option ids on Stage differ from the legacy export.

## Field mapping

| CSV | App Builder |
|-----|-------------|
| `title` | `page_title` (+ `page_title_use_default: false`) |
| `meta_title` | `meta_title` (+ `meta_title_use_default: false`) |
| `meta_description`, `meta_keywords` | same |
| `description`, `short_description` | same |
| `image`, `image_alt` | same (`image` = page/hero image) |
| `slider_image` | `small_image` (slider thumbnail) |
| `small_image_alt` | `small_image_alt` |
| `url_alias` | `url_alias` (only when CSV has a value) |
| `is_active`, `is_featured`, `is_new_brand`, `is_top_brand` | same |
| `is_show_in_widget` | `show_in_brand_list_widget` |
| `is_show_in_slider` | `show_in_brand_slider_widget` |
| `slider_position` | `slider_position` (when not `0`) |
| `top_cms_*`, `bottom_cms_*`, block ids | **Not imported** (out of scope for Brands module) |

## Run

From the repo root, with the correct App Builder workspace selected (`aio where`). By default the script reads and writes the database through the **`aio app db`** CLI (workspace OAuth). Optional `--use-db-sdk` uses `@adobe/aio-lib-db` and requires IMS credentials in root `.env`.

```bash
# Plan only (writes JSON under migration/data/out/)
node migration/data/import-brand-options.js

# Apply only rows where CSV differs from the database (default)
node migration/data/import-brand-options.js --apply

# Apply CSV mapping for every matched brand (full run, skips diff check)
node migration/data/import-brand-options.js --apply --update-all

# Import legacy Amasty media into App Builder Files (uses aio workspace runtime creds)
node migration/data/import-brand-options.js --apply --migrate-assets

# Content + images for brands that differ (typical Stage run)
node migration/data/import-brand-options.js --apply --migrate-assets

# Smoke test on 10 brands
node migration/data/import-brand-options.js --apply --update-all --limit 10
```

Legacy image URLs (when `--migrate-assets` is set):

| CSV column | Source URL |
|------------|------------|
| `image` | `{media-base}/image/{filename}` |
| `slider_image` | `{media-base}/slider/slider_image/{filename}` |

Default `media-base`: `https://mcstaging.littlefarms.com/media/amasty/shopby/option_images`

Files are stored like the admin **brand-asset** action: `public/brands/{attributeCode}/{optionValue}/image-*.{ext}` (or `small-*`), and the public Files URL is written to `image` / `small_image` on the brand document.

**Local runs:** The CLI downloads from Commerce, then invokes deployed **`__secured_brand-asset`** on Adobe I/O Runtime (`aio runtime action invoke`, using workspace runtime auth). Direct `aio-lib-files` from a laptop usually fails; set `BRAND_MIGRATE_ASSETS_LOCAL=1` only if you intentionally test local Files. Override action with `AIO_RUNTIME_PACKAGE` / `BRAND_ASSET_ACTION` if needed.

Optional flags:

- `--csv <path>` — alternate export file
- `--attribute lf_brand` — override attribute code (default: single code in CSV or `lf_brand`)
- `--update-all` — write all matched brands from CSV, including rows that already match (use for a full migration pass)
- `--migrate-assets` — download from Commerce media and upload to App Builder Files (uses `AIO_RUNTIME_*` from `.env` if set, else `aio config ls` for the selected workspace)
- `--media-base <url>` — override Commerce media root for production or other environments
- `--use-db-sdk` — batch writes with `bulkWrite` (40 per request). IMS token uses `clientId` / `clientSecret` / `orgId` from `.env` (`IMS_*` or `AIO_COMMERCE_AUTH_*`) or from `aio config ls` for the selected workspace (same as `./fetch-secrets.sh`)
- `--progress-every <n>` — log `n/total brands updated` during apply (default 100; always logs the final count)
- `--verbose` — log each brand name while applying

## Brands admin UI

List page, search, open brand edit, and active admin module are stored in **sessionStorage** so a browser refresh returns you to the same module and brand context (same tab/session).

Reports are saved as `migration/data/out/brand-import-plan-<timestamp>.json` with per-brand `changes` previews.

## After apply

- Brand storefront cache is flushed once via `createBrandCache`.
- After `--migrate-assets`, confirm URLs in the report or Brands admin point at App Builder Files (e.g. `firefly.azureedge.net`), not mcstaging.
