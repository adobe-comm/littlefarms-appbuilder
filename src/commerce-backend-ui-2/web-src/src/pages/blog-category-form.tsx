import { useEffect, useRef, useState, type ReactNode } from "react";
import { HtmlEditor } from "../components/html-editor.tsx";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { fileToBase64, invokeBlogAction } from "./blog-api.ts";
import type { BlogPostListItem, BlogPostListResponse } from "./blog-post-types.ts";
import {
  buildCategoryTree,
  categoryDisplayModeOptions,
  categoryFromResponse,
  emptyCategory,
  slugifyTitle,
  type CategoryDisplayMode,
  type BlogCategoryListItem,
  type BlogCategoryListResponse,
  type BlogCategoryRecord,
  type CategoryTreeNode,
} from "./blog-category-types.ts";
import "./blog.css";

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

function CategoryTree({
  nodes,
  depth,
  activeId,
  onSelect,
}: {
  nodes: CategoryTreeNode[];
  depth: number;
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <ul className="admin-category-tree" style={{ paddingLeft: depth ? 12 : 0 }}>
      {nodes.map(node => (
        <li key={node.categoryId}>
          <button
            type="button"
            className={node.categoryId === activeId ? "admin-category-tree-link active" : "admin-category-tree-link"}
            onClick={() => onSelect(node.categoryId)}
          >
            {node.title}
          </button>
          {node.children.length ? (
            <CategoryTree nodes={node.children} depth={depth + 1} activeId={activeId} onSelect={onSelect} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function BlogCategoryEditor({
  ims,
  categoryId,
  initialParentId,
  onClose,
}: {
  ims: Ims;
  categoryId: number | null;
  initialParentId: number | null;
  onClose: () => void;
}) {
  const draftKey = useRef(`draft-${Date.now()}`);
  const [record, setRecord] = useState<BlogCategoryRecord>(() => emptyCategory(initialParentId));
  const [treeItems, setTreeItems] = useState<BlogCategoryListItem[]>([]);
  const [posts, setPosts] = useState<BlogPostListItem[]>([]);
  const [postsTotal, setPostsTotal] = useState(0);
  const [loading, setLoading] = useState(categoryId != null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [urlKeyTouched, setUrlKeyTouched] = useState(false);
  const [postsOpen, setPostsOpen] = useState(true);
  const [treeExpanded, setTreeExpanded] = useState(true);
  const imageInputRef = useRef<HTMLInputElement>(null);

  async function loadTree() {
    const result = await invokeBlogAction<BlogCategoryListResponse>(ims, "blog-category-list", { listAll: true });
    setTreeItems(result.items || []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setMessage("");
      try {
        await loadTree();
        if (cancelled) return;
        if (categoryId != null) {
          const result = await invokeBlogAction<{ category: BlogCategoryRecord }>(ims, "blog-category-list", {
            categoryId,
          });
          if (cancelled) return;
          setRecord(categoryFromResponse(result.category));
          setUrlKeyTouched(true);
          const postsPage = await invokeBlogAction<BlogPostListResponse>(ims, "blog-post-list", {
            categoryId: String(categoryId),
            page: 1,
            pageSize: 20,
            sortDir: "desc",
          });
          if (cancelled) return;
          setPosts(postsPage.items || []);
          setPostsTotal(postsPage.total || 0);
        } else {
          setRecord(emptyCategory(initialParentId));
          setPosts([]);
          setPostsTotal(0);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Unable to load the category.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ims, categoryId, initialParentId]);

  function patch(fields: Partial<BlogCategoryRecord>) {
    setRecord(current => ({ ...current, ...fields }));
  }

  function payload(): Record<string, unknown> {
    return {
      title: record.title,
      url_key: record.url_key,
      parent_id: record.parent_id,
      sort_order: record.sort_order,
      status: record.status,
      image: record.image,
      image_title: record.image_title,
      image_alt: record.image_alt,
      display_mode: record.display_mode,
      enable_description: record.enable_description,
      description: record.description,
      meta_title: record.meta_title,
      meta_keywords: record.meta_keywords,
      meta_description: record.meta_description,
      meta_prefix: record.meta_prefix,
      meta_suffix: record.meta_suffix,
    };
  }

  async function save(stay: boolean) {
    if (!record.title.trim()) {
      setMessage("Name is required.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const result = await invokeBlogAction<{ category: BlogCategoryRecord }>(ims, "blog-category-write", {
        categoryId: record.categoryId ?? undefined,
        fields: payload(),
      });
      const saved = categoryFromResponse(result.category);
      setRecord(saved);
      setUrlKeyTouched(true);
      await loadTree();
      setMessage("Category saved.");
      if (!stay) onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the category.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory() {
    if (record.categoryId == null) return;
    const confirmed = window.confirm("Are you sure you want to delete this category?");
    if (!confirmed) return;
    setSaving(true);
    try {
      await invokeBlogAction(ims, "blog-category-mass", { operation: "delete", ids: [record.categoryId] });
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete the category.");
      setSaving(false);
    }
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setMessage("");
    try {
      const content = await fileToBase64(file);
      const uploaded = await invokeBlogAction<{ url: string }>(ims, "blog-category-asset", {
        categoryKey: record.categoryId ? String(record.categoryId) : draftKey.current,
        contentType: file.type,
        content,
      });
      patch({ image: uploaded.url });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload the image.");
    } finally {
      setUploading(false);
    }
  }

  async function openCategory(id: number) {
    setLoading(true);
    try {
      const result = await invokeBlogAction<{ category: BlogCategoryRecord }>(ims, "blog-category-list", { categoryId: id });
      setRecord(categoryFromResponse(result.category));
      setUrlKeyTouched(true);
      const postsPage = await invokeBlogAction<BlogPostListResponse>(ims, "blog-post-list", {
        categoryId: String(id),
        page: 1,
        pageSize: 20,
        sortDir: "desc",
      });
      setPosts(postsPage.items || []);
      setPostsTotal(postsPage.total || 0);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load the category.");
    } finally {
      setLoading(false);
    }
  }

  function startSubcategory() {
    const parentId = record.categoryId ?? null;
    if (parentId == null) {
      setMessage("Save this category before adding a subcategory.");
      return;
    }
    setRecord(emptyCategory(parentId));
    setUrlKeyTouched(false);
    setPosts([]);
    setPostsTotal(0);
  }

  const busy = loading || saving || uploading;
  const heading = record.categoryId == null ? "New Category" : "Edit Category";
  const tree = buildCategoryTree(treeItems);

  return (
    <main className="conditional-blocks block-edit-page admin-post-edit admin-category-edit">
      {busy ? <CommerceLoader /> : null}
      <header className="admin-post-edit-header">
        <div className="admin-post-edit-title-row">
          <h1>{heading}</h1>
        </div>
        <div className="block-edit-actions admin-post-edit-actions">
          <button type="button" onClick={onClose} disabled={busy}>← Back</button>
          {record.categoryId != null ? (
            <button type="button" onClick={() => void removeCategory()} disabled={busy}>Delete</button>
          ) : null}
          <button type="button" disabled={busy} onClick={() => void save(true)}>Save and Continue Edit</button>
          <button type="button" className="admin-primary" disabled={busy} onClick={() => void save(true)}>Save</button>
        </div>
      </header>
      {message ? <p className="message" role="status">{message}</p> : null}
      <div className="admin-category-edit-layout">
        <aside className="admin-category-tree-panel">
          <button type="button" className="admin-category-tree-action" onClick={() => {
            setRecord(emptyCategory(null));
            setUrlKeyTouched(false);
            setPosts([]);
            setPostsTotal(0);
          }}>
            Add Root Category
          </button>
          <button type="button" className="admin-category-tree-action" onClick={startSubcategory}>
            Add Subcategory
          </button>
          <p className="admin-category-tree-tools">
            <button type="button" className="admin-inline-link" onClick={() => setTreeExpanded(true)}>Expand All</button>
            {" | "}
            <button type="button" className="admin-inline-link" onClick={() => setTreeExpanded(false)}>Collapse All</button>
          </p>
          {treeExpanded ? (
            <CategoryTree
              nodes={tree}
              depth={0}
              activeId={record.categoryId}
              onSelect={id => void openCategory(id)}
            />
          ) : null}
        </aside>
        <div className="admin-category-form-panel">
          <h2 className="block-edit-section-title">Category Details</h2>
          <Field id="category-name" label="Name" required>
            <input
              id="category-name"
              value={record.title}
              onChange={event => {
                const title = event.target.value;
                patch({
                  title,
                  url_key: urlKeyTouched ? record.url_key : slugifyTitle(title),
                });
              }}
            />
          </Field>
          <Field id="category-url-key" label="URL Key" required>
            <input
              id="category-url-key"
              value={record.url_key}
              onChange={event => {
                setUrlKeyTouched(true);
                patch({ url_key: event.target.value });
              }}
            />
          </Field>
          <Field id="category-status" label="Status">
            <select
              id="category-status"
              value={record.status}
              onChange={event => patch({
                status: event.target.value === "enabled" ? "enabled" : "disabled",
                is_active: event.target.value === "enabled",
              })}
            >
              <option value="disabled">Disabled</option>
              <option value="enabled">Enabled</option>
            </select>
          </Field>
          <div className="admin-category-image-row">
            <Field id="category-image" label="Image">
              <div className="admin-image-upload">
                <div className={`admin-image-upload-box${record.image ? " has-image" : ""}`}>
                  {record.image ? (
                    <>
                      <img src={record.image} alt="" />
                      <button type="button" className="admin-image-remove" disabled={uploading} onClick={() => patch({ image: "" })}>
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="admin-image-placeholder">No image</span>
                  )}
                </div>
                <input
                  ref={imageInputRef}
                  id="category-image"
                  className="admin-image-file-input"
                  type="file"
                  accept={IMAGE_ACCEPT}
                  disabled={uploading}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                    event.target.value = "";
                  }}
                />
                <button type="button" className="admin-image-upload-btn" disabled={uploading} onClick={() => imageInputRef.current?.click()}>
                  Upload
                </button>
              </div>
            </Field>
            <div className="admin-category-image-meta">
              <Field id="category-image-title" label="Image Title">
                <input id="category-image-title" value={record.image_title} onChange={event => patch({ image_title: event.target.value })} />
              </Field>
              <Field id="category-image-alt" label="Image Alt Text">
                <input id="category-image-alt" value={record.image_alt} onChange={event => patch({ image_alt: event.target.value })} />
              </Field>
            </div>
          </div>
          <Field id="category-display-mode" label="Display Mode">
            <select
              id="category-display-mode"
              value={record.display_mode}
              onChange={event =>
                patch({ display_mode: event.target.value as CategoryDisplayMode })
              }
            >
              {categoryDisplayModeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          {record.categoryId != null ? (
            <Field id="category-sort-order" label="Sort Order">
              <input
                id="category-sort-order"
                type="number"
                value={record.sort_order}
                onChange={event => patch({ sort_order: Number(event.target.value) || 0 })}
              />
            </Field>
          ) : null}
          <Field id="category-enable-description" label="Enable Description">
            <div className="admin-toggle">
              <input
                id="category-enable-description"
                type="checkbox"
                checked={record.enable_description}
                onChange={event => patch({ enable_description: event.target.checked })}
              />
              <span>{record.enable_description ? "Yes" : "No"}</span>
            </div>
          </Field>
          {record.enable_description ? (
            <HtmlEditor
              id="category-description"
              label="Description"
              value={record.description}
              onChange={html => patch({ description: html })}
            />
          ) : null}
          <Field id="category-meta-title" label="Meta Title">
            <span>
              <input id="category-meta-title" value={record.meta_title} onChange={event => patch({ meta_title: event.target.value })} />
              <span className="field-hint">{record.meta_title.length} characters used. Recommended max length is 50–60 characters.</span>
            </span>
          </Field>
          <Field id="category-meta-keywords" label="Meta Keywords">
            <span>
              <input id="category-meta-keywords" value={record.meta_keywords} onChange={event => patch({ meta_keywords: event.target.value })} />
              <span className="field-hint">{record.meta_keywords.length} characters used. Recommended max length is 50–160 characters.</span>
            </span>
          </Field>
          <Field id="category-meta-description" label="Meta Description">
            <span>
              <input id="category-meta-description" value={record.meta_description} onChange={event => patch({ meta_description: event.target.value })} />
              <span className="field-hint">{record.meta_description.length} characters used. Recommended max length is 50–160 characters.</span>
            </span>
          </Field>
          <Field id="category-meta-prefix" label="Prefix">
            <input id="category-meta-prefix" value={record.meta_prefix} onChange={event => patch({ meta_prefix: event.target.value })} />
          </Field>
          <Field id="category-meta-suffix" label="Suffix">
            <input id="category-meta-suffix" value={record.meta_suffix} onChange={event => patch({ meta_suffix: event.target.value })} />
          </Field>
          {record.categoryId != null ? (
            <section className="admin-tag-posts-section">
              <header className="admin-tag-posts-header">
                <h2 className="block-edit-section-title">Posts</h2>
                <button type="button" className="admin-section-toggle" aria-expanded={postsOpen} onClick={() => setPostsOpen(open => !open)}>
                  {postsOpen ? "▾" : "▸"}
                </button>
              </header>
              {postsOpen ? (
                <>
                  <div className="admin-grid-toolbar">
                    <span className="admin-record-count">{postsTotal} records found</span>
                  </div>
                  <div className="admin-grid-wrap">
                    <table className="admin-grid">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Title</th>
                          <th>Status</th>
                          <th>Publish Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {posts.length === 0 ? (
                          <tr><td colSpan={4}>We couldn&apos;t find any records.</td></tr>
                        ) : null}
                        {posts.map(item => (
                          <tr key={item.postId}>
                            <td>{item.postId}</td>
                            <td>{item.title}</td>
                            <td>{item.status === "published" ? "Published" : "Draft"}</td>
                            <td>{item.publish_at ? new Date(item.publish_at).toLocaleString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
