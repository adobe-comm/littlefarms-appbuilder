import { useCallback, useEffect, useState } from "react";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import type { Ims } from "../app-types.ts";
import { invokeRuntimeAction } from "../runtime-action.ts";
import { invokeDeliverySlotAction } from "./delivery-slots-api.ts";
import "./delivery-slots.css";

type SlotRow = {
  startTime: string;
  endTime: string;
  maxUser: number;
  bookedCount: number;
};

type SpecialSlotRow = SlotRow & {
  bookedByDate?: Record<string, number>;
  /** Raw admin booked_count text while editing (legacy DeliveryDaysOptions). */
  bookedText?: string;
};

type WeekdayConfig = Record<string, SlotRow[]>;
type SpecialWeekdayConfig = Record<string, SpecialSlotRow[]>;

type RegularConfig = {
  storeViewCode: string;
  weekdays: WeekdayConfig;
};

type SpecialConfig = {
  enabled: boolean;
  orderStartDate: string;
  orderEndDate: string;
  categoryOffsets: Array<{ categoryId: string; offsetDays: number }>;
  weekdays: SpecialWeekdayConfig;
};

type CategoryChoice = {
  id: string;
  label: string;
  name: string;
};

const WEEKDAYS: Array<{ key: string; label: string }> = [
  { key: "sunday", label: "Sunday" },
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
];

const NAV_ITEMS = [
  { id: "regular", label: "Delivery Time Slot" },
  { id: "special", label: "Special Events Delivery" },
] as const;

type Props = {
  ims: Ims;
};

const STORE_VIEW_CODE = "default";

function emptySlotRow(): SlotRow {
  return { startTime: "", endTime: "", maxUser: 0, bookedCount: 0 };
}

function completeSlotRows(rows: SlotRow[]): SlotRow[] {
  return rows.filter(row => row.startTime.trim() && row.endTime.trim());
}

function normalizeBookedByDate(value: unknown): Record<string, number> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, number>) };
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, number>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** After API load: show saved rows only; empty days stay empty until Add. */
function weekdaysForUi(weekdays: WeekdayConfig): WeekdayConfig {
  const out: WeekdayConfig = {};
  for (const { key } of WEEKDAYS) {
    out[key] = completeSlotRows(weekdays[key] || []).map(row => ({ ...row }));
  }
  return out;
}

function specialWeekdaysForUi(weekdays: SpecialWeekdayConfig): SpecialWeekdayConfig {
  const out: SpecialWeekdayConfig = {};
  for (const { key } of WEEKDAYS) {
    out[key] = completeSlotRows(weekdays[key] || []).map(row => {
      const legacyRow = row as SpecialSlotRow & { booked_count?: unknown };
      const bookedByDate =
        normalizeBookedByDate(legacyRow.bookedByDate ?? legacyRow.booked_count) ?? {};
      return {
        startTime: row.startTime,
        endTime: row.endTime,
        maxUser: Number(row.maxUser) || 0,
        bookedCount: 0,
        bookedByDate,
      };
    });
  }
  return out;
}

function stripIncompleteSlotRows(weekdays: WeekdayConfig): WeekdayConfig {
  const out: WeekdayConfig = {};
  for (const { key } of WEEKDAYS) {
    out[key] = (weekdays[key] || []).filter(row => row.startTime.trim() && row.endTime.trim());
  }
  return out;
}

function stripCategoryOffsets(rows: SpecialConfig["categoryOffsets"]) {
  return rows.filter(row => String(row.categoryId || "").trim());
}

function displayMaxField(value: number): string {
  return value === 0 ? "" : String(value);
}

