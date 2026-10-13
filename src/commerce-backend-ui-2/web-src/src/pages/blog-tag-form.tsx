import { useEffect, useState, type ReactNode } from "react";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { invokeBlogAction } from "./blog-api.ts";
import {
  emptyTag,
  slugifyTitle,
  tagFromResponse,
  type BlogTagRecord,
} from "./blog-tag-types.ts";
import type { BlogPostListItem, BlogPostListResponse } from "./blog-post-types.ts";
import "./blog.css";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

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

export function BlogTagEditor({
  ims,
  tagId,
  onClose,
}: {
  ims: Ims;
  tagId: number | null;
  onClose: () => void;
}) {
  const [record, setRecord] = useState<BlogTagRecord>(emptyTag());
  const [posts, setPosts] = useState<BlogPostListItem[]>([]);
  const [postsTotal, setPostsTotal] = useState(0);
  const [loading, setLoading] = useState(tagId != null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [urlKeyTouched, setUrlKeyTouched] = useState(false);
  const [postsOpen, setPostsOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setMessage("");
      try {
        if (tagId != null) {
          const result = await invokeBlogAction<{ tag: BlogTagRecord }>(ims, "blog-tag-list", { tagId });
          if (cancelled) return;
          setRecord(tagFromResponse(result.tag));
          setUrlKeyTouched(true);
          const postsPage = await invokeBlogAction<BlogPostListResponse>(ims, "blog-post-list", {
            tagId: String(tagId),
            page: 1,
            pageSize: 20,
            sortDir: "desc",
          });
          if (cancelled) return;
          setPosts(postsPage.items || []);
          setPostsTotal(postsPage.total || 0);
        } else {
          setRecord(emptyTag());
          setPosts([]);
          setPostsTotal(0);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Unable to load the tag.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ims, tagId]);

  function patch(fields: Partial<BlogTagRecord>) {
    setRecord(current => ({ ...current, ...fields }));
  }

  function payload(): Record<string, unknown> {
    return {
      title: record.title,
      url_key: record.url_key,
      is_active: record.is_active,
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
      const result = await invokeBlogAction<{ tag: BlogTagRecord }>(ims, "blog-tag-write", {
        tagId: record.tagId ?? undefined,
        fields: payload(),
      });
      const saved = tagFromResponse(result.tag);
      setRecord(saved);
      setUrlKeyTouched(true);
      setMessage("Tag saved.");
      if (!stay) onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the tag.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTag() {
    if (record.tagId == null) return;
    const confirmed = window.confirm("Are you sure you want to delete this tag?");
    if (!confirmed) return;
    setSaving(true);
    try {
      await invokeBlogAction(ims, "blog-tag-mass", { operation: "delete", ids: [record.tagId] });
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete the tag.");
      setSaving(false);
    }
  }

  const busy = loading || saving;
  const heading = record.tagId == null ? "New Tag" : "Edit Tag";

  return (
    <main className="conditional-blocks block-edit-page admin-post-edit admin-tag-edit">
      {busy ? <CommerceLoader /> : null}
      <header className="admin-post-edit-header">
        <h1>{heading}</h1>
        <div className="block-edit-actions">
          <button type="button" onClick={onClose} disabled={busy}>← Back</button>
          {record.tagId != null ? (
            <button type="button" onClick={() => void removeTag()} disabled={busy}>Delete</button>
          ) : null}
          <button type="button" className="admin-primary" disabled={busy} onClick={() => void save(true)}>
            Save
          </button>
        </div>
      </header>
      {message ? <p className="message" role="status">{message}</p> : null}
      <section className="admin-tag-details">
        <h2 className="block-edit-section-title">Tag Details</h2>
        <Field id="tag-name" label="Name" required>
          <input
            id="tag-name"
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
        <Field id="tag-url-key" label="Url Key" required>
          <input
            id="tag-url-key"
            value={record.url_key}
            onChange={event => {
              setUrlKeyTouched(true);
              patch({ url_key: event.target.value });
            }}
          />
        </Field>
        <Field id="tag-meta-title" label="Meta Title">
          <span>
            <input
              id="tag-meta-title"
              value={record.meta_title}
              onChange={event => patch({ meta_title: event.target.value })}
            />
            <span className="field-hint">{record.meta_title.length} characters used. Recommended max length is 50–60 characters.</span>
          </span>
        </Field>
        <Field id="tag-meta-keywords" label="Meta Keywords">
          <span>
            <input
              id="tag-meta-keywords"
              value={record.meta_keywords}
              onChange={event => patch({ meta_keywords: event.target.value })}
            />
            <span className="field-hint">{record.meta_keywords.length} characters used. Recommended max length is 50–160 characters.</span>
          </span>
        </Field>
        <Field id="tag-meta-description" label="Meta Description">
          <span>
            <input
              id="tag-meta-description"
              value={record.meta_description}
              onChange={event => patch({ meta_description: event.target.value })}
            />
            <span className="field-hint">{record.meta_description.length} characters used. Recommended max length is 50–160 characters.</span>
          </span>
        </Field>
        <Field id="tag-meta-prefix" label="Prefix">
          <input id="tag-meta-prefix" value={record.meta_prefix} onChange={event => patch({ meta_prefix: event.target.value })} />
        </Field>
        <Field id="tag-meta-suffix" label="Suffix">
          <input id="tag-meta-suffix" value={record.meta_suffix} onChange={event => patch({ meta_suffix: event.target.value })} />
        </Field>
      </section>
      {record.tagId != null ? (
        <section className="admin-tag-posts-section">
          <header className="admin-tag-posts-header">
            <h2 className="block-edit-section-title">Posts</h2>
            <button
              type="button"
              className="admin-section-toggle"
              aria-expanded={postsOpen}
              onClick={() => setPostsOpen(open => !open)}
            >
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
                      <th>URL Key</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.length === 0 ? (
                      <tr><td colSpan={5}>We couldn&apos;t find any records.</td></tr>
                    ) : null}
                    {posts.map(item => (
                      <tr key={item.postId}>
                        <td>{item.postId}</td>
                        <td>{item.title}</td>
                        <td className={item.status === "published" ? "admin-status-published" : "admin-status-draft"}>
                          {item.status === "published" ? "Published" : "Draft"}
                        </td>
                        <td>{item.publish_at ? new Date(item.publish_at).toLocaleString() : "—"}</td>
                        <td>{item.url_key}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
