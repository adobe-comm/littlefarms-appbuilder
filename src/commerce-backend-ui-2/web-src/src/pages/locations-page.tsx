import { useCallback, useEffect, useRef, useState } from "react";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { LocationEditor } from "./locations-form.tsx";
import { countryName } from "./locations-directory.ts";
import { invokeLocationAction } from "./locations-api.ts";
import {
  emptyLocationFilters,
  locationFilterLabels,
  locationPageSizes,
  type LocationFilters,
  type LocationListResponse,
  type LocationStatus,
  type StoreLocation,
} from "./locations-types.ts";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

type MassOperation = "delete" | "enable" | "disable";

const locationColumns = [
  { id: "select", label: "Select" },
  { id: "id", label: "ID" },
  { id: "title", label: "Title" },
  { id: "storeView", label: "Store View" },
  { id: "country", label: "Country" },
  { id: "city", label: "City" },
  { id: "street", label: "Street" },
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "websiteUrl", label: "Website url" },
  { id: "zip", label: "Zip" },
  { id: "status", label: "Status" },
  { id: "action", label: "Action" },
] as const;

type LocationColumnId = (typeof locationColumns)[number]["id"];

const defaultColumns = (): Record<LocationColumnId, boolean> => ({
  select: true,
  id: true,
  title: true,
  storeView: true,
  country: true,
  city: true,
  street: true,
  phone: true,
  email: true,
  websiteUrl: true,
  zip: true,
  status: true,
  action: true,
});

const exportColumns = locationColumns.filter(column => column.id !== "select" && column.id !== "action");

function statusLabel(status: LocationStatus): string {
  return status === "disabled" ? "Disabled" : "Enabled";
}

