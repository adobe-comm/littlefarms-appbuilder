import { useEffect, useState } from "react";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { invokeBrandAction } from "./brands-api.ts";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

type AttributeStatus = {
  lastSync: number | null;
  count: number;
  expiresAt: string | null;
};

function formatWhen (value: number | null): string {
  if (!value) return "Not synced yet";
  return new Date(value).toLocaleString();
}

export function SettingsPage({ ims }: { ims: Ims }) {
  const [attributes, setAttributes] = useState<AttributeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadStatus() {
    setLoading(true);
    try {
      const payload = await invokeBrandAction<{ attributes?: AttributeStatus }>(ims, "app-settings", { operation: "status" });
      setAttributes(payload.attributes || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, [ims]);

  async function flushStorefrontCache() {
    setFlushing(true);
    setMessage("");
    setError("");
    try {
      await invokeBrandAction(ims, "app-settings", { operation: "flush-storefront" });
      setMessage("Storefront cache flushed. Block results, product evaluation, and brand pages will load again from Commerce.");
    } catch (flushError) {
      setError(flushError instanceof Error ? flushError.message : "Unable to flush the storefront cache.");
    } finally {
      setFlushing(false);
    }
  }

  async function syncAttributes() {
    setSyncing(true);
    setMessage("");
    setError("");
    try {
      const payload = await invokeBrandAction<{ lastSync?: number; count?: number }>(ims, "app-settings", { operation: "sync-attributes" });
      setAttributes({
        lastSync: payload.lastSync || Date.now(),
        count: payload.count || 0,
        expiresAt: attributes?.expiresAt || null,
      });
      setMessage(`Product attributes synced. ${payload.count || 0} attributes are stored.`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Unable to sync product attributes.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="conditional-blocks">
      {(loading || flushing || syncing) ? <CommerceLoader /> : null}
      <header className="page-header list-header">
        <h1>Settings</h1>
      </header>
      {message ? <p className="message" role="status">{message}</p> : null}
      {error ? <p className="message settings-error" role="alert">{error}</p> : null}
      <section className="settings-card">
        <h2>Storefront cache</h2>
        <p>Clears cached block results, product-page evaluation, and brand pages. The next storefront request loads fresh data.</p>
        <button type="button" onClick={() => void flushStorefrontCache()} disabled={flushing || syncing}>
          {flushing ? "Flushing…" : "Flush storefront cache"}
        </button>
      </section>
      <section className="settings-card">
        <h2>Product attributes</h2>
        <p>Copies the Commerce product attribute catalog into App Builder State. Brands and block conditions read that copy.</p>
        <p className="field-hint">
          Last sync: {formatWhen(attributes?.lastSync ?? null)}
          {attributes ? ` · ${attributes.count} attributes` : ""}
        </p>
        <p className="field-hint">Also refreshes every 30 days. Sync after a dropdown option is added, changed, or removed.</p>
        <button type="button" className="btn-continue" onClick={() => void syncAttributes()} disabled={flushing || syncing}>
          {syncing ? "Syncing…" : "Sync attributes"}
        </button>
      </section>
    </main>
  );
}
