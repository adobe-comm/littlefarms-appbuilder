/**
 * Example single-file action pattern (Checkout Starter Kit) — no telemetry.
 * Use this structure for filter/data domains (e.g. shipping-methods, collect-taxes).
 * Adapt: handler name, lib paths, and business logic for your domain.
 * To add telemetry, wrap the handler with instrumentEntrypoint (see kit: actions/shipping-methods/index.js).
 * Reference: rulesets/checkout-starter-kit/skills/developer.md — Single-File Action Pattern.
 */

import { webhookErrorResponse, webhookVerify } from "../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../lib/http.js";

/**
 * Handler: verify webhook → decode body → business logic → return response.
 * For validation domains (e.g. validate-payment) use webhookSuccessResponse() / webhookErrorResponse().
 * For filter/data domains return { statusCode: HTTP_OK, body: JSON.stringify(operations) }.
 */
function exampleDomainHandler(params) {
  const { success, error } = webhookVerify(params);
  if (!success) {
    return webhookErrorResponse(`Failed to verify the webhook signature: ${error}`);
  }

  // raw-http: true → decode body
  let payload;
  try {
    payload = JSON.parse(atob(params.__ow_body));
  } catch (e) {
    return webhookErrorResponse("Invalid request body");
  }

  const operations = [];
  // e.g. operations.push({ op: "add", path: "result", value: { carrier_code, method, method_title, price } });

  return { statusCode: HTTP_OK, body: JSON.stringify(operations) };
}

export const main = exampleDomainHandler;
