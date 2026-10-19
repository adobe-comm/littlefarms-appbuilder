import { useCallback, useEffect, useRef, useState } from "react";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { LocationContentEditor } from "./location-content-form.tsx";
import { invokeLocationAction } from "./locations-api.ts";
import {
  contentKindMeta,
  contentPageSizes,
  type GalleryListItem,
  type LocationContentKind,
  type LocationContentListResponse,
  type ServiceListItem,
  type TeamListItem,
} from "./location-content-types.ts";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

function itemId(kind: LocationContentKind, item: ServiceListItem | GalleryListItem | TeamListItem): number {
  if (kind === "service") return (item as ServiceListItem).serviceId;
  if (kind === "gallery") return (item as GalleryListItem).galleryId;
  return (item as TeamListItem).profileId;
}

function itemLabel(kind: LocationContentKind, item: ServiceListItem | GalleryListItem | TeamListItem): string {
  if (kind === "team") return (item as TeamListItem).name;
  return (item as ServiceListItem | GalleryListItem).title;
}

function statusLabel(status: string): string {
  return status === "disabled" ? "Disabled" : "Enabled";
}

export function LocationContentListPage({
  ims,
  kind,
}: {
  ims: Ims;
  kind: LocationContentKind;
}) {
  const meta = contentKindMeta(kind);
  const [items, setItems] = useState<(ServiceListItem | GalleryListItem | TeamListItem)[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof contentPageSizes)[number]>(20);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [formIntent, setFormIntent] = useState<"create" | number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [massOpen, setMassOpen] = useState(false);
  const [openActionId, setOpenActionId] = useState<number | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async (nextPage: number, nextPageSize: number, query: string) => {
    setLoading(true);
    try {
      const result = await invokeLocationAction<LocationContentListResponse>(ims, "location-content-list", {
        kind,
        page: nextPage,
        pageSize: nextPageSize,
        sortDir: kind === "team" ? "asc" : "desc",
        search: query,
      });
      setItems(result.items || []);
      setTotal(result.total || 0);
      setPage(result.page || nextPage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to load ${meta.heading.toLowerCase()} records.`);
    } finally {
      setLoading(false);
    }
  }, [ims, kind, meta.heading]);

  useEffect(() => {
    void loadList(page, pageSize, search);
  }, [loadList, page, pageSize, search]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-grid-menu]")) return;
      setMassOpen(false);
      setOpenActionId(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageIds = items.map(item => itemId(kind, item));
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));
  const somePageSelected = pageIds.some(id => selected.has(id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected && !allPageSelected;
    }
  }, [somePageSelected, allPageSelected]);

  function goToPage(value: string) {
    setPage(Math.min(pageCount, Math.max(1, Number(value) || 1)));
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

  const columnCount = kind === "service" ? 5 : kind === "gallery" ? 6 : 7;

  async function massDelete() {
    setMassOpen(false);
    const ids = [...selected];
    if (!ids.length) {
      setMessage("You haven't selected any items!");
      return;
    }
    const confirmed = window.confirm(ids.length === 1
      ? `Are you sure you want to delete this ${meta.heading.toLowerCase()}?`
      : `Are you sure you want to delete the selected ${meta.heading.toLowerCase()} records?`);
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      const result = await invokeLocationAction<{ affected: number }>(ims, "location-content-mass", {
        kind,
        operation: "delete",
        ids,
      });
      setSelected(new Set());
      setMessage(`A total of ${result.affected || 0} record(s) have been deleted.`);
      await loadList(page, pageSize, search);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete records.");
      setLoading(false);
    }
  }

  if (formIntent !== null) {
    return (
      <LocationContentEditor
        ims={ims}
        kind={kind}
        entityId={formIntent === "create" ? null : formIntent}
        onClose={() => {
          setFormIntent(null);
          void loadList(page, pageSize, search);
        }}
      />
    );
  }

  return (
    <main className="conditional-blocks admin-list locations-page">
      <header className="admin-list-header">
        <h1>{meta.heading}</h1>
      </header>
      <div className="admin-list-band">
        <button type="button" className="admin-primary" onClick={() => setFormIntent("create")}>
          {meta.addLabel}
        </button>
      </div>
      <div className="admin-list-body">
        {message ? <p className="message" role="status">{message}</p> : null}
        <section className="admin-grid-card">
          {search ? (
            <div className="admin-active-filters">
              <span>Active filters:</span>
              <span className="admin-filter-chip">Keyword: {search}</span>
              <button
                type="button"
                className="admin-clear"
                onClick={() => {
                  setSearch("");
                  setSearchDraft("");
                  setPage(1);
                }}
              >
                Clear all
              </button>
            </div>
          ) : null}
          <div className="admin-search-row">
            <div className="admin-grid-tools" aria-hidden="true" />
            <form
              className="admin-keyword"
              onSubmit={event => {
                event.preventDefault();
                setSearch(searchDraft.trim());
                setPage(1);
              }}
            >
              <label className="sr-only" htmlFor={`${kind}-keyword`}>{meta.searchPlaceholder}</label>
              <input
                id={`${kind}-keyword`}
                type="search"
                placeholder={meta.searchPlaceholder}
                value={searchDraft}
                onChange={event => setSearchDraft(event.target.value)}
              />
              <button type="submit" className="admin-keyword-submit">Search</button>
            </form>
          </div>
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
                    setOpenActionId(null);
                  }}
                >
                  Actions
                </button>
                {massOpen ? (
                  <div className="admin-action-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => void massDelete()}>Delete</button>
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
                    setPageSize(Number(event.target.value) as (typeof contentPageSizes)[number]);
                    setPage(1);
                  }}
                >
                  {contentPageSizes.map(size => (
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
                onBlur={event => goToPage(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") goToPage((event.target as HTMLInputElement).value);
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
                  <th className="admin-check-cell" scope="col">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      aria-label="Select all on page"
                      checked={allPageSelected}
                      onChange={event => togglePage(event.target.checked)}
                    />
                  </th>
                  {kind !== "service" ? <th scope="col">Image</th> : null}
                  <th scope="col">{kind === "team" ? "Name" : meta.heading}</th>
                  {kind === "team" ? <th scope="col">Sort Order</th> : null}
                  <th scope="col">Status</th>
                  <th scope="col">Created At</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {!loading && items.length === 0 ? (
                  <tr><td colSpan={columnCount}>We couldn&apos;t find any records.</td></tr>
                ) : null}
                {items.map(item => {
                  const id = itemId(kind, item);
                  const thumb = kind === "gallery"
                    ? (item as GalleryListItem).image
                    : kind === "team"
                      ? (item as TeamListItem).image
                      : "";
                  return (
                    <tr key={id}>
                      <td className="admin-check-cell">
                        <input
                          type="checkbox"
                          aria-label={`Select ${itemLabel(kind, item)}`}
                          checked={selected.has(id)}
                          onChange={event => {
                            setSelected(current => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(id);
                              else next.delete(id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      {kind !== "service" ? (
                        <td>
                          {thumb ? <img className="brand-thumb" src={thumb} alt="" /> : null}
                        </td>
                      ) : null}
                      <td>{itemLabel(kind, item)}</td>
                      {kind === "team" ? <td>{(item as TeamListItem).sortOrder}</td> : null}
                      <td>{statusLabel(item.status)}</td>
                      <td>{item.createdAt || "—"}</td>
                      <td>
                        <div className="admin-action" data-grid-menu="">
                          <button
                            type="button"
                            className={openActionId === id ? "admin-action-toggle open" : "admin-action-toggle"}
                            aria-expanded={openActionId === id}
                            aria-haspopup="menu"
                            onClick={() => {
                              setOpenActionId(current => current === id ? null : id);
                              setMassOpen(false);
                            }}
                          >
                            Select
                          </button>
                          {openActionId === id ? (
                            <div className="admin-action-menu" role="menu">
                              <button type="button" role="menuitem" onClick={() => setFormIntent(id)}>Edit</button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setSelected(new Set([id]));
                                  void massDelete();
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
