import { useEffect, useState, type ReactNode } from "react";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { fileToBase64, invokeLocationAction } from "./locations-api.ts";
import {
  contentKindMeta,
  emptyGallery,
  emptyService,
  emptyTeamProfile,
  type LocationContentKind,
  type LocationGalleryRecord,
  type LocationServiceRecord,
  type LocationTeamRecord,
} from "./location-content-types.ts";
import "./locations.css";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp";

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="field-row">
      <label htmlFor={id}>
        {label}
        {required ? <span className="required">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function statusField(
  id: string,
  value: "enabled" | "disabled",
  onChange: (next: "enabled" | "disabled") => void,
) {
  return (
    <Field id={id} label="Enabled">
      <select
        id={id}
        className="location-yesno"
        value={value === "enabled" ? "yes" : "no"}
        onChange={event => onChange(event.target.value === "yes" ? "enabled" : "disabled")}
      >
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </Field>
  );
}

function assetKindForContent(kind: LocationContentKind): "serviceIcon" | "galleryImage" | "teamImage" {
  if (kind === "service") return "serviceIcon";
  if (kind === "gallery") return "galleryImage";
  return "teamImage";
}

export function LocationContentEditor({
  ims,
  kind,
  entityId,
  onClose,
}: {
  ims: Ims;
  kind: LocationContentKind;
  entityId: number | null;
  onClose: () => void;
}) {
  const meta = contentKindMeta(kind);
  const [service, setService] = useState<LocationServiceRecord>(emptyService());
  const [gallery, setGallery] = useState<LocationGalleryRecord>(emptyGallery());
  const [team, setTeam] = useState<LocationTeamRecord>(emptyTeamProfile());
  const [loading, setLoading] = useState(entityId != null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (entityId == null) {
      setService(emptyService());
      setGallery(emptyGallery());
      setTeam(emptyTeamProfile());
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setMessage("");
      try {
        const params: Record<string, unknown> = { kind, [meta.idParam]: entityId };
        const result = await invokeLocationAction<{ item: LocationServiceRecord | LocationGalleryRecord | LocationTeamRecord }>(
          ims,
          "location-content-list",
          params,
        );
        if (cancelled) return;
        const item = result.item;
        if (kind === "service") setService({ ...emptyService(), ...(item as LocationServiceRecord) });
        else if (kind === "gallery") setGallery({ ...emptyGallery(), ...(item as LocationGalleryRecord) });
        else setTeam({ ...emptyTeamProfile(), ...(item as LocationTeamRecord) });
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Unable to open the record.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ims, kind, entityId, meta.idParam]);

  async function uploadImage(file: File, contentId: string) {
    setUploading(true);
    setMessage("");
    try {
      const contentType = file.type.toLowerCase();
      const content = await fileToBase64(file);
      const uploaded = await invokeLocationAction<{ url: string }>(ims, "location-asset", {
        kind: assetKindForContent(kind),
        contentId,
        contentType,
        content,
      });
      return uploaded.url;
    } finally {
      setUploading(false);
    }
  }

  function validate(): string {
    if (kind === "service") {
      if (!service.title.trim()) return "Title is required.";
      if (!service.serviceUrl.trim()) return "Service URL is required.";
      return "";
    }
    if (kind === "gallery") {
      if (!gallery.title.trim()) return "Title is required.";
      if (!gallery.imageAlt.trim()) return "Image Alt Text is required.";
      return "";
    }
    if (!team.name.trim()) return "Name is required.";
    if (!team.jobTitle.trim()) return "Job Title is required.";
    if (team.sortOrder.trim() && !/^-?\d+$/.test(team.sortOrder.trim())) return "Sort Order must be a whole number.";
    return "";
  }

  async function save(stay: boolean) {
    const error = validate();
    if (error) {
      setMessage(error);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const fields = kind === "service"
        ? {
          status: service.status,
          title: service.title,
          serviceUrl: service.serviceUrl,
          icon: service.icon,
        }
        : kind === "gallery"
          ? {
            status: gallery.status,
            title: gallery.title,
            image: gallery.image,
            imageAlt: gallery.imageAlt,
          }
          : {
            status: team.status,
            name: team.name,
            jobTitle: team.jobTitle,
            image: team.image,
            sortOrder: team.sortOrder,
          };
      const params: Record<string, unknown> = { kind, fields };
      if (entityId != null) params[meta.idParam] = entityId;
      const result = await invokeLocationAction<{ item: LocationServiceRecord | LocationGalleryRecord | LocationTeamRecord }>(
        ims,
        "location-content-write",
        params,
      );
      const item = result.item;
      if (kind === "service") setService(item as LocationServiceRecord);
      else if (kind === "gallery") setGallery(item as LocationGalleryRecord);
      else setTeam(item as LocationTeamRecord);
      setMessage(kind === "service" ? "Service saved." : kind === "gallery" ? "Gallery saved." : "Profile saved.");
      if (!stay) onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  const title = entityId == null
    ? `New ${meta.heading}`
    : kind === "team"
      ? `Edit Profile`
      : `Edit ${meta.heading} '${kind === "service" ? service.title : gallery.title}'`;

  const contentId = entityId != null
    ? String(entityId)
    : kind === "service"
      ? "draft-service"
      : kind === "gallery"
        ? "draft-gallery"
        : "draft-team";

  return (
    <main className="conditional-blocks block-edit-page location-edit-page">
      {loading ? <CommerceLoader /> : null}
      <header className="block-edit-header">
        <h1>{title}</h1>
        <div className="block-edit-actions">
          <button type="button" className="admin-back" onClick={onClose}>Back</button>
          <button type="button" className="admin-text" disabled={saving} onClick={() => {
            if (kind === "service") setService(emptyService());
            else if (kind === "gallery") setGallery(emptyGallery());
            else setTeam(emptyTeamProfile());
          }}
          >
            Reset
          </button>
          <button type="button" className="admin-text" disabled={saving} onClick={() => void save(true)}>
            Save and Continue Edit
          </button>
          <button type="button" className="admin-primary" disabled={saving} onClick={() => void save(false)}>
            {kind === "gallery" ? "Save Gallery" : kind === "service" ? "Save Service" : "Save Profile"}
          </button>
        </div>
      </header>
      {message ? <p className="message" role="status">{message}</p> : null}
      <section>
        <h2 className="block-edit-section-title">{meta.heading} Information</h2>
        {kind === "service" ? (
          <>
            {statusField("content-service-enabled", service.status, status => setService(current => ({ ...current, status })))}
            <Field id="content-service-title" label="Title" required>
              <input
                id="content-service-title"
                value={service.title}
                onChange={event => setService(current => ({ ...current, title: event.target.value }))}
              />
            </Field>
            <Field id="content-service-url" label="Service URL" required>
              <input
                id="content-service-url"
                value={service.serviceUrl}
                onChange={event => setService(current => ({ ...current, serviceUrl: event.target.value }))}
              />
            </Field>
            <Field id="content-service-icon" label="Icon">
              <span className="location-file">
                <input
                  id="content-service-icon"
                  type="file"
                  accept={IMAGE_ACCEPT}
                  disabled={uploading}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void uploadImage(file, contentId).then(url => {
                      if (url) setService(current => ({ ...current, icon: url }));
                    });
                    event.target.value = "";
                  }}
                />
                {service.icon ? <img className="brand-preview" src={service.icon} alt="" /> : null}
              </span>
            </Field>
          </>
        ) : null}
        {kind === "gallery" ? (
          <>
            {statusField("content-gallery-enabled", gallery.status, status => setGallery(current => ({ ...current, status })))}
            <Field id="content-gallery-title" label="Title" required>
              <input
                id="content-gallery-title"
                value={gallery.title}
                onChange={event => setGallery(current => ({ ...current, title: event.target.value }))}
              />
            </Field>
            <Field id="content-gallery-image" label="Image">
              <span className="location-file">
                <input
                  id="content-gallery-image"
                  type="file"
                  accept={IMAGE_ACCEPT}
                  disabled={uploading}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void uploadImage(file, contentId).then(url => {
                      if (url) setGallery(current => ({ ...current, image: url }));
                    });
                    event.target.value = "";
                  }}
                />
                {gallery.image ? <img className="brand-preview" src={gallery.image} alt="" /> : null}
              </span>
            </Field>
            <Field id="content-gallery-alt" label="Image Alt Text" required>
              <input
                id="content-gallery-alt"
                value={gallery.imageAlt}
                onChange={event => setGallery(current => ({ ...current, imageAlt: event.target.value }))}
              />
            </Field>
          </>
        ) : null}
        {kind === "team" ? (
          <>
            {statusField("content-team-enabled", team.status, status => setTeam(current => ({ ...current, status })))}
            <Field id="content-team-name" label="Name" required>
              <input
                id="content-team-name"
                value={team.name}
                onChange={event => setTeam(current => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field id="content-team-job" label="Job Title" required>
              <input
                id="content-team-job"
                value={team.jobTitle}
                onChange={event => setTeam(current => ({ ...current, jobTitle: event.target.value }))}
              />
            </Field>
            <Field id="content-team-image" label="Image">
              <span className="location-file">
                <input
                  id="content-team-image"
                  type="file"
                  accept={IMAGE_ACCEPT}
                  disabled={uploading}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void uploadImage(file, contentId).then(url => {
                      if (url) setTeam(current => ({ ...current, image: url }));
                    });
                    event.target.value = "";
                  }}
                />
                {team.image ? <img className="brand-preview" src={team.image} alt="" /> : null}
              </span>
            </Field>
            <Field id="content-team-sort" label="Sort Order">
              <input
                id="content-team-sort"
                inputMode="numeric"
                value={team.sortOrder}
                onChange={event => setTeam(current => ({ ...current, sortOrder: event.target.value }))}
              />
            </Field>
          </>
        ) : null}
      </section>
    </main>
  );
}
