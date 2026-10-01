/** Normalize bundler output (string, `{ default }`, or asset object) to a usable img src. */
export function resolveAssetUrl(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.default === "string") return record.default;
    if (record.default && typeof record.default === "object") {
      const nested = record.default as Record<string, unknown>;
      if (typeof nested.src === "string") return nested.src;
      if (typeof nested.href === "string") return nested.href;
    }
    if (typeof record.src === "string") return record.src;
  }
  return "";
}
