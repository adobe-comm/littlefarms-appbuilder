import { useEffect, useRef, useState, type ReactNode } from "react";
import { HtmlEditor } from "../components/html-editor.tsx";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { SectionLayout } from "../components/section-layout.tsx";
import { fileToBase64, invokeLocationAction } from "./locations-api.ts";
import {
  COUNTRIES,
  countryName,
  countrySelectWidthCh,
  directorySelectStyle,
  regionName,
  regionRequired,
  regionsFor,
  stateSelectWidthCh,
} from "./locations-directory.ts";
import "./locations.css";
import {
  GALLERY_OPTIONS,
  SERVICE_OPTIONS,
  STORE_VIEW_OPTIONS,
  TEAM_PROFILE_OPTIONS,
  WEEK_DAYS,
  dayLabel,
  emptyLocation,
  locationFromResponse,
  locationSections,
  normalizeTime24,
  type LocationRecord,
  type WeekHours,
} from "./locations-types.ts";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

type ImageKind = "logo" | "locationImage" | "mapMarker" | "storeBanner";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp";

function selectedValues(select: HTMLSelectElement): string[] {
  return [...select.selectedOptions].map(option => option.value);
}

function mapSrc(latitude: string, longitude: string, zoom: string): string {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const level = Number(zoom);
  const zoomLevel = Number.isFinite(level) && level > 0 ? Math.min(level, 18) : 15;
  const delta = 180 / (2 ** zoomLevel);
  const west = lng - delta;
  const south = lat - delta / 2;
  const east = lng + delta;
  const north = lat + delta / 2;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${west},${south},${east},${north}`)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`;
}

function clientError(record: LocationRecord): string {
  if (!record.title.trim()) return "Title is required.";
  if (!record.country.trim()) return "Country is required.";
  if (regionRequired(record.country) && !record.state.trim()) return "State is required.";
  if (!record.city.trim()) return "City is required.";
  if (!record.street.trim()) return "Street is required.";
  if (!record.storeViews.length) return "Store View is required.";
  if (record.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email.trim())) return "Enter a valid email address.";
  if (record.sortOrder.trim() && !/^-?\d+$/.test(record.sortOrder.trim())) return "Sort Order must be a whole number.";
  return "";
}

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

function ImageField({
  id,
  label,
  url,
  disabled,
  onFile,
}: {
  id: string;
  label: string;
  url: string;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <Field id={id} label={label}>
      <span className="location-file">
        <input
          id={id}
          type="file"
          accept={IMAGE_ACCEPT}
          disabled={disabled}
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
        {url ? <img className="brand-preview" src={url} alt="" /> : null}
      </span>
    </Field>
  );
}

