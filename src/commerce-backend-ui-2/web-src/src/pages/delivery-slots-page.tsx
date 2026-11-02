import { useCallback, useEffect, useState } from "react";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import type { Ims } from "../app-types.ts";
import { invokeDeliverySlotAction } from "./delivery-slots-api.ts";
import "./delivery-slots.css";

type SlotRow = {
  startTime: string;
  endTime: string;
  maxUser: number;
  bookedCount: number;
};

type WeekdayConfig = Record<string, SlotRow[]>;

type RegularConfig = {
  storeViewCode: string;
  weekdays: WeekdayConfig;
};

type SpecialConfig = {
  enabled: boolean;
  orderStartDate: string;
  orderEndDate: string;
  categoryOffsets: Array<{ categoryId: string; offsetDays: number }>;
  weekdays: WeekdayConfig;
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

/** After API load: show saved rows only; empty days stay empty until Add. */
function weekdaysForUi(weekdays: WeekdayConfig): WeekdayConfig {
  const out: WeekdayConfig = {};
  for (const { key } of WEEKDAYS) {
    out[key] = completeSlotRows(weekdays[key] || []).map(row => ({ ...row }));
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

function displayMaxField(value: number): string {
  return value === 0 ? "" : String(value);
}

function parseNumericField(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : 0;
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

type WeekdayEditorProps = {
  weekdays: WeekdayConfig;
  disabled: boolean;
  onChange: (weekdays: WeekdayConfig) => void;
};

function WeekdaySlotsEditor({ weekdays, disabled, onChange }: WeekdayEditorProps) {
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
              <table className="admin__control-table lf-delivery-slot-grid">
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
                  {(weekdays[key] || []).map((row, index) => (
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
                        <input
                          type="text"
                          className="admin__control-text"
                          value={String(row.bookedCount)}
                          readOnly
                          disabled
                        />
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
                  ))}
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

export function DeliverySlotsPage({ ims }: Props) {
  const [activeSection, setActiveSection] = useState<(typeof NAV_ITEMS)[number]["id"]>("regular");
  const [regular, setRegular] = useState<RegularConfig | null>(null);
  const [special, setSpecial] = useState<SpecialConfig | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sectionExpanded, setSectionExpanded] = useState(true);

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
      setSpecial({ ...specialBody, weekdays: weekdaysForUi(specialBody.weekdays) });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load delivery slot config.");
    } finally {
      setLoading(false);
    }
  }, [ims]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

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
        categoryOffsets: special.categoryOffsets,
        weekdays: stripIncompleteSlotRows(special.weekdays),
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
        <div className="lf-delivery-config-scope">
          <strong>Scope</strong>
          <select disabled aria-label="Scope">
            <option>Default Config</option>
          </select>
        </div>
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
            <button
              type="button"
              className={`lf-delivery-section-toggle${sectionExpanded ? " is-expanded" : ""}`}
              aria-expanded={sectionExpanded}
              aria-controls="lf-delivery-section-fields"
              title={sectionExpanded ? "Collapse" : "Expand"}
              onClick={() => setSectionExpanded(open => !open)}
            >
              <span className="lf-delivery-section-toggle-icon" aria-hidden="true" />
              <span className="visually-hidden">{sectionExpanded ? "Collapse section" : "Expand section"}</span>
            </button>
          </div>
          {loading ? <CommerceLoader cover="content" /> : null}
          {status ? <p className="lf-delivery-config-message">{status}</p> : null}

          <div id="lf-delivery-section-fields" hidden={!sectionExpanded}>
          {activeSection === "regular" && regular ? (
            <WeekdaySlotsEditor
              weekdays={regular.weekdays}
              disabled={saving}
              onChange={weekdays => setRegular({ ...regular, weekdays })}
            />
          ) : null}

          {activeSection === "special" && special ? (
            <>
              <div className="lf-delivery-slots-special-meta">
                <label className="lf-field-checkbox-row">
                  <input
                    type="checkbox"
                    checked={special.enabled}
                    onChange={event => setSpecial({ ...special, enabled: event.target.checked })}
                    disabled={saving}
                  />
                  Special Events Delivery
                </label>
                <label>
                  Order Start Date
                  <input
                    type="date"
                    value={special.orderStartDate}
                    onChange={event => setSpecial({ ...special, orderStartDate: event.target.value })}
                    disabled={saving}
                  />
                </label>
                <label>
                  Order End Date
                  <input
                    type="date"
                    value={special.orderEndDate}
                    onChange={event => setSpecial({ ...special, orderEndDate: event.target.value })}
                    disabled={saving}
                  />
                </label>
              </div>
              <WeekdaySlotsEditor
                weekdays={special.weekdays}
                disabled={saving}
                onChange={weekdays => setSpecial({ ...special, weekdays })}
              />
            </>
          ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
