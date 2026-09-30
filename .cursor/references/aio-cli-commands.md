# Adobe I/O CLI commands (Checkout Starter Kit)

Reference for **aio** CLI commands used for checkout extensions. Use when looking up command syntax or writing docs. For deployment steps and troubleshooting, see **references/deployment-and-verification.md**.

## Contents

- [Prerequisites](#prerequisites)
- [Essential commands](#essential-commands)

## Prerequisites

Ensure the **Adobe I/O CLI (aio)** is installed before running any commands below. If not installed:

```bash
npm install -g @adobe/aio-cli
aio plugins:install @adobe/aio-cli-plugin-app
```

Verify with `aio --version` or `aio where`.

## Essential commands

| Command | Purpose |
|--------|---------|
| `aio auth login` | Authenticate with Adobe IMS (before first deploy or when token expired) |
| `aio where` | Show current org, project, and workspace (verify before deploy) |
| `aio console org select` | Select the current Adobe I/O organization |
| `aio console project select` | Select the current project |
| `aio console workspace select` | Select the current workspace (e.g. Stage, Production) |
| `aio app dev` | Run the app locally for development |
| `aio app deploy` | Deploy the app to Adobe I/O Runtime |
| `aio app deploy --local --verbose` | Validate config and references without full deploy (e.g. post–Phase 5) |
| `aio app deploy --workspace <name>` | Deploy to a specific workspace (e.g. Stage, Production) |
| `aio app deploy --verbose` | Verbose output for failed or complex deploys |
| `aio app deploy --force-build` | Force a full rebuild (ignore cache) |
| `aio app deploy --force-deploy` | Force deployment (skip pre-deploy checks) |
| `aio app logs` | Stream or inspect action logs |
| `aio app logs --tail` | Stream logs continuously (debugging) |
| `aio app logs --action <action-name>` | Logs for a single action (e.g. validate-payment) |
| `aio app logs --limit <n>` | Last n activations (e.g. 50) |
| `aio app test` | Run the project test suite |
