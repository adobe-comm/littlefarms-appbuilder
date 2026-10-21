import { useEffect, useRef, useState, type ReactNode } from "react";
import { AdminMultiselect } from "../components/admin-multiselect.tsx";
import { HtmlEditor } from "../components/html-editor.tsx";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { fileToBase64, invokeBlogAction } from "./blog-api.ts";
import {
  applyCustomerGroupSelection,
  customerGroupIdsForSave,
  emptyPost,
  fromDatetimeLocal,
  postFromResponse,
  slugifyTitle,
  type BlogPostRecord,
  type BlogTaxonomyItem,
  type CustomerGroupOption,
} from "./blog-post-types.ts";
import "./blog.css";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

type ImageKind = "featured_image" | "mobile_image" | "listing_image";

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

function PostImageUpload({
  id,
  label,
  hint,
  url,
  disabled,
  hideLabel,
  onFile,
  onClear,
}: {
  id: string;
  label: string;
  hint?: string;
  url: string;
  disabled: boolean;
  hideLabel?: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="admin-post-image-slot">
      {hideLabel ? null : <span className="admin-post-image-slot-label">{label}</span>}
      <div className="admin-image-upload">
        <div className={`admin-image-upload-box${url ? " has-image" : ""}`}>
          {url ? (
            <>
              <img src={url} alt="" />
              <button type="button" className="admin-image-remove" disabled={disabled} onClick={onClear}>
                Remove
              </button>
            </>
          ) : (
            <span className="admin-image-placeholder">No image</span>
          )}
        </div>
        <input
          ref={inputRef}
          id={id}
          className="admin-image-file-input"
          type="file"
          accept={IMAGE_ACCEPT}
          disabled={disabled}
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className="admin-image-upload-btn"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Upload
        </button>
        {hint ? <span className="field-hint">{hint}</span> : null}
      </div>
    </div>
  );
}

function SidebarToggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      <div className="admin-toggle admin-post-toggle">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={event => onChange(event.target.checked)}
        />
        <span className="admin-post-toggle-label">{checked ? "Yes" : "No"}</span>
      </div>
    </div>
  );
}

function CheckboxRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="field-row admin-post-checkbox-row">
      <span className="admin-post-checkbox-spacer" aria-hidden="true" />
      <label className="admin-post-checkbox-label" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
        {label}
      </label>
    </div>
  );
}