function cellValue(item: StoreLocation, columnId: (typeof exportColumns)[number]["id"]): string {
  switch (columnId) {
    case "id": return String(item.locationId);
    case "title": return item.title;
    case "storeView": return item.storeViewLabel;
    case "country": return countryName(item.country);
    case "city": return item.city;
    case "street": return item.street;
    case "phone": return item.phone;
    case "email": return item.email;
    case "websiteUrl": return item.websiteUrl;
    case "zip": return item.zip;
    case "status": return statusLabel(item.status);
    default: return "";
  }
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function massMessage(operation: MassOperation, affected: number): string {
  if (operation === "delete") return `A total of ${affected} record(s) have been deleted.`;
  if (operation === "disable") return `A total of ${affected} record(s) have been disabled.`;
  return `A total of ${affected} record(s) have been enabled.`;
}

export function LocationStoresPage({ ims }: { ims: Ims }) {
  const [items, setItems] = useState<StoreLocation[]>([]);
  const [total, setTotal] = useState(0);
  const [countries, setCountries] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof locationPageSizes)[number]>(20);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [massOpen, setMassOpen] = useState(false);
  const [openActionId, setOpenActionId] = useState<number | null>(null);
  const [visibleColumns, setVisibleColumns] = useState(defaultColumns);
  const [columnSnapshot, setColumnSnapshot] = useState(defaultColumns);
  const [filterDraft, setFilterDraft] = useState<LocationFilters>(emptyLocationFilters);
  const [appliedFilters, setAppliedFilters] = useState<LocationFilters>(emptyLocationFilters);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [formIntent, setFormIntent] = useState<"create" | number | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async (
    nextPage: number,
    nextPageSize: number,
    nextSortDir: "asc" | "desc",
    filters: LocationFilters,
  ) => {
    setLoading(true);
    try {
      const result = await invokeLocationAction<LocationListResponse>(ims, "location-list", {
        page: nextPage,
        pageSize: nextPageSize,
        sortDir: nextSortDir,
        ...filters,
      });
      setItems(result.items || []);
      setTotal(result.total || 0);
      setPage(result.page || nextPage);
      setCountries(result.countries || []);
      setMessage(current => current === "Unable to load locations." ? "" : current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load locations.");
    } finally {
      setLoading(false);
    }
  }, [ims]);

  useEffect(() => {
    void loadList(page, pageSize, sortDir, appliedFilters);
  }, [loadList, page, pageSize, sortDir, appliedFilters]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-grid-menu]")) return;
      setColumnsOpen(false);
      setViewOpen(false);
      setExportOpen(false);
      setMassOpen(false);
      setOpenActionId(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const visibleColumnCount = locationColumns.filter(column => visibleColumns[column.id]).length;
  const activeFilters = locationFilterLabels(appliedFilters);
  const pageIds = items.map(item => item.locationId);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));
  const somePageSelected = pageIds.some(id => selected.has(id));
  const shownColumnCount = Math.max(visibleColumnCount, 1);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected && !allPageSelected;
    }
  }, [somePageSelected, allPageSelected]);

  function closeMenus() {
    setColumnsOpen(false);
    setViewOpen(false);
    setExportOpen(false);
    setMassOpen(false);
    setOpenActionId(null);
  }

  function resetView() {
    setVisibleColumns(defaultColumns());
    setColumnSnapshot(defaultColumns());
    setFilterDraft(emptyLocationFilters());
    setAppliedFilters(emptyLocationFilters());
    setPageSize(20);
    setSortDir("desc");
    setPage(1);
    setSelected(new Set());
    setViewOpen(false);
  }

  async function exportCsv() {
    setExportOpen(false);
    setMessage("");
    try {
      const result = await invokeLocationAction<LocationListResponse>(ims, "location-list", {
        exportAll: true,
        sortDir,
        ...appliedFilters,
      });
      const columns = exportColumns.filter(column => visibleColumns[column.id]);
      const lines = [
        columns.map(column => csvEscape(column.label)).join(","),
        ...(result.items || []).map(item => columns.map(column => csvEscape(cellValue(item, column.id))).join(",")),
      ];
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "locations.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to export locations.");
    }
  }

  async function runMass(operation: MassOperation, ids: number[]) {
    closeMenus();
    if (!ids.length) {
      setMessage("You haven't selected any items!");
      return;
    }
    if (operation === "delete") {
      const confirmed = window.confirm(ids.length === 1
        ? "Are you sure you want to delete this location?"
        : "Are you sure you want to delete the selected locations?");
      if (!confirmed) return;
    }
    setMessage("");
    setLoading(true);
    try {
      const result = await invokeLocationAction<{ affected: number }>(ims, "location-mass", { operation, ids });
      setSelected(new Set());
      setMessage(massMessage(operation, result.affected || 0));
      await loadList(page, pageSize, sortDir, appliedFilters);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update locations.");
      setLoading(false);
    }
  }

  function togglePage(checked: boolean) {
    setSelected(current => {
      const next = new Set(current);
      for (const id of pageIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  if (formIntent !== null) {
    return (
      <LocationEditor
        ims={ims}
        locationId={formIntent === "create" ? null : formIntent}
        onClose={() => {
          setFormIntent(null);
          void loadList(page, pageSize, sortDir, appliedFilters);
        }}
      />
    );
  }

  return (
    <main className="conditional-blocks admin-list locations-page">
      <header className="admin-list-header">
        <h1>Stores</h1>
      </header>
      <div className="admin-list-band">
        <button type="button" className="admin-primary" onClick={() => setFormIntent("create")}>
          Add New Location
        </button>
      </div>
      <div className="admin-list-body">
        {message ? <p className="message" role="status">{message}</p> : null}
        <section className="admin-grid-card">
          {activeFilters.length > 0 ? (
            <div className="admin-active-filters">
              <span>Active filters:</span>
              {activeFilters.map(label => (
                <span key={label} className="admin-filter-chip">{label}</span>
              ))}
              <button
                type="button"
                className="admin-clear"
                onClick={() => {
                  setFilterDraft(emptyLocationFilters());
                  setAppliedFilters(emptyLocationFilters());
                  setSelected(new Set());
                  setPage(1);
                }}
              >
                Clear all
              </button>
            </div>
          ) : null}
          <div className="admin-search-row locations-tools-row">
            <div className="admin-grid-tools">
              <button
                type="button"
                className={filtersOpen ? "admin-filters-toggle open" : "admin-filters-toggle"}
                aria-expanded={filtersOpen}
                onClick={() => {
                  setFilterDraft(appliedFilters);
                  setFiltersOpen(open => !open);
                  closeMenus();
                }}
              >
                Filters
              </button>
              <div className="admin-columns" data-grid-menu="">
                <button
                  type="button"
                  className={viewOpen ? "admin-view-toggle open" : "admin-view-toggle"}
                  aria-expanded={viewOpen}
                  onClick={() => {
                    setViewOpen(open => !open);
                    setColumnsOpen(false);
                    setExportOpen(false);
                    setMassOpen(false);
                    setOpenActionId(null);
                  }}
                >
                  Default View
                </button>
                {viewOpen ? (
                  <div className="admin-action-menu admin-bookmark-menu" role="menu">
                    <button type="button" role="menuitem" onClick={resetView}>Default View</button>
                  </div>
                ) : null}
              </div>
              <div className="admin-columns" data-grid-menu="">
                <button
                  type="button"
                  className={columnsOpen ? "admin-columns-toggle open" : "admin-columns-toggle"}
                  aria-expanded={columnsOpen}
                  onClick={() => {
                    setColumnsOpen(open => {
                      if (!open) setColumnSnapshot(visibleColumns);
                      return !open;
                    });
                    setViewOpen(false);
                    setExportOpen(false);
                    setMassOpen(false);
                    setOpenActionId(null);
                  }}
                >
                  Columns
                </button>
                {columnsOpen ? (
                  <div className="admin-columns-menu" role="dialog" aria-label="Columns">
                    <p className="admin-columns-count">{visibleColumnCount} out of {locationColumns.length} visible</p>
                    <div className="admin-columns-list">
                      {locationColumns.map(column => (
                        <label key={column.id}>
                          <input
                            type="checkbox"
                            checked={visibleColumns[column.id]}
                            onChange={() => setVisibleColumns(current => ({ ...current, [column.id]: !current[column.id] }))}
                          />
                          {column.label}
                        </label>
                      ))}
                    </div>
                    <div className="admin-columns-actions">
                      <button type="button" className="admin-clear" onClick={() => setVisibleColumns(defaultColumns())}>Reset</button>
                      <button
                        type="button"
                        className="admin-clear"
                        onClick={() => {
                          setVisibleColumns(columnSnapshot);
                          setColumnsOpen(false);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="admin-columns" data-grid-menu="">
                <button
                  type="button"
                  className={exportOpen ? "admin-export-toggle open" : "admin-export-toggle"}
                  aria-expanded={exportOpen}
                  onClick={() => {
                    setExportOpen(open => !open);
                    setColumnsOpen(false);
                    setViewOpen(false);
                    setMassOpen(false);
                    setOpenActionId(null);
                  }}
                >
                  Export
                </button>
                {exportOpen ? (
                  <div className="admin-action-menu admin-bookmark-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => void exportCsv()}>CSV</button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {filtersOpen ? (
            <form
              className="admin-filter-panel"
              onSubmit={event => {
                event.preventDefault();
                setAppliedFilters(filterDraft);
                setSelected(new Set());
                setPage(1);
              }}
            >
              <div className="admin-filter-col">
                <span className="admin-filter-name">ID</span>
                <label>
                  from
                  <input
                    inputMode="numeric"
                    value={filterDraft.idFrom}
                    onChange={event => setFilterDraft(current => ({ ...current, idFrom: event.target.value }))}
                  />
                </label>
                <label>
                  to
                  <input
                    inputMode="numeric"
                    value={filterDraft.idTo}
                    onChange={event => setFilterDraft(current => ({ ...current, idTo: event.target.value }))}
                  />
                </label>
              </div>
              <div className="admin-filter-col">
                <span className="admin-filter-name">Title</span>
                <label>
                  <span className="sr-only">Title</span>
                  <input
                    value={filterDraft.title}
                    onChange={event => setFilterDraft(current => ({ ...current, title: event.target.value }))}
                  />
                </label>
              </div>
              <div className="admin-filter-col">
                <span className="admin-filter-name">Country</span>
                <label>
                  <span className="sr-only">Country</span>
                  <select
                    value={filterDraft.country}
                    onChange={event => setFilterDraft(current => ({ ...current, country: event.target.value }))}
                  >
                    <option value=""> </option>
                    {countries.map(country => (
                      <option key={country} value={country}>{countryName(country)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="admin-filter-col">
                <span className="admin-filter-name">City</span>
                <label>
                  <span className="sr-only">City</span>
                  <input
                    value={filterDraft.city}
                    onChange={event => setFilterDraft(current => ({ ...current, city: event.target.value }))}
                  />
                </label>
              </div>
              <div className="admin-filter-col">
                <span className="admin-filter-name">Street</span>
                <label>
                  <span className="sr-only">Street</span>
                  <input
                    value={filterDraft.street}
                    onChange={event => setFilterDraft(current => ({ ...current, street: event.target.value }))}
                  />
                </label>
              </div>
              <div className="admin-filter-col">
                <span className="admin-filter-name">Phone</span>
                <label>
                  <span className="sr-only">Phone</span>
                  <input
                    value={filterDraft.phone}
                    onChange={event => setFilterDraft(current => ({ ...current, phone: event.target.value }))}
                  />
                </label>
              </div>
              <div className="admin-filter-col">
                <span className="admin-filter-name">Email</span>
                <label>
                  <span className="sr-only">Email</span>
                  <input
                    value={filterDraft.email}
                    onChange={event => setFilterDraft(current => ({ ...current, email: event.target.value }))}
                  />
                </label>
              </div>
              <div className="admin-filter-col">
                <span className="admin-filter-name">Website url</span>
                <label>
                  <span className="sr-only">Website url</span>
                  <input
                    value={filterDraft.websiteUrl}
                    onChange={event => setFilterDraft(current => ({ ...current, websiteUrl: event.target.value }))}
                  />
                </label>
              </div>
              <div className="admin-filter-col">
                <span className="admin-filter-name">Zip</span>
                <label>
                  <span className="sr-only">Zip</span>
                  <input
                    value={filterDraft.zip}
                    onChange={event => setFilterDraft(current => ({ ...current, zip: event.target.value }))}
                  />
                </label>
              </div>
              <div className="admin-filter-col">
                <span className="admin-filter-name">Status</span>
                <label>
                  <span className="sr-only">Status</span>
                  <select
                    value={filterDraft.status}
                    onChange={event => setFilterDraft(current => ({ ...current, status: event.target.value as LocationFilters["status"] }))}
                  >
                    <option value=""> </option>
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
              </div>
              <div className="admin-filter-actions">
                <button
                  type="button"
                  className="admin-clear"
                  onClick={() => {
                    setFilterDraft(appliedFilters);
                    setFiltersOpen(false);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="admin-apply-filters">Apply Filters</button>
              </div>
            </form>
          ) : null}
          <div className="admin-grid-toolbar">
            <div className="admin-grid-toolbar-start">
              <div className="admin-mass" data-grid-menu="">
                <button
                  type="button"
                  className={massOpen ? "admin-mass-toggle open" : "admin-mass-toggle"}
                  aria-expanded={massOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setMassOpen(open => !open);
                    setColumnsOpen(false);
                    setViewOpen(false);
                    setExportOpen(false);
                    setOpenActionId(null);
                  }}
                >
                  Actions
                </button>
                {massOpen ? (
                  <div className="admin-action-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => void runMass("delete", [...selected])}>Delete</button>
                    <button type="button" role="menuitem" onClick={() => void runMass("enable", [...selected])}>Enable</button>
                    <button type="button" role="menuitem" onClick={() => void runMass("disable", [...selected])}>Disable</button>
                  </div>
                ) : null}
              </div>
              <span className="admin-record-count">{total} records found</span>
            </div>
            <div className="admin-pager">
              <label>
                <select
                  value={pageSize}
                  aria-label="Records per page"
                  onChange={event => {
                    setPageSize(Number(event.target.value) as (typeof locationPageSizes)[number]);
                    setPage(1);
                  }}
                >
                  {locationPageSizes.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                <span>per page</span>
              </label>
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(current => current - 1)} aria-label="Previous page">‹</button>
              <input
                key={page}
                aria-label="Current page"
                defaultValue={page}
                onBlur={event => {
                  const next = Number(event.target.value);
                  if (Number.isInteger(next) && next >= 1 && next <= pageCount) setPage(next);
                }}
                onKeyDown={event => {
                  if (event.key !== "Enter") return;
                  const next = Number((event.target as HTMLInputElement).value);
                  if (Number.isInteger(next) && next >= 1 && next <= pageCount) setPage(next);
                }}
              />
              <span>of {pageCount}</span>
              <button type="button" disabled={page >= pageCount || loading} onClick={() => setPage(current => current + 1)} aria-label="Next page">›</button>
            </div>
          </div>
          <div className="admin-grid-wrap">
            {loading ? <CommerceLoader cover="local" /> : null}
            <table className="admin-grid">
              <thead>
                <tr>
                  {visibleColumns.select ? (
                    <th className="admin-check-cell">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        aria-label="Select all locations on this page"
                        checked={allPageSelected}
                        onChange={event => togglePage(event.target.checked)}
                      />
                    </th>
                  ) : null}
                  {visibleColumns.id ? (
                    <th>
                      <button
                        type="button"
                        className={sortDir === "asc" ? "admin-sort asc" : "admin-sort desc"}
                        onClick={() => {
                          setSortDir(current => current === "asc" ? "desc" : "asc");
                          setPage(1);
                        }}
                      >
                        ID
                      </button>
                    </th>
                  ) : null}
                  {visibleColumns.title ? <th>Title</th> : null}
                  {visibleColumns.storeView ? <th>Store View</th> : null}
                  {visibleColumns.country ? <th>Country</th> : null}
                  {visibleColumns.city ? <th>City</th> : null}
                  {visibleColumns.street ? <th>Street</th> : null}
                  {visibleColumns.phone ? <th>Phone</th> : null}
                  {visibleColumns.email ? <th>Email</th> : null}
                  {visibleColumns.websiteUrl ? <th>Website url</th> : null}
                  {visibleColumns.zip ? <th>Zip</th> : null}
                  {visibleColumns.status ? <th>Status</th> : null}
                  {visibleColumns.action ? <th>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {!loading && items.length === 0 ? (
                  <tr><td colSpan={shownColumnCount}>We couldn&apos;t find any records.</td></tr>
                ) : null}
                {items.map(item => (
                  <tr key={item.locationId}>
                    {visibleColumns.select ? (
                      <td className="admin-check-cell">
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.title}`}
                          checked={selected.has(item.locationId)}
                          onChange={event => {
                            const checked = event.target.checked;
                            setSelected(current => {
                              const next = new Set(current);
                              if (checked) next.add(item.locationId);
                              else next.delete(item.locationId);
                              return next;
                            });
                          }}
                        />
                      </td>
                    ) : null}
                    {visibleColumns.id ? <td>{item.locationId}</td> : null}
                    {visibleColumns.title ? <td>{item.title}</td> : null}
                    {visibleColumns.storeView ? <td>{item.storeViewLabel}</td> : null}
                    {visibleColumns.country ? <td>{countryName(item.country)}</td> : null}
                    {visibleColumns.city ? <td>{item.city}</td> : null}
                    {visibleColumns.street ? <td>{item.street}</td> : null}
                    {visibleColumns.phone ? <td>{item.phone}</td> : null}
                    {visibleColumns.email ? <td>{item.email}</td> : null}
                    {visibleColumns.websiteUrl ? <td>{item.websiteUrl}</td> : null}
                    {visibleColumns.zip ? <td>{item.zip}</td> : null}
                    {visibleColumns.status ? <td>{statusLabel(item.status)}</td> : null}
                    {visibleColumns.action ? (
                      <td>
                        <div className="admin-action" data-grid-menu="">
                          <button
                            type="button"
                            className={openActionId === item.locationId ? "admin-action-toggle open" : "admin-action-toggle"}
                            aria-expanded={openActionId === item.locationId}
                            aria-haspopup="menu"
                            onClick={() => {
                              setOpenActionId(current => current === item.locationId ? null : item.locationId);
                              setMassOpen(false);
                              setColumnsOpen(false);
                              setViewOpen(false);
                              setExportOpen(false);
                            }}
                          >
                            Select
                          </button>
                          {openActionId === item.locationId ? (
                            <div className="admin-action-menu" role="menu">
                              <button type="button" role="menuitem" onClick={() => setFormIntent(item.locationId)}>Edit</button>
                              <button type="button" role="menuitem" onClick={() => void runMass("delete", [item.locationId])}>Delete</button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
