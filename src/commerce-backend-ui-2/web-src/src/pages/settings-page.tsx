import { useCallback, useEffect, useMemo, useState } from "react";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { fileToBase64, invokeBrandAction } from "./brands-api.ts";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

type AttributeStatus = {
  lastSync: number | null;
  count: number;
  expiresAt: string | null;
};

type MigrationDataset = {
  id: string;
  label: string;
  description: string;
  fileKind: string;
};

type MigrationService = {
  id: string;
  label: string;
  allowWrite: boolean;
  defaultDatasets?: Record<string, boolean>;
  datasets: MigrationDataset[];
};

type MigrationFileEntry = {
  path: string;
  filename: string;
  size: number;
  uploadedAt: number;
};

type MigrationDraft = {
  draftId?: string;
  service?: string;
  files?: Record<string, MigrationFileEntry>;
  datasets?: Record<string, boolean>;
};

type MigrationProgress = {
  done: number;
  total: number;
  label: string;
};

type MigrationJob = {
  jobId: string;
  service: string;
  mode: "update" | "write";
  status: string;
  phase: string;
  progress: MigrationProgress;
  error?: string | null;
  summary?: Record<string, unknown> | null;
  startedAt?: number | null;
  finishedAt?: number | null;
};

type MigrationSnapshot = {
  current?: { jobId?: string; status?: string; phase?: string; progress?: MigrationProgress; error?: string | null } | null;
  job?: MigrationJob | null;
  draft?: MigrationDraft | null;
};

function formatWhen (value: number | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function statusLabel (status: string | undefined): string {
  const text = String(status || "").trim();
  if (!text) return "Idle";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatFileSize (bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function csvHint (description: string): string {
  const match = description.match(/\(([^)]+)\)/);
  return match?.[1] || description;
}

const DEFAULT_SINGLE_UPLOAD_MAX_BYTES = 700 * 1024;
const DEFAULT_UPLOAD_CHUNK_BYTES = 512 * 1024;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Unable to read the file."));
    reader.readAsDataURL(blob);
  });
}

