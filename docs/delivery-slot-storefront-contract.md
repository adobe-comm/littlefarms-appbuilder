# Delivery Slot — EDS / storefront contract

Little Farms delivery slots are configured in **Little Farms Admin → Delivery Slots** (App Builder DB). The **EDS** cart and My Orders UI call **API Mesh**; Mesh forwards to `delivery-slot-storefront`. Cart and order **values** are stored on Commerce via GraphQL custom attributes.

## Commerce custom attributes

| Code | Entity | Purpose |
|------|--------|---------|
| `delivery_date_time` | Cart, Order | Selected delivery datetime (`Y-m-d H:i:s` or equivalent string) |
| `delivery_date_time_slot` | Cart, Order | Human-readable slot label (e.g. time range text) |
| `delivery_date_reset` | Cart (optional) | Legacy offset-SKU reset flag |

**Cart mutation (verified on stage):** `setCustomAttributesOnCart` with `cart_id` and `custom_attributes: [{ attribute_code, value }]`.

**Order (MVP-D reschedule):** Mesh mutation **`littleFarmsSaveOrderDeliverySlot`** → `save-order-delivery-slot` on App Builder (IMS S2S). One call:

1. **GET** `/V1/orders?searchCriteria…increment_id=<order-number>` — read **previous** slot from `custom_attributes` and `entity_id`.
2. **Adjust booked** counts in App Builder DB (−1 old, +1 new).
3. **POST** `/V1/orders` with `{ entity: { entity_id, custom_attributes: [ delivery_date_time, delivery_date_time_slot ] } }`.

REST base: **`COMMERCE_CORE_REST_URL`** (same pattern as **`COMMERCE_CORE_GRAPHQL_URL`** — workspace env or App Management business config). EDS only calls Mesh; it does **not** need a separate Commerce POST for reschedule.

## Product catalog attributes (read-only for slot math)

| Attribute | Role |
|-----------|------|
| `days_availability` | Comma-separated weekday indexes (0=Monday … 6=Sunday); empty = all days |
| `offset_delivery_date` | When true, applies legacy weekday splice / extended special window |

## Legacy cutoff constants (regular path)

Ported from `LittleFarms/Checkout/Model/DeliverySlot.php`:

- Morning window: **11:00–15:00**
- Cutoffs: **12:00** (morning), **19:30** (evening)
- Same-day / next-day slot visibility follows legacy rules in `actions/delivery-slot/lib/slot-builder.js`

## API Mesh queries

All require `skus` (cart line SKUs). Optional `storeViewCode`; when omitted, Mesh defaults to **`default`** (same as Little Farms Admin → Delivery Slots). Commerce catalog headers may use a different code (e.g. `little_farms_store_view` in mesh secrets); delivery **config in App Builder DB** is not keyed by that header unless you save admin config for that view.

| Query | Maps to operation | Use |
|-------|-------------------|-----|
| `littleFarmsDeliverySlots` | `slots-for-cart` | Cart picker |
| `littleFarmsDeliverySlotValidate` | `validate-saved-slot` | Proceed-to-checkout gate |
| `littleFarmsDeliveryOrderSlots` | `slots-for-order` | My Orders reschedule picker |
| `littleFarmsSaveOrderDeliverySlot` (mutation) | `save-order-delivery-slot` | Persist reschedule + adjust booked |

Optional arguments: `deliveryDateTime`, `deliveryDateTimeSlot`, `specialCartMode` (`regular` \| `special` \| `mixed`), `categoryIds`, `orderId` (order query).

Mutation example:

```graphql
mutation SaveOrderSlot(
  $orderNumber: String!
  $deliveryDateTime: String!
  $deliveryDateTimeSlot: String!
) {
  littleFarmsSaveOrderDeliverySlot(
    orderNumber: $orderNumber
    deliveryDateTime: $deliveryDateTime
    deliveryDateTimeSlot: $deliveryDateTimeSlot
  ) {
    success
    bookingApplied
    released
  }
}
```

**EDS sequence:** Call Mesh mutation with `orderNumber` (increment id) and **new** `deliveryDateTime` / `deliveryDateTimeSlot` only.

Mesh secret: `LITTLEFARMS_DELIVERY_SLOT_STOREFRONT_URL` → deployed `delivery-slot-storefront` web action.

Example:

```graphql
query CartDeliverySlots($skus: [String!]!) {
  littleFarmsDeliverySlots(skus: $skus) {
    path
    selectedTimeValid
    mixedCartBlocked
    message
    daySlot {
      sort_name
      value
      is_active
      time_slot {
        start_time
        end_time
        remaining
      }
    }
  }
}
```

## EDS responsibilities

1. Extend cart GraphQL fragment with `custom_attributes { attribute_code value }`.
2. Cart UI: call Mesh, render `daySlot`, save selection via `setCustomAttributesOnCart`.
3. Checkout gate: `littleFarmsDeliverySlotValidate` — block if `selectedTimeValid` is 0.
4. Order confirmation / detail: read order custom attributes for display.
5. Mixed special + regular cart: show `mixedCartBlocked` message from Mesh.

## Admin

Invoke `delivery-slot-admin` with `operation`: `regular-get`, `regular-write`, `special-get`, `special-write` (IMS auth).

## Events

Order placed → Commerce event **`observer.sales_order_save_commit_after`** ( **`priority: true`** in `app.commerce.config.ts` → Commerce Admin **Priority = Yes** ) → `delivery-slot-order-book` increments booked counts (idempotent per **`increment_id`**). Runtime payload is CloudEvents-shaped: order fields under **`data.value`**. Subscription fields: **`id`**, **`increment_id`**, **`custom_attributes`**. Re-run app **installation → eventing** after deploy so priority is applied. Events stuck in **Waiting** are a Commerce outbound queue issue ([troubleshooting](https://developer.adobe.com/commerce/extensibility/events/troubleshooting/)), not fixed by priority alone.

Daily alarm → `delivery-slot-reset` zeros **yesterday’s weekday** booked counts on the regular config (store timezone: `DELIVERY_SLOT_TIMEZONE`, default `Asia/Singapore`).