function parseNumericField(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Match legacy CategoryOptions: skip Magento root names and use ` -> ` separators. */
function stripRootCatalogSegments(label: string | undefined): string[] {
  let parts = (label || "")
    .split(" / ")
    .map(part => part.trim())
    .filter(Boolean);
  while (
    parts.length > 1 &&
    (/^root catalog$/iu.test(parts[0]) || /^default category$/iu.test(parts[0]))
  ) {
    parts.shift();
  }
  return parts;
}

/** Legacy CategoryOptions: ancestor names with ` -> `, then leaf category name (no trailing arrow). */
function categorySelectLabel(category: CategoryChoice): string {
  const parts = stripRootCatalogSegments(category.label);
  const leaf = String(category.name || parts[parts.length - 1] || category.id || "").trim();
  if (!leaf) {
    return "";
  }
  if (parts.length <= 1) {
    return leaf;
  }
  const ancestors = parts.slice(0, -1);
  if (ancestors.length === 0) {
    return leaf;
  }
  return `${ancestors.join(" -> ")} -> ${leaf}`;
}

function bookedByDateForSave(row: SpecialSlotRow): Record<string, number> {
  if (row.bookedText != null) {
    const trimmed = row.bookedText.trim();
    if (!trimmed || trimmed === "0") {
      return {};
    }
    return normalizeBookedByDate(trimmed) ?? {};
  }
  return row.bookedByDate ?? {};
}

/** Legacy special delivery stores booked_count as JSON (date → count), shown as raw text in admin. */
function displaySpecialBookedCount(row: SpecialSlotRow): string {
  if (row.bookedText != null) {
    return row.bookedText;
  }
  const map = normalizeBookedByDate(row.bookedByDate);
  if (map && Object.keys(map).length > 0) {
    return JSON.stringify(map);
  }
  return "";
}

function prepareSpecialWeekdaysForSave(weekdays: SpecialWeekdayConfig): SpecialWeekdayConfig {
  const out: SpecialWeekdayConfig = {};
  for (const { key } of WEEKDAYS) {
    out[key] = stripIncompleteSlotRows(weekdays[key] || []).map(row => {
      const special = row as SpecialSlotRow;
      const { bookedText: _bookedText, bookedCount: _bookedCount, ...rest } = special;
      return {
        ...rest,
        bookedByDate: bookedByDateForSave(special),
      };
    });
  }
  return out;
}

function displayBookedValue(row: SpecialSlotRow, mode: "regular" | "special"): string {
  if (mode === "special") {
    return displaySpecialBookedCount(row);
  }
  return String(row.bookedCount ?? 0);
}

function DeleteRowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}

type SectionToggleProps = {
  expanded: boolean;
  controlsId: string;
  onToggle: () => void;
};

function SectionToggle({ expanded, controlsId, onToggle }: SectionToggleProps) {
  return (
    <button
      type="button"
      className={`lf-delivery-section-toggle${expanded ? " is-expanded" : ""}`}
      aria-expanded={expanded}
      aria-controls={controlsId}
      title={expanded ? "Collapse" : "Expand"}
      onClick={onToggle}
    >
      <span className="lf-delivery-section-toggle-icon" aria-hidden="true" />
      <span className="visually-hidden">{expanded ? "Collapse section" : "Expand section"}</span>
    </button>
  );
}

type SubsectionHeaderRowProps = {
  title: string;
  panelId: string;
  expanded: boolean;
  onToggle: () => void;
};

function SubsectionHeaderRow({ title, panelId, expanded, onToggle }: SubsectionHeaderRowProps) {
  return (
    <tr className="lf-delivery-subsection-header-row">
      <td className="label lf-delivery-subsection-title-cell" colSpan={2}>
        <div className="lf-delivery-subsection-bar">
          <SectionToggle expanded={expanded} controlsId={panelId} onToggle={onToggle} />
          <span id={`${panelId}-heading`} className="lf-delivery-subsection-title">
            {title}
          </span>
        </div>
      </td>
    </tr>
  );
}

type WeekdayEditorProps = {
  weekdays: WeekdayConfig;
  disabled: boolean;
  bookedMode: "regular" | "special";
  onChange: (weekdays: WeekdayConfig) => void;
};