export function SettingsPage({ ims }: { ims: Ims }) {
  const [attributes, setAttributes] = useState<AttributeStatus | null>(null);
  const [migrationServices, setMigrationServices] = useState<MigrationService[]>([]);
  const [migration, setMigration] = useState<MigrationSnapshot | null>(null);
  const [serviceId, setServiceId] = useState("location");
  const [mode, setMode] = useState<"update" | "write">("update");
  const [datasets, setDatasets] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploadingKind, setUploadingKind] = useState("");
  const [startingMigration, setStartingMigration] = useState(false);
  const [singleUploadMaxBytes, setSingleUploadMaxBytes] = useState(DEFAULT_SINGLE_UPLOAD_MAX_BYTES);
  const [uploadChunkBytes, setUploadChunkBytes] = useState(DEFAULT_UPLOAD_CHUNK_BYTES);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeService = useMemo(
    () => migrationServices.find(entry => entry.id === serviceId) || migrationServices[0] || null,
    [migrationServices, serviceId],
  );

  const allowWrite = activeService?.allowWrite ?? false;

  function applyServiceDefaults(nextServiceId: string) {
    const next = migrationServices.find(entry => entry.id === nextServiceId);
    if (next?.defaultDatasets) {
      setDatasets({ ...next.defaultDatasets });
    }
    setMode("update");
  }

  useEffect(() => {
    if (!activeService?.defaultDatasets || migration?.draft?.service === serviceId) return;
    if (migration?.draft?.datasets && migration.draft.service === serviceId) return;
    setDatasets({ ...activeService.defaultDatasets });
  }, [activeService?.id, migration?.draft?.service, migration?.draft?.datasets, serviceId]);

  const jobActive = migration?.current?.status === "running" ||
    migration?.current?.status === "queued" ||
    migration?.job?.status === "running" ||
    migration?.job?.status === "queued";

  async function loadMigrationStatus() {
    const payload = await invokeBrandAction<{ migration?: MigrationSnapshot }>(ims, "app-settings", {
      operation: "status",
    });
    if (payload.migration) setMigration(payload.migration);
    if (payload.migration?.draft?.datasets) {
      setDatasets(prev => ({ ...prev, ...payload.migration!.draft!.datasets }));
    }
  }

  async function loadStatus() {
    setLoading(true);
    try {
      const [statusPayload, catalogPayload] = await Promise.all([
        invokeBrandAction<{ attributes?: AttributeStatus; migration?: MigrationSnapshot }>(ims, "app-settings", {
          operation: "status",
        }),
        invokeBrandAction<{
          services?: MigrationService[];
          singleUploadMaxBytes?: number;
          uploadChunkBytes?: number;
        }>(ims, "app-settings", {
          operation: "migration-catalog",
        }),
      ]);
      setAttributes(statusPayload.attributes || null);
      if (statusPayload.migration) setMigration(statusPayload.migration);
      if (catalogPayload.services?.length) {
        setMigrationServices(catalogPayload.services);
        if (!catalogPayload.services.some(entry => entry.id === serviceId)) {
          setServiceId(catalogPayload.services[0].id);
        }
      }
      if (catalogPayload.singleUploadMaxBytes) {
        setSingleUploadMaxBytes(catalogPayload.singleUploadMaxBytes);
      }
      if (catalogPayload.uploadChunkBytes) {
        setUploadChunkBytes(catalogPayload.uploadChunkBytes);
      }
      if (statusPayload.migration?.draft?.datasets) {
        setDatasets(prev => ({ ...prev, ...statusPayload.migration!.draft!.datasets }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, [ims]);

  const refreshMigration = useCallback(async () => {
    try {
      await loadMigrationStatus();
    } catch {
      // polling errors are ignored
    }
  }, [ims]);

  useEffect(() => {
    if (!jobActive) return undefined;
    const timer = window.setInterval(() => {
      void refreshMigration();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [jobActive, refreshMigration]);

  async function flushStorefrontCache() {
    setFlushing(true);
    setMessage("");
    setError("");
    try {
      await invokeBrandAction(ims, "app-settings", { operation: "flush-storefront" });
      setMessage("Cache flushed. Blocks, product evaluation, brand pages, and the location directory will load fresh data on the next request.");
    } catch (flushError) {
      setError(flushError instanceof Error ? flushError.message : "Unable to flush cache.");
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

  async function uploadDatasetFile(dataset: MigrationDataset, file: File) {
    setUploadingKind(dataset.fileKind);
    setMessage("");
    setError("");
    try {
      let draft: MigrationDraft | undefined;
      if (file.size <= singleUploadMaxBytes) {
        const content = await fileToBase64(file);
        const payload = await invokeBrandAction<{ draft?: MigrationDraft }>(ims, "app-settings", {
          operation: "migration-upload",
          service: serviceId,
          fileKind: dataset.fileKind,
          filename: file.name,
          content,
        });
        draft = payload.draft;
      } else {
        const uploadId = crypto.randomUUID();
        const chunkSize = uploadChunkBytes;
        const totalChunks = Math.ceil(file.size / chunkSize);
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
          const start = chunkIndex * chunkSize;
          const end = Math.min(file.size, start + chunkSize);
          const content = await blobToBase64(file.slice(start, end));
          setMessage(`Uploading ${file.name}… part ${chunkIndex + 1} of ${totalChunks}`);
          await invokeBrandAction(ims, "app-settings", {
            operation: "migration-upload-chunk",
            service: serviceId,
            fileKind: dataset.fileKind,
            uploadId,
            chunkIndex,
            totalChunks,
            content,
          });
        }
        const payload = await invokeBrandAction<{ draft?: MigrationDraft }>(ims, "app-settings", {
          operation: "migration-upload-complete",
          service: serviceId,
          fileKind: dataset.fileKind,
          filename: file.name,
          uploadId,
          totalChunks,
          totalSize: file.size,
        });
        draft = payload.draft;
      }
      if (draft) {
        setMigration(prev => ({ ...prev, draft }));
      }
      setMessage(`Uploaded ${file.name} for ${dataset.label}.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload CSV.");
    } finally {
      setUploadingKind("");
    }
  }

  async function startMigration() {
    setStartingMigration(true);
    setMessage("");
    setError("");
    try {
      const payload = await invokeBrandAction<{ jobId?: string }>(ims, "app-settings", {
        operation: "migration-start",
        service: serviceId,
        mode: allowWrite ? mode : "update",
        datasets,
      });
      setMessage(`Migration started${payload.jobId ? ` (job ${payload.jobId})` : ""}. Progress updates below.`);
      await loadMigrationStatus();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Unable to start migration.");
    } finally {
      setStartingMigration(false);
    }
  }

  function toggleDataset(id: string) {
    setDatasets(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const draftFiles = migration?.draft?.files || {};
  const progress = migration?.job?.progress || migration?.current?.progress;
  const migrationStatusText = migration?.job?.status || migration?.current?.status || "idle";
  const progressPercent = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.done / progress.total) * 100))
    : null;

  return (
    <main className="conditional-blocks">
      {(loading || flushing || syncing || uploadingKind || startingMigration) ? <CommerceLoader /> : null}
      <header className="page-header list-header">
        <h1>Settings</h1>
      </header>
      {message ? <p className="message" role="status">{message}</p> : null}
      {error ? <p className="message settings-error" role="alert">{error}</p> : null}
      <section className="settings-card">
        <h2>Cache</h2>
        <p>Clears cached block results, product-page evaluation, brand pages, and the location directory listing.</p>
        <button type="button" onClick={() => void flushStorefrontCache()} disabled={flushing || syncing || jobActive}>
          {flushing ? "Flushing…" : "Flush cache"}
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
        <button type="button" className="btn-continue" onClick={() => void syncAttributes()} disabled={flushing || syncing || jobActive}>
          {syncing ? "Syncing…" : "Sync attributes"}
        </button>
      </section>
      <section className="settings-card settings-card-wide migration-panel">
        <div className="migration-panel-header">
          <div>
            <h2>Data migration</h2>
            <p className="migration-lead">
              Upload legacy CSV exports to App Builder Files, then run a background import. Progress is stored in State.
            </p>
          </div>
          <span className={`migration-status-pill migration-status-pill--${migrationStatusText}`}>
            {statusLabel(migrationStatusText)}
          </span>
        </div>

        <div className="migration-config-row">
          <div className="migration-field">
            <span className="migration-field-label" id="migration-service-label">Service</span>
            <select
              id="migration-service"
              className="migration-select"
              aria-labelledby="migration-service-label"
              value={serviceId}
              onChange={event => {
                const next = event.target.value;
                setServiceId(next);
                applyServiceDefaults(next);
              }}
              disabled={jobActive}
            >
              {migrationServices.map(service => (
                <option key={service.id} value={service.id}>{service.label}</option>
              ))}
            </select>
          </div>
          <div className="migration-field migration-field-grow">
            <span className="migration-field-label">Import mode</span>
            {allowWrite ? (
              <div className="migration-mode-toggle" role="radiogroup" aria-label="Import mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === "update"}
                  className={mode === "update" ? "is-active" : ""}
                  disabled={jobActive}
                  onClick={() => setMode("update")}
                >
                  <strong>Update</strong>
                  <span>Upsert CSV rows; leave other records unchanged.</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === "write"}
                  className={mode === "write" ? "is-active is-destructive" : ""}
                  disabled={jobActive}
                  onClick={() => setMode("write")}
                >
                  <strong>Write</strong>
                  <span>
                    For each selected dataset, remove existing rows of that type, then import from CSV.
                  </span>
                </button>
              </div>
            ) : (
              <p className="migration-update-only">
                <strong>Update only</strong> — matches CSV rows to existing {activeService?.label.toLowerCase()} records and patches fields. No full replace.
              </p>
            )}
          </div>
        </div>

        {activeService ? (
          <div className="migration-datasets">
            <div className="migration-section-heading">
              <h3>Datasets</h3>
              <p>Select what to import and upload one CSV per row.</p>
            </div>
            <ul className="migration-dataset-list">
              {activeService.datasets.map(dataset => {
                const uploaded = draftFiles[dataset.id];
                const enabled = Boolean(datasets[dataset.id]);
                const isUploading = uploadingKind === dataset.fileKind;
                const inputId = `migration-file-${dataset.id}`;
                return (
                  <li
                    key={dataset.id}
                    className={`migration-dataset-card${enabled ? " is-enabled" : ""}${uploaded ? " has-file" : ""}`}
                  >
                    <div className="migration-dataset-card-head">
                      <div className="migration-dataset-toggle">
                        <input
                          id={`migration-dataset-${dataset.id}`}
                          type="checkbox"
                          checked={enabled}
                          onChange={() => toggleDataset(dataset.id)}
                          disabled={jobActive}
                        />
                        <label htmlFor={`migration-dataset-${dataset.id}`}>{dataset.label}</label>
                      </div>
                      <span className={`migration-file-badge${uploaded ? " is-ready" : ""}`}>
                        {isUploading ? "Uploading…" : uploaded ? "Ready" : "No file"}
                      </span>
                    </div>
                    <p className="migration-dataset-desc">{dataset.description}</p>
                    <div className="migration-dataset-meta">
                      <code className="migration-csv-name">{csvHint(dataset.description)}</code>
                      {uploaded ? (
                        <span className="migration-upload-meta">
                          {uploaded.filename} · {formatFileSize(uploaded.size)} · {formatWhen(uploaded.uploadedAt)}
                        </span>
                      ) : (
                        <span className="migration-upload-meta is-muted">Upload a CSV to include this dataset.</span>
                      )}
                    </div>
                    <div className="migration-dataset-actions">
                      <input
                        id={inputId}
                        className="migration-file-native"
                        type="file"
                        accept=".csv,text/csv"
                        disabled={jobActive || isUploading}
                        onChange={event => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) void uploadDatasetFile(dataset, file);
                        }}
                      />
                      <label htmlFor={inputId} className="migration-upload-btn">
                        {isUploading ? "Uploading…" : uploaded ? "Replace CSV" : "Choose CSV"}
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="migration-actions">
          <button
            type="button"
            className="btn-continue"
            onClick={() => void startMigration()}
            disabled={jobActive || startingMigration || !activeService}
          >
            {startingMigration ? "Starting…" : jobActive ? "Migration running…" : "Start migration"}
          </button>
          <button type="button" className="btn-secondary migration-refresh-btn" onClick={() => void refreshMigration()} disabled={loading}>
            Refresh status
          </button>
        </div>

        <div className="migration-status-panel">
          <div className="migration-section-heading">
            <h3>Progress</h3>
            {(migration?.job?.phase || migration?.current?.phase) ? (
              <p>Phase: {migration?.job?.phase || migration?.current?.phase}</p>
            ) : (
              <p>Status updates while a job is queued or running.</p>
            )}
          </div>
          {progress?.label ? (
            <div className="migration-progress-block">
              <div className="migration-progress-labels">
                <span>{progress.label}</span>
                {progress.total > 0 ? <span>{progress.done} / {progress.total}</span> : null}
              </div>
              {progressPercent != null ? (
                <div className="migration-progress-track" aria-hidden="true">
                  <div className="migration-progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>
              ) : null}
            </div>
          ) : null}
          {migration?.job?.error || migration?.current?.error ? (
            <p className="message settings-error" role="alert">
              {migration?.job?.error || migration?.current?.error}
            </p>
          ) : null}
          {migration?.job?.summary ? (
            <details className="migration-summary-details">
              <summary>View result summary</summary>
              <pre className="migration-summary">{JSON.stringify(migration.job.summary, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      </section>
    </main>
  );
}