function MultiField({
  id,
  label,
  required,
  options,
  value,
  onChange,
  help,
}: {
  id: string;
  label: string;
  required?: boolean;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  help?: string;
}) {
  return (
    <div className="field-row">
      <label htmlFor={id}>
        {label}
        {required ? <span className="required">*</span> : null}
      </label>
      <span className="location-multiselect">
        <select
          id={id}
          multiple
          size={8}
          value={value}
          onChange={event => onChange(selectedValues(event.target))}
        >
          {options.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        {help ? (
          <button type="button" className="location-help" title={help} aria-label={help}>?</button>
        ) : null}
      </span>
    </div>
  );
}

function YesNoField({
  id,
  label,
  required,
  value,
  onChange,
}: {
  id: string;
  label: string;
  required?: boolean;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Field id={id} label={label} required={required}>
      <select id={id} className="location-yesno" value={value ? "yes" : "no"} onChange={event => onChange(event.target.value === "yes")}>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </Field>
  );
}

function Time24Input({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <input
      id={id}
      type="text"
      className="location-hours-time"
      inputMode="numeric"
      autoComplete="off"
      placeholder="00:00"
      title="24-hour format (HH:MM)"
      aria-label={label}
      disabled={disabled}
      maxLength={5}
      value={value}
      onChange={event => onChange(event.target.value)}
      onBlur={event => onChange(normalizeTime24(event.target.value))}
    />
  );
}

function HoursTable({
  hours,
  onChange,
}: {
  hours: WeekHours;
  onChange: (next: WeekHours) => void;
}) {
  return (
    <table className="location-hours">
      <thead>
        <tr>
          <th>Day of Week</th>
          <th>Open?</th>
          <th>From/To</th>
        </tr>
      </thead>
      <tbody>
        {WEEK_DAYS.map(day => (
          <tr key={day}>
            <td>{dayLabel(day)}</td>
            <td>
              <input
                type="checkbox"
                aria-label={`${dayLabel(day)} open`}
                checked={hours[day].open}
                onChange={event => onChange({
                  ...hours,
                  [day]: { ...hours[day], open: event.target.checked },
                })}
              />
            </td>
            <td className="location-hours-range">
              <Time24Input
                id={`hours-${day}-from`}
                label={`${dayLabel(day)} from`}
                value={hours[day].from}
                disabled={!hours[day].open}
                onChange={from => onChange({
                  ...hours,
                  [day]: { ...hours[day], from },
                })}
              />
              <span aria-hidden="true">-</span>
              <Time24Input
                id={`hours-${day}-to`}
                label={`${dayLabel(day)} to`}
                value={hours[day].to}
                disabled={!hours[day].open}
                onChange={to => onChange({
                  ...hours,
                  [day]: { ...hours[day], to },
                })}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LocationEditor({
  ims,
  locationId,
  onClose,
}: {
  ims: Ims;
  locationId: number | null;
  onClose: () => void;
}) {
  const draftKey = useRef(`draft-${Date.now()}`);
  const [section, setSection] = useState("general");
  const [record, setRecord] = useState<LocationRecord>(emptyLocation);
  const [baseline, setBaseline] = useState<LocationRecord>(emptyLocation);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(locationId != null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [finding, setFinding] = useState(false);
  const [editorSeed, setEditorSeed] = useState(0);

  useEffect(() => {
    if (locationId == null) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const result = await invokeLocationAction<{ location: LocationRecord }>(ims, "location-list", { locationId });
        if (cancelled) return;
        const next = locationFromResponse(result.location);
        setRecord(next);
        setBaseline(next);
        setEditorSeed(seed => seed + 1);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Unable to open the location.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ims, locationId]);

  function patch(partial: Partial<LocationRecord>) {
    setRecord(current => ({ ...current, ...partial }));
  }

  function leave() {
    const dirty = JSON.stringify(record) !== JSON.stringify(baseline);
    if (dirty && !window.confirm("Leave this location without saving?")) return;
    onClose();
  }

  function reset() {
    setRecord(baseline);
    setEditorSeed(seed => seed + 1);
    setMessage("");
  }

  async function upload(kind: ImageKind, file: File) {
    setUploading(true);
    setMessage("");
    try {
      const content = await fileToBase64(file);
      const uploaded = await invokeLocationAction<{ url: string }>(ims, "location-asset", {
        locationKey: record.locationId ? String(record.locationId) : draftKey.current,
        kind,
        contentType: file.type,
        content,
      });
      patch({ [kind]: uploaded.url });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload the image.");
    } finally {
      setUploading(false);
    }
  }

  async function findOnMap() {
    setFinding(true);
    setMessage("");
    try {
      const result = await invokeLocationAction<{ latitude: string; longitude: string }>(ims, "location-geocode", {
        country: countryName(record.country),
        state: regionName(record.country, record.state),
        city: record.city,
        street: record.street,
      });
      patch({
        latitude: result.latitude,
        longitude: result.longitude,
        zoom: record.zoom || "15",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to find that address on the map.");
    } finally {
      setFinding(false);
    }
  }

  async function save(stay: boolean) {
    const problem = clientError(record);
    if (problem) {
      setMessage(problem);
      setSection("general");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const result = await invokeLocationAction<{ location: LocationRecord }>(ims, "location-write", {
        locationId: record.locationId,
        fields: record,
      });
      const next = locationFromResponse(result.location);
      setRecord(next);
      setBaseline(next);
      setMessage("Location saved.");
      if (!stay) onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the location.");
    } finally {
      setSaving(false);
    }
  }

  const regions = regionsFor(record.country);
  const stateDisabled = regions.length === 0;
  const legacyCountryLabel = record.country && !COUNTRIES.some(country => country.code === record.country)
    ? countryName(record.country)
    : "";
  const countrySelectStyle = directorySelectStyle(countrySelectWidthCh(legacyCountryLabel));
  const stateSelectStyle = directorySelectStyle(stateSelectWidthCh(record.country));
  const busy = loading || saving || uploading;
  const hasPoint = Number.isFinite(Number(record.latitude)) && Number.isFinite(Number(record.longitude)) && record.latitude !== "" && record.longitude !== "";

  return (
    <main className="conditional-blocks block-edit-page location-edit-page">
      {busy ? <CommerceLoader /> : null}
      <SectionLayout
        heading={record.locationId == null ? "New Location" : "Edit Location"}
        navTitle="Location information"
        sections={locationSections}
        activeSectionId={section}
        onSectionChange={setSection}
        headerActions={(
          <div className="block-edit-actions">
            <button type="button" onClick={leave}>← Back</button>
            <button type="button" onClick={reset} disabled={busy}>Reset</button>
            <button type="button" onClick={() => void save(true)} disabled={busy}>Save and Continue Edit</button>
            <button type="button" className="admin-primary" onClick={() => void save(false)} disabled={busy}>Save Location</button>
          </div>
        )}
      >
        {message ? <p className="message" role="status">{message}</p> : null}
        {section === "general" ? (
          <section>
            <h2 className="block-edit-section-title">General Information</h2>
            <Field id="location-status" label="Status" required>
              <select id="location-status" className="location-yesno location-select-status" value={record.status} onChange={event => patch({ status: event.target.value === "disabled" ? "disabled" : "enabled" })}>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </Field>
            <ImageField id="location-logo" label="Logo" url={record.logo} disabled={uploading} onFile={file => void upload("logo", file)} />
            <Field id="location-title" label="Title" required>
              <input id="location-title" value={record.title} onChange={event => patch({ title: event.target.value })} />
            </Field>
            <Field id="location-store-url" label="Store URL">
              <span>
                <input id="location-store-url" value={record.storeUrl} onChange={event => patch({ storeUrl: event.target.value })} />
                <span className="field-hint">Url key for store view page. Example: some url key</span>
              </span>
            </Field>
            <Field id="location-country" label="Country" required>
              <select
                id="location-country"
                className="location-select-country location-select-directory"
                style={countrySelectStyle}
                value={record.country}
                onChange={event => {
                  const country = event.target.value;
                  const nextRegions = regionsFor(country);
                  patch({ country, state: nextRegions.some(region => region.id === record.state) ? record.state : "" });
                }}
              >
                {COUNTRIES.some(country => country.code === record.country) ? null : (
                  <option value={record.country}>{countryName(record.country)}</option>
                )}
                {COUNTRIES.map(country => (
                  <option key={country.code} value={country.code}>{country.name}</option>
                ))}
              </select>
            </Field>
            <Field id="location-state" label="State" required={regionRequired(record.country)}>
              <select
                id="location-state"
                className="location-select-state location-select-directory"
                style={stateSelectStyle}
                value={record.state}
                disabled={stateDisabled}
                onChange={event => patch({ state: event.target.value })}
              >
                <option value=""> </option>
                {record.state && !regions.some(region => region.id === record.state) ? (
                  <option value={record.state}>{regionName(record.country, record.state) || record.state}</option>
                ) : null}
                {regions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
              </select>
            </Field>
            <Field id="location-city" label="City" required>
              <input id="location-city" value={record.city} onChange={event => patch({ city: event.target.value })} />
            </Field>
            <Field id="location-street" label="Street" required>
              <input id="location-street" value={record.street} onChange={event => patch({ street: event.target.value })} />
            </Field>
            <Field id="location-zip" label="Zip">
              <input id="location-zip" value={record.zip} onChange={event => patch({ zip: event.target.value })} />
            </Field>
            <Field id="location-phone" label="Phone">
              <input id="location-phone" value={record.phone} onChange={event => patch({ phone: event.target.value })} />
            </Field>
            <Field id="location-email" label="Email">
              <input id="location-email" type="email" value={record.email} onChange={event => patch({ email: event.target.value })} />
            </Field>
            <Field id="location-website" label="Website url">
              <span>
                <input id="location-website" value={record.websiteUrl} onChange={event => patch({ websiteUrl: event.target.value })} />
                <label className="location-check">
                  <input type="checkbox" checked={record.openInNewTab} onChange={event => patch({ openInNewTab: event.target.checked })} />
                  Open in new tab
                </label>
              </span>
            </Field>
            <MultiField
              id="location-store-views"
              label="Store View"
              required
              options={STORE_VIEW_OPTIONS}
              value={record.storeViews}
              onChange={storeViews => patch({ storeViews })}
              help="Choose the store views that can show this location."
            />
            <Field id="location-description" label="Description">
              <textarea id="location-description" rows={4} value={record.description} onChange={event => patch({ description: event.target.value })} />
            </Field>
            <Field id="location-sort" label="Sort Order">
              <input id="location-sort" inputMode="numeric" value={record.sortOrder} onChange={event => patch({ sortOrder: event.target.value })} />
            </Field>
            <ImageField id="location-image" label="Location Image" url={record.locationImage} disabled={uploading} onFile={file => void upload("locationImage", file)} />
            <ImageField id="location-marker" label="Google Map Marker" url={record.mapMarker} disabled={uploading} onFile={file => void upload("mapMarker", file)} />
            <Field id="location-meta-title" label="Meta Title">
              <input id="location-meta-title" value={record.metaTitle} onChange={event => patch({ metaTitle: event.target.value })} />
            </Field>
            <Field id="location-meta-keywords" label="Meta Keywords">
              <input id="location-meta-keywords" value={record.metaKeywords} onChange={event => patch({ metaKeywords: event.target.value })} />
            </Field>
            <Field id="location-meta-description" label="Meta Description">
              <input id="location-meta-description" value={record.metaDescription} onChange={event => patch({ metaDescription: event.target.value })} />
            </Field>
            <YesNoField id="location-featured" label="Is Featured" required value={record.isFeatured} onChange={isFeatured => patch({ isFeatured })} />
          </section>
        ) : null}
        {section === "maps" ? (
          <section>
            <h2 className="block-edit-section-title">Google Maps Settings</h2>
            <Field id="location-zoom" label="Zoom">
              <input id="location-zoom" inputMode="decimal" value={record.zoom} onChange={event => patch({ zoom: event.target.value })} />
            </Field>
            <Field id="location-latitude" label="Latitude">
              <input id="location-latitude" inputMode="decimal" value={record.latitude} onChange={event => patch({ latitude: event.target.value })} />
            </Field>
            <Field id="location-longitude" label="Longitude">
              <input id="location-longitude" inputMode="decimal" value={record.longitude} onChange={event => patch({ longitude: event.target.value })} />
            </Field>
            <div className="field-row">
              <span />
              <span>
                <button type="button" className="location-map-button" disabled={finding} onClick={() => void findOnMap()}>
                  {finding ? "Finding…" : "Find Store on Map"}
                </button>
                <span className="field-hint">Find store location according to entered country, city and street address (General Information)</span>
              </span>
            </div>
            <div className="location-map">
              {hasPoint ? (
                <iframe title="Store map" src={mapSrc(record.latitude, record.longitude, record.zoom)} />
              ) : (
                <p>Enter a latitude and longitude, or use Find Store on Map.</p>
              )}
            </div>
          </section>
        ) : null}
        {section === "content" ? (
          <section>
            <h2 className="block-edit-section-title">Store Content</h2>
            <ImageField id="location-banner" label="Store Banner" url={record.storeBanner} disabled={uploading} onFile={file => void upload("storeBanner", file)} />
            <Field id="location-travel" label="Travel Suggestion">
              <textarea id="location-travel" rows={4} value={record.travelSuggestion} onChange={event => patch({ travelSuggestion: event.target.value })} />
            </Field>
            <MultiField id="location-services" label="Select Service" options={SERVICE_OPTIONS} value={record.services} onChange={services => patch({ services })} />
            <div className="field-row location-editor-row">
              <label htmlFor="location-store-content">Store Content</label>
              <HtmlEditor key={`content-${editorSeed}`} id="location-store-content" label="" hint="" value={record.storeContent} onChange={storeContent => patch({ storeContent })} />
            </div>
            <MultiField id="location-galleries" label="Select Gallery" options={GALLERY_OPTIONS} value={record.galleries} onChange={galleries => patch({ galleries })} />
            <Field id="location-gallery-title" label="Store Gallery Title">
              <input id="location-gallery-title" value={record.galleryTitle} onChange={event => patch({ galleryTitle: event.target.value })} />
            </Field>
            <div className="field-row location-editor-row">
              <label htmlFor="location-gallery-description">Store Gallery Description</label>
              <HtmlEditor key={`gallery-${editorSeed}`} id="location-gallery-description" label="" hint="" value={record.galleryDescription} onChange={galleryDescription => patch({ galleryDescription })} />
            </div>
            <MultiField id="location-team" label="Select Team Profile" options={TEAM_PROFILE_OPTIONS} value={record.teamProfiles} onChange={teamProfiles => patch({ teamProfiles })} />
            <div className="field-row location-editor-row">
              <label htmlFor="location-promotions">Store Promotions</label>
              <HtmlEditor key={`promotions-${editorSeed}`} id="location-promotions" label="" hint="" value={record.promotions} onChange={promotions => patch({ promotions })} />
            </div>
          </section>
        ) : null}
        {section === "store-hours" ? (
          <section>
            <h2 className="block-edit-section-title">Store Hours of Operation</h2>
            <YesNoField id="location-is-store" label="Is Store" value={record.isStore} onChange={isStore => patch({ isStore })} />
            <HoursTable hours={record.storeHours} onChange={storeHours => patch({ storeHours })} />
          </section>
        ) : null}
        {section === "cafe-hours" ? (
          <section>
            <h2 className="block-edit-section-title">Cafe Hours of Operation</h2>
            <YesNoField id="location-is-cafe" label="Is Cafe" value={record.isCafe} onChange={isCafe => patch({ isCafe })} />
            <HoursTable hours={record.cafeHours} onChange={cafeHours => patch({ cafeHours })} />
          </section>
        ) : null}
      </SectionLayout>
    </main>
  );
}
