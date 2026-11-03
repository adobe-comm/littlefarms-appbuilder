import { invokeRuntimeAction } from "../runtime-action.ts";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

export async function invokeDeliverySlotAction<T>(
  ims: Ims,
  params: Record<string, unknown>,
): Promise<T> {
  return invokeRuntimeAction<T>(ims, "delivery-slot-admin", params);
}