function WeekdaySlotsEditor({ weekdays, disabled, bookedMode, onChange }: WeekdayEditorProps) {
  function updateRow(dayKey: string, index: number, field: keyof SlotRow, value: string) {
    const rows = [...(weekdays[dayKey] || [])];
    const row = { ...rows[index] };
    if (field === "maxUser" || field === "bookedCount") {
      row[field] = parseNumericField(value);
    } else {
      row[field] = value;
    }
    rows[index] = row;
    onChange({ ...weekdays, [dayKey]: rows });
  }

  function addRow(dayKey: string) {
    const current = weekdays[dayKey] || [];
    onChange({ ...weekdays, [dayKey]: [...current, emptySlotRow()] });
  }

  function removeRow(dayKey: string, index: number) {
    const rows = (weekdays[dayKey] || []).filter((_, i) => i !== index);
    onChange({ ...weekdays, [dayKey]: rows });
  }

  function updateSpecialBooked(dayKey: string, index: number, value: string) {
    const rows = [...(weekdays[dayKey] || [])];
    const row: SpecialSlotRow = { ...(rows[index] as SpecialSlotRow), bookedText: value };
    rows[index] = row;
    onChange({ ...weekdays, [dayKey]: rows });
  }

  return (
    <table className="form-list lf-delivery-config-form">
      <tbody>
        {WEEKDAYS.map(({ key, label }) => (
          <tr key={key} className="lf-delivery-slots-field-row">
            <td className="label">
              <label>{label}</label>
              <p className="note lf-delivery-slots-scope-tag">[global]</p>
            </td>
            <td className="value">
              <div className="lf-delivery-slots-array-panel">
                <table
                  className={`admin__control-table lf-delivery-slot-grid${bookedMode === "special" ? " lf-delivery-slot-grid--special" : ""}`}
                >
                  <thead>
                    <tr>
                      <th>Start Time</th>
                      <th>End Time</th>
                      <th>Max</th>
                      <th>Booked</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(weekdays[key] || []).map((row, index) => {
                      const bookedDisplay = displayBookedValue(row as SpecialSlotRow, bookedMode);
                      return (
                      <tr key={`${key}-${index}`}>
                        <td>
                          <input
                            type="text"
                            className="admin__control-text"
                            value={row.startTime}
                            onChange={event => updateRow(key, index, "startTime", event.target.value)}
                            disabled={disabled}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="admin__control-text"
                            value={row.endTime}
                            onChange={event => updateRow(key, index, "endTime", event.target.value)}
                            disabled={disabled}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="admin__control-text"
                            inputMode="numeric"
                            value={displayMaxField(row.maxUser)}
                            onChange={event => updateRow(key, index, "maxUser", event.target.value)}
                            disabled={disabled}
                          />
                        </td>
                        <td>
                          {bookedMode === "special" ? (
                            <input
                              type="text"
                              className="admin__control-text lf-delivery-special-booked"
                              value={bookedDisplay}
                              disabled={disabled}
                              onChange={event =>
                                updateSpecialBooked(key, index, event.target.value)
                              }
                              title={bookedDisplay ? bookedDisplay : undefined}
                            />
                          ) : (
                            <input
                              type="text"
                              className="admin__control-text"
                              value={bookedDisplay}
                              readOnly
                              disabled
                            />
                          )}
                        </td>
                        <td className="lf-delivery-slots-action-cell">
                          <button
                            type="button"
                            className="lf-delivery-slots-delete"
                            title="Delete row"
                            disabled={disabled}
                            onClick={() => removeRow(key, index)}
                          >
                            <DeleteRowIcon />
                            <span className="visually-hidden">Delete</span>
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button
                  type="button"
                  className="action-add lf-delivery-slots-add-row"
                  onClick={() => addRow(key)}
                  disabled={disabled}
                >
                  Add
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type CategoryOffsetEditorProps = {
  rows: SpecialConfig["categoryOffsets"];
  categories: CategoryChoice[];
  disabled: boolean;
  onChange: (rows: SpecialConfig["categoryOffsets"]) => void;
};

function CategoryOffsetEditor({ rows, categories, disabled, onChange }: CategoryOffsetEditorProps) {
  function updateRow(index: number, patch: Partial<SpecialConfig["categoryOffsets"][number]>) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  }

  function addRow() {
    onChange([...rows, { categoryId: "", offsetDays: 0 }]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="lf-delivery-slots-array-panel">
      <table className="admin__control-table lf-delivery-category-offset-grid">
        <colgroup>
          <col className="lf-delivery-category-col-category" />
          <col className="lf-delivery-category-col-offset" />
          <col className="lf-delivery-category-col-action" />
        </colgroup>
        <thead>
          <tr>
            <th>Special Event Category</th>
            <th>Delivery Offset (Days)</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const selectedCategory = categories.find(category => category.id === row.categoryId);
            const selectedTitle = selectedCategory
              ? categorySelectLabel(selectedCategory)
              : row.categoryId
                ? `Category #${row.categoryId}`
                : undefined;

            return (
            <tr key={`category-offset-${index}`}>
              <td>
                <select
                  className="admin__control-select lf-delivery-category-select"
                  value={row.categoryId}
                  disabled={disabled}
                  title={selectedTitle}
                  onChange={event => updateRow(index, { categoryId: event.target.value })}
                >
                  <option value=""> </option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {categorySelectLabel(category)}
                    </option>
                  ))}
                  {row.categoryId &&
                  !categories.some(category => category.id === row.categoryId) ? (
                    <option value={row.categoryId}>Category #{row.categoryId}</option>
                  ) : null}
                </select>
              </td>
              <td>
                <input
                  type="text"
                  className="admin__control-text"
                  inputMode="numeric"
                  value={displayMaxField(row.offsetDays)}
                  disabled={disabled}
                  onChange={event =>
                    updateRow(index, { offsetDays: parseNumericField(event.target.value) })
                  }
                />
              </td>
              <td className="lf-delivery-slots-action-cell">
                <button
                  type="button"
                  className="lf-delivery-slots-delete"
                  title="Delete row"
                  disabled={disabled}
                  onClick={() => removeRow(index)}
                >
                  <DeleteRowIcon />
                  <span className="visually-hidden">Delete</span>
                </button>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        className="action-add lf-delivery-slots-add-row"
        onClick={addRow}
        disabled={disabled}
      >
        Add Row
      </button>
    </div>
  );
}

type SpecialEventsSettingsProps = {
  special: SpecialConfig;
  categories: CategoryChoice[];
  saving: boolean;
  categoryGroupExpanded: boolean;
  timeslotGroupExpanded: boolean;
  onCategoryGroupToggle: () => void;
  onTimeslotGroupToggle: () => void;
  onChange: (special: SpecialConfig) => void;
};

function SpecialEventsSettings({
  special,
  categories,
  saving,
  categoryGroupExpanded,
  timeslotGroupExpanded,
  onCategoryGroupToggle,
  onTimeslotGroupToggle,
  onChange,
}: SpecialEventsSettingsProps) {
  return (
    <>
      <table className="form-list lf-delivery-config-form lf-delivery-special-settings">
        <tbody>
          <tr>
            <td className="label">
              <label htmlFor="lf-special-enabled">Special Events Delivery</label>
              <p className="note lf-delivery-slots-scope-tag">[global]</p>
            </td>
            <td className="value">
              <select
                id="lf-special-enabled"
                className="admin__control-select"
                value={special.enabled ? "1" : "0"}
                disabled={saving}
                onChange={event =>
                  onChange({ ...special, enabled: event.target.value === "1" })
                }
              >
                <option value="0">Disable</option>
                <option value="1">Enable</option>
              </select>
            </td>
          </tr>
          <tr>
            <td className="label">
              <label htmlFor="lf-special-order-start">Order Start Date</label>
              <p className="note lf-delivery-slots-scope-tag">[global]</p>
            </td>
            <td className="value">
              <input
                id="lf-special-order-start"
                type="date"
                className="admin__control-text"
                value={special.orderStartDate}
                disabled={saving}
                onChange={event => onChange({ ...special, orderStartDate: event.target.value })}
              />
            </td>
          </tr>
          <tr>
            <td className="label">
              <label htmlFor="lf-special-order-end">Order End Date</label>
              <p className="note lf-delivery-slots-scope-tag">[global]</p>
            </td>
            <td className="value">
              <input
                id="lf-special-order-end"
                type="date"
                className="admin__control-text"
                value={special.orderEndDate}
                disabled={saving}
                onChange={event => onChange({ ...special, orderEndDate: event.target.value })}
              />
            </td>
          </tr>

          <SubsectionHeaderRow
            title="Delivery Days and Category"
            panelId="lf-special-category-fields"
            expanded={categoryGroupExpanded}
            onToggle={onCategoryGroupToggle}
          />
          {categoryGroupExpanded ? (
            <tr className="lf-delivery-subsection-content-row">
              <td className="label lf-delivery-subsection-label-spacer" aria-hidden="true" />
              <td className="value">
                <div id="lf-special-category-fields">
                  <CategoryOffsetEditor
                    rows={
                      special.categoryOffsets.length
                        ? special.categoryOffsets
                        : [{ categoryId: "", offsetDays: 0 }]
                    }
                    categories={categories}
                    disabled={saving}
                    onChange={categoryOffsets => onChange({ ...special, categoryOffsets })}
                  />
                </div>
              </td>
            </tr>
          ) : null}

          <SubsectionHeaderRow
            title="Delivery Time Slot"
            panelId="lf-special-timeslot-fields"
            expanded={timeslotGroupExpanded}
            onToggle={onTimeslotGroupToggle}
          />
        </tbody>
      </table>

      {timeslotGroupExpanded ? (
        <div id="lf-special-timeslot-fields">
          <WeekdaySlotsEditor
            weekdays={special.weekdays}
            disabled={saving}
            bookedMode="special"
            onChange={weekdays => onChange({ ...special, weekdays: weekdays as SpecialWeekdayConfig })}
          />
        </div>
      ) : null}
    </>
  );
}

export function DeliverySlotsPage({ ims }: Props) {
  const [activeSection, setActiveSection] = useState<(typeof NAV_ITEMS)[number]["id"]>("regular");
  const [regular, setRegular] = useState<RegularConfig | null>(null);
  const [special, setSpecial] = useState<SpecialConfig | null>(null);
  const [categories, setCategories] = useState<CategoryChoice[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sectionExpanded, setSectionExpanded] = useState(true);
  const [categoryGroupExpanded, setCategoryGroupExpanded] = useState(true);
  const [timeslotGroupExpanded, setTimeslotGroupExpanded] = useState(true);

  const pageTitle =
    activeSection === "regular" ? "Delivery Time Slot" : "Special Events Delivery";

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      const [regularBody, specialBody] = await Promise.all([
        invokeDeliverySlotAction<RegularConfig>(ims, {
          operation: "regular-get",
          storeViewCode: STORE_VIEW_CODE,
        }),
        invokeDeliverySlotAction<SpecialConfig>(ims, {
          operation: "special-get",
          storeViewCode: STORE_VIEW_CODE,
        }),
      ]);
      setRegular({ ...regularBody, weekdays: weekdaysForUi(regularBody.weekdays) });
      setSpecial({
        ...specialBody,
        categoryOffsets: specialBody.categoryOffsets?.length ? specialBody.categoryOffsets : [],
        weekdays: specialWeekdaysForUi(specialBody.weekdays),
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load delivery slot config.");
    } finally {
      setLoading(false);
    }
  }, [ims]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    void invokeRuntimeAction<{ categories?: CategoryChoice[] }>(ims, "block-metadata", {
      resource: "categories",
    })
      .then(payload => setCategories(payload.categories || []))
      .catch(() => setCategories([]));
  }, [ims]);

  async function saveActiveSection() {
    if (activeSection === "regular") {
      await saveRegular();
    } else {
      await saveSpecial();
    }
  }

  async function saveRegular() {
    if (!regular) return;
    setSaving(true);
    setStatus("");
    try {
      await invokeDeliverySlotAction(ims, {
        operation: "regular-write",
        storeViewCode: STORE_VIEW_CODE,
        weekdays: stripIncompleteSlotRows(regular.weekdays),
      });
      setStatus("You saved the configuration.");
      await loadConfigs();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSpecial() {
    if (!special) return;
    setSaving(true);
    setStatus("");
    try {
      await invokeDeliverySlotAction(ims, {
        operation: "special-write",
        storeViewCode: STORE_VIEW_CODE,
        enabled: special.enabled,
        orderStartDate: special.orderStartDate,
        orderEndDate: special.orderEndDate,
        categoryOffsets: stripCategoryOffsets(special.categoryOffsets),
        weekdays: prepareSpecialWeekdaysForSave(special.weekdays),
      });
      setStatus("You saved the configuration.");
      await loadConfigs();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="lf-delivery-config-page">
      <div className="lf-delivery-config-sticky">
        <button
          type="button"
          className="admin-primary"
          onClick={() => void saveActiveSection()}
          disabled={loading || saving}
        >
          Save Config
        </button>
      </div>

      <div className="lf-delivery-config-body">
        <nav className="lf-delivery-config-nav" aria-label="Little Farms configuration">
          <p className="lf-delivery-config-nav-title">Little Farms</p>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeSection ? "active" : ""}
              onClick={() => setActiveSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <main className="lf-delivery-config-main">
          <div className="lf-delivery-section-bar">
            <h1 id="lf-delivery-section-title">{pageTitle}</h1>
            {activeSection === "regular" ? (
              <SectionToggle
                expanded={sectionExpanded}
                controlsId="lf-delivery-section-fields"
                onToggle={() => setSectionExpanded(open => !open)}
              />
            ) : null}
          </div>
          {loading ? <CommerceLoader cover="content" /> : null}
          {status ? <p className="lf-delivery-config-message">{status}</p> : null}

          <div
            id="lf-delivery-section-fields"
            hidden={activeSection === "regular" && !sectionExpanded}
          >
            {activeSection === "regular" && regular ? (
              <WeekdaySlotsEditor
                weekdays={regular.weekdays}
                disabled={saving}
                bookedMode="regular"
                onChange={weekdays => setRegular({ ...regular, weekdays })}
              />
            ) : null}

            {activeSection === "special" && special ? (
              <SpecialEventsSettings
                special={special}
                categories={categories}
                saving={saving}
                categoryGroupExpanded={categoryGroupExpanded}
                timeslotGroupExpanded={timeslotGroupExpanded}
                onCategoryGroupToggle={() => setCategoryGroupExpanded(open => !open)}
                onTimeslotGroupToggle={() => setTimeslotGroupExpanded(open => !open)}
                onChange={setSpecial}
              />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
