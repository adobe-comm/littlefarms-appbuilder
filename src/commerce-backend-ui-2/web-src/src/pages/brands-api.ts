import actions from "../config.json";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

function actionUrl(name: string): string {
  const actionMap = actions as Record<string, string>;
  return actionMap[`littlefarms-appbuilder/${name}`] || actionMap[name] || "";
}

export async function invokeBrandAction<T>(ims: Ims, name: string, params: Record<string, unknown>): Promise<T> {
  const url = actionUrl(name);
  if (!url) {
    throw new Error(`Runtime action ${name} is not available. Run aio app dev so the action URL is generated.`);
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ims.imsToken}`,
      "Content-Type": "application/json",
      "x-gw-ims-org-id": ims.imsOrgId,
    },
    body: JSON.stringify(params),
  });
  const payload = await response.json() as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}.`);
  }
  return payload as T;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Unable to read the image file."));
    reader.readAsDataURL(file);
  });
}
