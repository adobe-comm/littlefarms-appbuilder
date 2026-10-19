import actions from "./config.json";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

const ADMIN_PREFIXES: Array<{ action: string; prefix: string }> = [
  { action: "block-admin", prefix: "block-" },
  { action: "brand-admin", prefix: "brand-" },
  { action: "location-admin", prefix: "location-" },
  { action: "blog-admin", prefix: "blog-" },
];

export function resolveRuntimeAction(name: string): { action: string; operation?: string } {
  if (name === "app-settings") {
    return { action: "app-settings" };
  }
  for (const route of ADMIN_PREFIXES) {
    if (name.startsWith(route.prefix)) {
      return { action: route.action, operation: name.slice(route.prefix.length) };
    }
  }
  return { action: name };
}

function actionUrl(name: string): string {
  const actionMap = actions as Record<string, string>;
  return actionMap[`littlefarms-appbuilder/${name}`] || actionMap[name] || "";
}

export async function invokeRuntimeAction<T>(
  ims: Ims,
  legacyOrActionName: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { action, operation } = resolveRuntimeAction(legacyOrActionName);
  const url = actionUrl(action);
  if (!url) {
    throw new Error(`Runtime action ${action} is not available. Run aio app dev so the action URL is generated.`);
  }
  const body: Record<string, unknown> =
    operation != null ? { ...params, adminOperation: operation } : { ...params };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ims.imsToken}`,
      "Content-Type": "application/json",
      "x-gw-ims-org-id": ims.imsOrgId,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}.`);
  }
  return payload as T;
}
