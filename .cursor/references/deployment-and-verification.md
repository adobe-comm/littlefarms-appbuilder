# Deployment and verification (Checkout Starter Kit)

Deployment steps, post–Phase 5 verification, and troubleshooting for checkout extensions. For aio CLI command reference (install, commands table), see **references/aio-cli-commands.md**.

## Contents

- [Deployment and verification](#deployment-and-verification)
- [Troubleshooting](#troubleshooting)

## Deployment and verification

- **Before deploy:** Ensure `.env` and `app.config.yaml` are correct; run `npm run sync-oauth-credentials` if using IMS.
- **Deploy:** `aio app deploy` (use `aio app deploy --local --verbose` to validate without full deploy).
- **Post–Phase 5 verification:** `yamllint app.config.yaml` (and domain YAMLs); `npm run code:report`; if tests exist, `npm test`; then `aio app deploy --local --verbose` to confirm no broken references.

## Troubleshooting

- **Runtime logging:** Successful webhook invocations are not logged by default. For debugging, enable **x-ow-extra-logging: on** in Commerce Admin: **Stores → Configuration → Adobe Services → Adobe I/O Events → Commerce Webhooks** (per webhook or globally). Then use `aio app logs --tail` or `aio app logs --action <action-name>` to inspect requests and responses.
- **Local verification:** Run `aio app dev`, then trigger the webhook from Commerce; check `aio app logs` and response shape. Use x-ow-extra-logging when needed.
