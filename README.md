# littlefarms

Welcome to my Adobe I/O Application!

## Prerequisites

- **Node.js 22** is **preferred** for local development (`npm install`, `aio app dev`, `aio app deploy`, `aio app db`, API Mesh CLI, and related commands). This project has been exercised most often on Node 22.
- **Node.js 18+** is the minimum (`package.json` `engines`); App Builder actions use the **nodejs:22** runtime in `ext.config.yaml`.

Use `node -v` to confirm your version before running Adobe I/O CLI commands.

## Setup

- Populate the `.env` file in the project root and fill it as shown [below](#env)

## Local Dev

- `aio app run` to start your local Dev server
- App will run on `localhost:9080` by default

By default the UI will be served locally but actions will be deployed and served from Adobe I/O Runtime. To run your actions locally use the `aio app dev` option.

For more information on the difference between `aio app run` and `aio app dev`, see [here](https://developer.adobe.com/app-builder/docs/guides/development/#aio-app-dev-vs-aio-app-run)

## Test & Coverage

- Run `aio app test` to run unit tests for ui and actions
- Run `aio app test --e2e` to run e2e tests

## Deploy & Cleanup

- `aio app deploy` to build and deploy all actions on Runtime and static files to CDN
- `aio app undeploy` to undeploy the app

## Brand database indexes

Brand reads do not create indexes. `littlefarms_brands` on `748062-littlefarms-stage` already has these three. After the app moves to a new Runtime namespace, create them once before using the brand list. Set `--region` to the same value as `DB_REGION` when that namespace is not in `amer`.

```bash
aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"optionValue":1}' \
  --name brand_option_scope \
  --unique

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"optionLabel":1}' \
  --name brand_label

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"hidden":1,"optionRemoved":1,"optionLabel":1}' \
  --name brand_list
```

`brand_option_scope` keeps one row per option in a store view. `brand_list` is the index the brand directory query uses.

The storefront filters on `littleFarmsBrands` need one more index each. Create them once in the same namespace. `name` on that query is a contains match and stays on the rows these indexes already selected. Exact brand lookup by name uses `brand_name`.

```bash
aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"hidden":1,"optionRemoved":1,"is_active":1,"optionLabel":1}' \
  --name brand_active

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"hidden":1,"optionRemoved":1,"is_new_brand":1,"optionLabel":1}' \
  --name brand_new

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"hidden":1,"optionRemoved":1,"is_top_brand":1,"optionLabel":1}' \
  --name brand_top

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"hidden":1,"optionRemoved":1,"is_featured":1,"optionLabel":1}' \
  --name brand_featured

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"hidden":1,"optionRemoved":1,"show_in_brand_list_widget":1,"optionLabel":1}' \
  --name brand_list_widget

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"hidden":1,"optionRemoved":1,"show_in_brand_slider_widget":1,"optionLabel":1}' \
  --name brand_slider_widget

aio app db index create littlefarms_brands \
  --spec '{"environmentId":1,"attributeCode":1,"storeViewCode":1,"normalizedLabel":1}' \
  --name brand_name
```

| Index | GraphQL argument |
|-------|------------------|
| `brand_active` | `isActive`, and `littleFarmsBrandsList` |
| `brand_new` | `isNewBrand` |
| `brand_top` | `isTopBrand` |
| `brand_featured` | `isFeatured` |
| `brand_list_widget` | `showInBrandListWidget` and `widget: LIST` |
| `brand_slider_widget` | `showInBrandSliderWidget` and `widget: SLIDER` |
| `brand_name` | `littleFarmsBrand(name:)` |

Confirm with:

```bash
aio app db index list littlefarms_brands --json
```

## Config

### `.env`

You can generate this file using the command `aio app use`. 

```bash
# This file must **not** be committed to source control

## please provide your Adobe I/O Runtime credentials
# AIO_RUNTIME_AUTH=
# AIO_RUNTIME_NAMESPACE=
```

### `app.config.yaml`

- Main configuration file that defines an application's implementation. 
- More information on this file, application configuration, and extension configuration 
  can be found [here](https://developer.adobe.com/app-builder/docs/guides/configuration/#appconfigyaml)

#### Action Dependencies

- You have two options to resolve your actions' dependencies:

  1. **Packaged action file**: Add your action's dependencies to the root
   `package.json` and install them using `npm install`. Then set the `function`
   field in `app.config.yaml` to point to the **entry file** of your action
   folder. We will use `webpack` to package your code and dependencies into a
   single minified js file. The action will then be deployed as a single file.
   Use this method if you want to reduce the size of your actions.

  2. **Zipped action folder**: In the folder containing the action code add a
     `package.json` with the action's dependencies. Then set the `function`
     field in `app.config.yaml` to point to the **folder** of that action. We will
     install the required dependencies within that directory and zip the folder
     before deploying it as a zipped action. Use this method if you want to keep
     your action's dependencies separated.

## Debugging in VS Code

While running your local server (`aio app dev`), both UI and actions can be debugged. To do so follow the instructions [here](https://developer.adobe.com/app-builder/docs/guides/development/#debugging)

## Typescript support for UI

To use typescript use `.tsx` extension for react components and add a `tsconfig.json` 
and make sure you have the below config added
```
 {
  "compilerOptions": {
      "jsx": "react"
    }
  } 
```
