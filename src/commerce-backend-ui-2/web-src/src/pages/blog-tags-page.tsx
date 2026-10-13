import { useCallback, useEffect, useRef, useState } from "react";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { invokeBlogAction } from "./blog-api.ts";
import { BlogTagEditor } from "./blog-tag-form.tsx";
import {
  blogTagPageSizes,
  type BlogTagListItem,
  type BlogTagListResponse,
} from "./blog-tag-types.ts";
import "./blog.css";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

type BlogTagsPageProps = {
  ims: Ims;
  onNavigateSection?: (section: "posts" | "categories" | "tags") => void;
};

export function BlogTagsPage({ ims }: BlogTagsPageProps) {
  const [items, setItems] = useState<BlogTagListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof blogTagPageSizes)[number]>(20);
  const [sortDir] = useState<"asc" | "desc">("desc");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [formIntent, setFormIntent] = useState<"create" | number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [massOpen, setMassOpen] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async (
    nextPage: number,
    nextPageSize: number,
    title: string,
  ) => {
    setLoading(true);
    try {
      const result = await invokeBlogAction<BlogTagListResponse>(ims, "blog-tag-list", {
        page: nextPage,
        pageSize: nextPageSize,
        sortDir,
        title,
      });
      setItems(result.items || []);
      setTotal(result.total || 0);
      setPage(result.page || nextPage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load tags.");
    } finally {
      setLoading(false);
    }
  }, [ims, sortDir]);

  useEffect(() => {
    void loadList(page, pageSize, search);
  }, [loadList, page, pageSize, search]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-grid-menu]")) return;
      setMassOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageIds = items.map(item => item.tagId);
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

  async function massDelete() {
    setMassOpen(false);
    const ids = [...selected];
    if (!ids.length) {
      setMessage("You haven't selected any items!");
      return;
    }
    const confirmed = window.confirm(ids.length === 1
      ? "Are you sure you want to delete this tag?"
      : "Are you sure you want to delete the selected tags?");
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      const result = await invokeBlogAction<{ affected: number }>(ims, "blog-tag-mass", {
        operation: "delete",
        ids,
      });
      setSelected(new Set());
      setMessage(`A total of ${result.affected || 0} record(s) have been deleted.`);
      await loadList(page, pageSize, search);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete tags.");
      setLoading(false);
    }
  }

  if (formIntent !== null) {
    return (
      <BlogTagEditor
        ims={ims}
        tagId={formIntent === "create" ? null : formIntent}
        onClose={() => {
          setFormIntent(null);
          void loadList(page, pageSize, search);
        }}
      />
    );
  }

  return (
    <main className="conditional-blocks admin-list">
      {loading ? <CommerceLoader /> : null}
      <header className="admin-list-header">
        <h1>Tags</h1>
      </header>
      <div className="admin-list-band">
        <button type="button" className="admin-primary" onClick={() => setFormIntent("create")}>
          Add New Tag
        </button>
      </div>
      <div className="admin-list-body">
        {message ? <p className="message" role="status">{message}</p> : null}
        <section className="admin-grid-card">
          {search ? (
            <div className="admin-active-filters">
              <span>Active filters:</span>
              <span className="admin-filter-chip">Name: {search}</span>
              <button type="button" className="admin-clear" onClick={() => { setSearch(""); setSearchDraft(""); setPage(1); }}>
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
                onClick={() => setFiltersOpen(open => !open)}
              >
                Filters
              </button>
            </div>
            <form
              className="admin-keyword"
              onSubmit={event => {
                event.preventDefault();
                setSearch(searchDraft.trim());
                setPage(1);
              }}
            >
              <label className="sr-only" htmlFor="tag-keyword">Search by name</label>
              <input
                id="tag-keyword"
                placeholder="Search by name"
                value={searchDraft}
                onChange={event => setSearchDraft(event.target.value)}
              />
              <button type="submit" className="admin-keyword-submit">Search</button>
            </form>
          </div>
          {filtersOpen ? (
            <div className="admin-filters-panel">
              <p className="field-hint">Filter by name using the search box above.</p>
            </div>
          ) : null}
          <div className="admin-grid-toolbar">
            <div className="admin-mass" data-grid-menu="">
              <button
                type="button"
                className={massOpen ? "admin-mass-toggle open" : "admin-mass-toggle"}
                aria-expanded={massOpen}
                onClick={() => setMassOpen(open => !open)}
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
            <div className="admin-pager">
              <label>
                <select
                  value={pageSize}
                  aria-label="Records per page"
                  onChange={event => {
                    setPageSize(Number(event.target.value) as (typeof blogTagPageSizes)[number]);
                    setPage(1);
                  }}
                >
                  {blogTagPageSizes.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                <span>per page</span>
              </label>
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
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
              <button type="button" disabled={page >= pageCount || loading} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
            </div>
          </div>
          <div className="admin-grid-wrap">
            <table className="admin-grid">
              <thead>
                <tr>
                  <th>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      aria-label="Select all on page"
                      checked={allPageSelected}
                      onChange={event => togglePage(event.target.checked)}
                    />
                  </th>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Url Key</th>
                  <th>Used In Posts</th>
                  <th>Created At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={7}>We couldn&apos;t find any records.</td></tr>
                ) : null}
                {items.map(item => (
                  <tr key={item.tagId}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.title}`}
                        checked={selected.has(item.tagId)}
                        onChange={event => {
                          setSelected(current => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(item.tagId);
                            else next.delete(item.tagId);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td>{item.tagId}</td>
                    <td>{item.title}</td>
                    <td>{item.url_key || "—"}</td>
                    <td>{item.usedInPosts}</td>
                    <td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</td>
                    <td>
                      <button type="button" className="admin-edit" onClick={() => setFormIntent(item.tagId)}>Edit</button>
                    </td>
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