export function BlogPostEditor({
  ims,
  postId,
  onClose,
  onNavigateSection,
}: {
  ims: Ims;
  postId: number | null;
  onClose: () => void;
  onNavigateSection?: (section: "categories" | "tags") => void;
}) {
  const draftKey = useRef(`draft-${Date.now()}`);
  const [record, setRecord] = useState<BlogPostRecord>(emptyPost());
  const [categories, setCategories] = useState<BlogTaxonomyItem[]>([]);
  const [tags, setTags] = useState<BlogTaxonomyItem[]>([]);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroupOption[]>([]);
  const [loading, setLoading] = useState(postId != null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [urlKeyTouched, setUrlKeyTouched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setMessage("");
      try {
        const [categoryPage, tagPage, groupPage] = await Promise.all([
          invokeBlogAction<{ items: BlogTaxonomyItem[] }>(ims, "blog-category-list", { listAll: true }),
          invokeBlogAction<{ items: BlogTaxonomyItem[] }>(ims, "blog-tag-list", { listAll: true }),
          invokeBlogAction<{ items: CustomerGroupOption[] }>(ims, "blog-customer-groups", {}),
        ]);
        if (cancelled) return;
        setCategories(categoryPage.items || []);
        setTags(tagPage.items || []);
        setCustomerGroups(groupPage.items || []);
        if (postId != null) {
          const result = await invokeBlogAction<{ post: BlogPostRecord }>(ims, "blog-post-list", { postId });
          if (cancelled) return;
          setRecord(postFromResponse(result.post));
          setUrlKeyTouched(true);
        } else {
          setRecord(emptyPost());
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Unable to load the post.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ims, postId]);

  function patch(fields: Partial<BlogPostRecord>) {
    setRecord(current => ({ ...current, ...fields }));
  }

  async function upload(kind: ImageKind, file: File) {
    setUploading(true);
    setMessage("");
    try {
      const content = await fileToBase64(file);
      const uploaded = await invokeBlogAction<{ url: string }>(ims, "blog-post-asset", {
        postKey: record.postId ? String(record.postId) : draftKey.current,
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

  function payload(status: BlogPostRecord["status"]): Record<string, unknown> {
    return {
      title: record.title,
      url_key: record.url_key,
      use_short_content: record.use_short_content,
      short_content: record.short_content,
      content: record.content,
      featured_products_widget: record.featured_products_widget,
      recommended_products_widget: record.recommended_products_widget,
      featured_image: record.featured_image,
      mobile_image: record.mobile_image,
      featured_image_title: record.featured_image_title,
      featured_image_alt: record.featured_image_alt,
      featured_image_link: record.featured_image_link,
      listing_image: record.listing_image,
      listing_image_title: record.listing_image_title,
      listing_image_alt: record.listing_image_alt,
      status,
      publish_at: fromDatetimeLocal(record.publish_at),
      end_at: fromDatetimeLocal(record.end_at),
      is_featured: record.is_featured,
      is_recipe: record.is_recipe,
      category_ids: record.category_ids,
      tag_ids: record.tag_ids,
      customer_group_ids: customerGroupIdsForSave(record.customer_group_ids),
      meta_title: record.meta_title,
      meta_keywords: record.meta_keywords,
      meta_description: record.meta_description,
      meta_prefix: record.meta_prefix,
      meta_suffix: record.meta_suffix,
    };
  }

  async function save(options: { status: BlogPostRecord["status"]; stay: boolean; duplicate?: boolean }) {
    if (!record.title.trim()) {
      setMessage("Title is required.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const result = await invokeBlogAction<{ post: BlogPostRecord }>(ims, "blog-post-write", {
        postId: record.postId ?? undefined,
        fields: payload(options.status),
      });
      let saved = postFromResponse(result.post);
      if (options.duplicate) {
        const duplicateFields = {
          ...payload("draft"),
          title: `${saved.title} (Copy)`,
          url_key: "",
        };
        const dup = await invokeBlogAction<{ post: BlogPostRecord }>(ims, "blog-post-write", { fields: duplicateFields });
        saved = postFromResponse(dup.post);
      }
      setRecord(saved);
      setUrlKeyTouched(true);
      setMessage(options.duplicate ? "Post saved and duplicated as draft." : "Post saved.");
      if (!options.stay && !options.duplicate) onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the post.");
    } finally {
      setSaving(false);
    }
  }

  async function removePost() {
    if (record.postId == null) return;
    const confirmed = window.confirm("Are you sure you want to delete this post?");
    if (!confirmed) return;
    setSaving(true);
    setMessage("");
    try {
      await invokeBlogAction(ims, "blog-post-mass", { operation: "delete", ids: [record.postId] });
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete the post.");
      setSaving(false);
    }
  }

  const busy = loading || saving || uploading;
  const heading = record.postId == null ? "New Post" : "Edit Post";
  const statusClass = record.status === "published" ? "admin-post-status-published" : "admin-post-status-draft";
  const statusText = record.status === "published" ? "Published" : "Draft";

  return (
    <main className="conditional-blocks block-edit-page admin-post-edit">
      {busy ? <CommerceLoader /> : null}
      <header className="admin-post-edit-header">
        <h1>{heading}</h1>
        <div className="admin-post-action-band">
          <span className="admin-post-action-context">Posts</span>
          <div className="block-edit-actions admin-post-edit-actions">
          <button type="button" onClick={onClose} disabled={busy}>← Back</button>
          {record.postId != null ? (
            <button type="button" onClick={() => void removePost()} disabled={busy}>Delete</button>
          ) : null}
          <button type="button" disabled={busy} onClick={() => void save({ status: "draft", stay: true })}>
            Save as Draft
          </button>
          <button type="button" disabled={busy} onClick={() => void save({ status: record.status, stay: true })}>
            Save and Continue Edit
          </button>
          <button
            type="button"
            className="admin-primary"
            disabled={busy}
            onClick={() => void save({
              status: record.status === "draft" ? "published" : record.status,
              stay: true,
            })}
          >
            {record.status === "published" ? "Update Post" : "Publish Post"}
          </button>
          </div>
        </div>
      </header>
      {message ? <p className="message admin-post-message" role="status">{message}</p> : null}
      <div className="admin-post-edit-layout">
        <div className="admin-post-main">
          <Field id="post-title" label="Title" required>
            <input
              id="post-title"
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
          <Field id="post-url-key" label="URL-Key" required>
            <input
              id="post-url-key"
              value={record.url_key}
              onChange={event => {
                setUrlKeyTouched(true);
                patch({ url_key: event.target.value });
              }}
            />
          </Field>
          <div className="admin-post-media-field-row admin-post-media-field-row--hero">
            <span className="admin-post-media-side-label" aria-hidden="true" />
            <div className="admin-post-media-featured">
              <div className="admin-post-image-duo">
                <PostImageUpload
                  id="post-featured-image"
                  label="Featured Image"
                  hint="500×500"
                  url={record.featured_image}
                  disabled={uploading}
                  onFile={file => void upload("featured_image", file)}
                  onClear={() => patch({ featured_image: "" })}
                />
                <PostImageUpload
                  id="post-mobile-image"
                  label="Mobile Image"
                  hint="500×300"
                  url={record.mobile_image}
                  disabled={uploading}
                  onFile={file => void upload("mobile_image", file)}
                  onClear={() => patch({ mobile_image: "" })}
                />
              </div>
              <div className="admin-post-image-meta-stack">
                <Field id="post-featured-image-title" label="Image Title">
                  <input
                    id="post-featured-image-title"
                    value={record.featured_image_title}
                    onChange={event => patch({ featured_image_title: event.target.value })}
                  />
                </Field>
                <Field id="post-featured-image-alt" label="Alt Text">
                  <input
                    id="post-featured-image-alt"
                    value={record.featured_image_alt}
                    onChange={event => patch({ featured_image_alt: event.target.value })}
                  />
                </Field>
                <Field id="post-featured-image-link" label="Image Link On The Full Content Page">
                  <input
                    id="post-featured-image-link"
                    value={record.featured_image_link}
                    onChange={event => patch({ featured_image_link: event.target.value })}
                  />
                </Field>
              </div>
            </div>
          </div>
          <div className="admin-post-media-field-row">
            <span className="admin-post-media-side-label">Listing Image</span>
            <div className="admin-post-media-listing">
              <PostImageUpload
                id="post-listing-image"
                label="Listing Image"
                hideLabel
                url={record.listing_image}
                disabled={uploading}
                onFile={file => void upload("listing_image", file)}
                onClear={() => patch({ listing_image: "" })}
              />
              <div className="admin-post-image-meta-stack">
                <Field id="post-listing-image-title" label="Listing Image Title">
                  <input
                    id="post-listing-image-title"
                    value={record.listing_image_title}
                    onChange={event => patch({ listing_image_title: event.target.value })}
                  />
                </Field>
                <Field id="post-listing-image-alt" label="Listing Image Alt Text">
                  <input
                    id="post-listing-image-alt"
                    value={record.listing_image_alt}
                    onChange={event => patch({ listing_image_alt: event.target.value })}
                  />
                </Field>
              </div>
            </div>
          </div>
          <CheckboxRow
            id="post-use-short-content"
            label="Short Content"
            checked={record.use_short_content}
            onChange={checked => patch({ use_short_content: checked })}
          />
          {record.use_short_content ? (
            <div className="field-row admin-post-editor-row">
              <label htmlFor="post-short-content">Short Content</label>
              <div className="admin-post-editor-wrap">
                <HtmlEditor
                  id="post-short-content"
                  label=""
                  value={record.short_content}
                  onChange={html => patch({ short_content: html })}
                />
              </div>
            </div>
          ) : null}
          <div className="field-row admin-post-editor-row">
            <label htmlFor="post-content">Content</label>
            <div className="admin-post-editor-wrap">
              <HtmlEditor
                id="post-content"
                label=""
                value={record.content}
                onChange={html => patch({ content: html })}
                hint="Required when status is Published."
              />
            </div>
          </div>
          <CheckboxRow
            id="post-featured-products-widget"
            label="Featured Products Widget"
            checked={record.featured_products_widget}
            onChange={checked => patch({ featured_products_widget: checked })}
          />
          <CheckboxRow
            id="post-recommended-products-widget"
            label="Recommended Products Widget"
            checked={record.recommended_products_widget}
            onChange={checked => patch({ recommended_products_widget: checked })}
          />
          <section className="admin-post-meta-block">
            <h2>Search Engine Optimization</h2>
            <Field id="post-meta-title" label="Meta Title">
              <span>
                <input
                  id="post-meta-title"
                  value={record.meta_title}
                  onChange={event => patch({ meta_title: event.target.value })}
                />
                <span className="field-hint">{record.meta_title.length} characters used. Recommended max length is 50–60 characters.</span>
              </span>
            </Field>
            <Field id="post-meta-keywords" label="Meta Keywords">
              <span>
                <input
                  id="post-meta-keywords"
                  value={record.meta_keywords}
                  onChange={event => patch({ meta_keywords: event.target.value })}
                />
                <span className="field-hint">{record.meta_keywords.length} characters used. Recommended max length is 50–160 characters.</span>
              </span>
            </Field>
            <Field id="post-meta-description" label="Meta Description">
              <span>
                <input
                  id="post-meta-description"
                  value={record.meta_description}
                  onChange={event => patch({ meta_description: event.target.value })}
                />
                <span className="field-hint">{record.meta_description.length} characters used. Recommended max length is 50–160 characters.</span>
              </span>
            </Field>
            <Field id="post-meta-prefix" label="Prefix">
              <input id="post-meta-prefix" value={record.meta_prefix} onChange={event => patch({ meta_prefix: event.target.value })} />
            </Field>
            <Field id="post-meta-suffix" label="Suffix">
              <input id="post-meta-suffix" value={record.meta_suffix} onChange={event => patch({ meta_suffix: event.target.value })} />
            </Field>
          </section>
        </div>
        <aside className="admin-post-sidebar" aria-label="Post publishing">
          <p className={`admin-post-status ${statusClass}`} role="status">
            {statusText === "Published" ? "Published" : "Draft"}
          </p>
          <Field id="post-publish-at" label="Publish now">
            <input
              id="post-publish-at"
              type="datetime-local"
              value={record.publish_at}
              onChange={event => patch({ publish_at: event.target.value })}
            />
          </Field>
          <Field id="post-end-at" label="End at">
            <input
              id="post-end-at"
              type="datetime-local"
              value={record.end_at}
              onChange={event => patch({ end_at: event.target.value })}
            />
          </Field>
          <SidebarToggle
            id="post-is-featured"
            label="Is Featured"
            checked={record.is_featured}
            onChange={checked => patch({ is_featured: checked })}
          />
          <Field id="post-is-recipe" label="Is Recipe">
            <select
              id="post-is-recipe"
              value={record.is_recipe ? "yes" : "no"}
              onChange={event => patch({ is_recipe: event.target.value === "yes" })}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
          <div className="admin-post-sidebar-taxonomy">
            <AdminMultiselect
              id="post-categories"
              label="Categories"
              options={categories.map(item => ({ value: String(item.id), label: item.title }))}
              values={record.category_ids}
              onChange={category_ids => patch({ category_ids })}
              onAddNew={onNavigateSection ? () => onNavigateSection("categories") : undefined}
              disabled={busy}
            />
            {onNavigateSection ? (
              <button type="button" className="admin-inline-link" onClick={() => onNavigateSection("categories")}>
                Manage categories under Blog → Categories.
              </button>
            ) : null}
          </div>
          <div className="admin-post-sidebar-taxonomy">
            <AdminMultiselect
              id="post-tags"
              label="Tags"
              options={tags.map(item => ({ value: String(item.id), label: item.title }))}
              values={record.tag_ids}
              onChange={tag_ids => patch({ tag_ids })}
              onAddNew={onNavigateSection ? () => onNavigateSection("tags") : undefined}
              disabled={busy}
            />
            {onNavigateSection ? (
              <button type="button" className="admin-inline-link" onClick={() => onNavigateSection("tags")}>
                Manage tags under Blog → Tags.
              </button>
            ) : null}
          </div>
          <Field id="post-customer-groups" label="Enable post for customer groups">
            <select
              id="post-customer-groups"
              className="admin-post-customer-groups-select"
              multiple
              size={Math.min(8, Math.max(4, customerGroups.length || 4))}
              value={record.customer_group_ids}
              disabled={busy}
              onChange={event =>
                patch({
                  customer_group_ids: applyCustomerGroupSelection(
                    record.customer_group_ids,
                    [...event.currentTarget.selectedOptions].map(option => option.value),
                  ),
                })
              }
            >
              {customerGroups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.label}
                </option>
              ))}
            </select>
          </Field>
        </aside>
      </div>
    </main>
  );
}
