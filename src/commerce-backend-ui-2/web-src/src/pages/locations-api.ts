import { invokeRuntimeAction } from "../runtime-action.ts";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

export async function invokeLocationAction<T>(ims: Ims, name: string, params: Record<string, unknown> = {}): Promise<T> {
  return invokeRuntimeAction<T>(ims, name, params);
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

type LocationContentKind = "service" | "gallery" | "team";

type ContentPickerResponse = {
  items: Array<{ contentId: string; title: string; type: string }>;
};

export async function loadLocationContentPicker(
  ims: Ims,
  kind: LocationContentKind,
): Promise<ContentPickerResponse> {
  return invokeLocationAction<ContentPickerResponse>(ims, "location-content-list", {
    kind,
    picker: true,
  });
}
