import { useCallback, useEffect, useState } from "react";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { invokeBlogAction } from "./blog-api.ts";
import { BlogPostEditor } from "./blog-post-form.tsx";
import {
  blogPostPageSizes,
  taxonomyLabels,
  type BlogPostListItem,
  type BlogPostListResponse,
  type BlogTaxonomyItem,
} from "./blog-post-types.ts";
import "./blog.css";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

type BlogPostsPageProps = {
  ims: Ims;
  onNavigateSection?: (section: "categories" | "tags") => void;
};

export function BlogPostsPage({ ims, onNavigateSection }: BlogPostsPageProps) {
  const [items, setItems] = useState<BlogPostListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof blogPostPageSizes)[number]>(20);
  const [sortDir] = useState<"asc" | "desc">("desc");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [formIntent, setFormIntent] = useState<"create" | number | null>(null);
  const [categories, setCategories] = useState<BlogTaxonomyItem[]>([]);
  const [tags, setTags] = useState<BlogTaxonomyItem[]>([]);

  const loadList = useCallback(async (
    nextPage: number,
    nextPageSize: number,
    title: string,
    status: string,
  ) => {
    setLoading(true);
    try {
      const result = await invokeBlogAction<BlogPostListResponse>(ims, "blog-post-list", {
        page: nextPage,
        pageSize: nextPageSize,
        sortDir,
        title,
        status: status || undefined,
      });
      setItems(result.items || []);
      setTotal(result.total || 0);
      setPage(result.page || nextPage);
      setMessage(current => current === "Unable to load posts." ? "" : current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load posts.");
    } finally {
      setLoading(false);
    }
  }, [ims, sortDir]);

  useEffect(() => {
    let cancelled = false;
    async function loadTaxonomies() {
      try {
        const [categoryPage, tagPage] = await Promise.all([
          invokeBlogAction<{ items: BlogTaxonomyItem[] }>(ims, "blog-category-list", { listAll: true }),
          invokeBlogAction<{ items: BlogTaxonomyItem[] }>(ims, "blog-tag-list", { listAll: true }),
        ]);
        if (cancelled) return;
        setCategories(categoryPage.items || []);
        setTags(tagPage.items || []);
      } catch {
        /* grid can still render without labels */
      }
    }
    void loadTaxonomies();
    return () => {
      cancelled = true;
    };
  }, [ims]);

  useEffect(() => {
    void loadList(page, pageSize, search, statusFilter);
  }, [loadList, page, pageSize, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function goToPage(value: string) {
    const next = Math.min(pageCount, Math.max(1, Number(value) || 1));
    setPage(next);
  }

  if (formIntent !== null) {
    return (
      <BlogPostEditor
        ims={ims}
        postId={formIntent === "create" ? null : formIntent}
        onNavigateSection={onNavigateSection}
        onClose={() => {
          setFormIntent(null);
          void loadList(page, pageSize, search, statusFilter);
        }}
      />
    );
  }

  return (
    <main className="conditional-blocks admin-list">
      {loading ? <CommerceLoader /> : null}
      <header className="admin-list-header">
        <h1>Posts</h1>
      </header>
      <div className="admin-list-band">
        <button type="button" className="admin-primary" onClick={() => setFormIntent("create")}>
          Add New Post
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
            <label className="sr-only" htmlFor="post-keyword">Search by title</label>
            <input
              id="post-keyword"
              placeholder="Search by title"
              value={searchDraft}
              onChange={event => setSearchDraft(event.target.value)}
            />
            <button type="submit" className="admin-keyword-submit">Search</button>
          </form>
          <div className="admin-filter-row">
            <label>
              Status
              <select
                value={statusFilter}
                onChange={event => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
          </div>
          <div className="admin-grid-toolbar">
            <span className="admin-record-count">{total} records found</span>
            <div className="admin-pager">
              <label>
                <select
                  value={pageSize}
                  aria-label="Records per page"
                  onChange={event => {
                    setPageSize(Number(event.target.value) as (typeof blogPostPageSizes)[number]);
                    setPage(1);
                  }}
                >
                  {blogPostPageSizes.map(size => (
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
                  <th>Title</th>
                  <th>URL Key</th>
                  <th>Status</th>
                  <th>Publish at</th>
                  <th>Categories</th>
                  <th>Tags</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={8}>We couldn&apos;t find any records.</td></tr>
                ) : null}
                {items.map(item => (
                  <tr key={item.postId}>
                    <td>{item.title}</td>
                    <td>{item.url_key}</td>
                    <td className={item.status === "published" ? "admin-status-published" : "admin-status-draft"}>
                      {item.status === "published" ? "Published" : "Draft"}
                    </td>
                    <td>{item.publish_at ? new Date(item.publish_at).toLocaleString() : "—"}</td>
                    <td>{taxonomyLabels(item.category_ids, categories)}</td>
                    <td>{taxonomyLabels(item.tag_ids, tags)}</td>
                    <td>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "—"}</td>
                    <td>
                      <button type="button" className="admin-edit" onClick={() => setFormIntent(item.postId)}>Edit</button>
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
