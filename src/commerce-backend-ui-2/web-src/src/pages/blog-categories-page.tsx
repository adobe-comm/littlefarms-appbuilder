import { useCallback, useEffect, useRef, useState } from "react";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { invokeBlogAction } from "./blog-api.ts";
import { BlogCategoryEditor } from "./blog-category-form.tsx";
import {
  blogCategoryPageSizes,
  type BlogCategoryListItem,
  type BlogCategoryListResponse,
} from "./blog-category-types.ts";
import "./blog.css";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

type CreateIntent = { kind: "create"; parentId: number | null };

export function BlogCategoriesPage({ ims }: { ims: Ims }) {
  const [items, setItems] = useState<BlogCategoryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof blogCategoryPageSizes)[number]>(20);
  const [sortDir] = useState<"asc" | "desc">("asc");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [formIntent, setFormIntent] = useState<CreateIntent | number | null>(null);
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
      const result = await invokeBlogAction<BlogCategoryListResponse>(ims, "blog-category-list", {
        page: nextPage,
        pageSize: nextPageSize,
        sortDir,
        title,
      });
      setItems(result.items || []);
      setTotal(result.total || 0);
      setPage(result.page || nextPage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load categories.");
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
  const pageIds = items.map(item => item.categoryId);
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

  async function massDelete() {
    setMassOpen(false);
    const ids = [...selected];
    if (!ids.length) {
      setMessage("You haven't selected any items!");
      return;
    }
    const confirmed = window.confirm(ids.length === 1
      ? "Are you sure you want to delete this category?"
      : "Are you sure you want to delete the selected categories?");
    if (!confirmed) return;
    setLoading(true);
    try {
      const result = await invokeBlogAction<{ affected: number }>(ims, "blog-category-mass", {
        operation: "delete",
        ids,
      });
      setSelected(new Set());
      setMessage(`A total of ${result.affected || 0} record(s) have been deleted.`);
      await loadList(page, pageSize, search);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete categories.");
      setLoading(false);
    }
  }

  if (formIntent !== null) {
    const categoryId = typeof formIntent === "number" ? formIntent : null;
    const parentId = typeof formIntent === "object" ? formIntent.parentId : null;
    return (
      <BlogCategoryEditor
        ims={ims}
        categoryId={categoryId}
        initialParentId={parentId}
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
        <h1>Categories</h1>
      </header>
      <div className="admin-list-band">
        <button type="button" className="admin-primary" onClick={() => setFormIntent({ kind: "create", parentId: null })}>
          Create Category
        </button>
      </div>
      <div className="admin-list-body">
        {message ? <p className="message" role="status">{message}</p> : null}
        <section className="admin-grid-card">
          <form
            className="admin-keyword"
            onSubmit={event => {
              event.preventDefault();
              setSearch(searchDraft.trim());
              setPage(1);
            }}
          >
            <label className="sr-only" htmlFor="category-keyword">Search by name</label>
            <input
              id="category-keyword"
              placeholder="Search by category name"
              value={searchDraft}
              onChange={event => setSearchDraft(event.target.value)}
            />
            <button type="submit" className="admin-keyword-submit">Search</button>
          </form>
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
                    setPageSize(Number(event.target.value) as (typeof blogCategoryPageSizes)[number]);
                    setPage(1);
                  }}
                >
                  {blogCategoryPageSizes.map(size => (
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
                      onChange={event => {
                        setSelected(current => {
                          const next = new Set(current);
                          for (const id of pageIds) {
                            if (event.target.checked) next.add(id);
                            else next.delete(id);
                          }
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th>ID</th>
                  <th>Category Name</th>
                  <th>URL Key</th>
                  <th>Meta Title</th>
                  <th>Meta Keywords</th>
                  <th>Meta Description</th>
                  <th>Status</th>
                  <th>Sort Order</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={10}>We couldn&apos;t find any records.</td></tr>
                ) : null}
                {items.map(item => (
                  <tr key={item.categoryId}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.title}`}
                        checked={selected.has(item.categoryId)}
                        onChange={event => {
                          setSelected(current => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(item.categoryId);
                            else next.delete(item.categoryId);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td>{item.categoryId}</td>
                    <td>{item.title}</td>
                    <td>{item.url_key || "—"}</td>
                    <td>{item.meta_title || "—"}</td>
                    <td>{item.meta_keywords || "—"}</td>
                    <td>{item.meta_description || "—"}</td>
                    <td>{item.status === "enabled" ? "Enabled" : "Disabled"}</td>
                    <td>{item.sort_order}</td>
                    <td>
                      <button type="button" className="admin-edit" onClick={() => setFormIntent(item.categoryId)}>Edit</button>
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
