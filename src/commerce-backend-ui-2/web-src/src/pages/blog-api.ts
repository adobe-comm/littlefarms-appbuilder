import { invokeRuntimeAction } from "../runtime-action.ts";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

export async function invokeBlogAction<T>(ims: Ims, name: string, params: Record<string, unknown> = {}): Promise<T> {
  return invokeRuntimeAction<T>(ims, name, params);
}

export { fileToBase64 } from "./locations-api.ts";
