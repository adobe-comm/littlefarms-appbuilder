export type PostStatus = "draft" | "published";

export type BlogTaxonomyItem = {
  id: string;
  tagId?: number;
  categoryId?: number;
  title: string;
  url_key: string;
  is_active: boolean;
  usedInPosts?: number;
  createdAt?: string;
};

export type BlogPostRecord = {
  postId: number | null;
  title: string;
  url_key: string;
  use_short_content: boolean;
  short_content: string;
  content: string;
  featured_products_widget: boolean;
  recommended_products_widget: boolean;
  featured_image: string;
  mobile_image: string;
  featured_image_title: string;
  featured_image_alt: string;
  featured_image_link: string;
  listing_image: string;
  listing_image_title: string;
  listing_image_alt: string;
  status: PostStatus;
  publish_at: string;
  end_at: string;
  is_featured: boolean;
  is_recipe: boolean;
  category_ids: string[];
  tag_ids: string[];
  /** Empty = all groups (storefront visibility). Form uses `all` sentinel when unrestricted. */
  customer_group_ids: string[];
  meta_title: string;
  meta_keywords: string;
  meta_description: string;
  meta_prefix: string;
  meta_suffix: string;
  createdAt?: string;
  updatedAt?: string;
};

export type BlogPostListItem = {
  postId: number;
  title: string;
  url_key: string;
  status: PostStatus;
  publish_at: string;
  end_at: string;
  is_featured: boolean;
  is_recipe: boolean;
  category_ids: string[];
  tag_ids: string[];
  updatedAt: string;
};

export type BlogPostListResponse = {
  items: BlogPostListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type BlogTaxonomyListResponse = {
  items: BlogTaxonomyItem[];
  total: number;
};

export const blogPostPageSizes = [20, 30, 50, 100] as const;

export type CustomerGroupOption = {
  id: string;
  label: string;
};

/** UI selection: empty stored value means “All Groups”. */
export function customerGroupIdsForForm(stored: string[]): string[] {
  if (!stored.length) return ["all"];
  return [...stored];
}

export function customerGroupIdsForSave(selected: string[]): string[] {
  if (!selected.length || selected.includes("all")) return [];
  return selected.filter(id => id !== "all" && /^\d+$/.test(id));
}

export function applyCustomerGroupSelection(current: string[], next: string[]): string[] {
  const picked = [...new Set(next)];
  if (picked.includes("all")) return ["all"];
  return picked.filter(id => id !== "all");
}

export function emptyPost(): BlogPostRecord {
  return {
    postId: null,
    title: "",
    url_key: "",
    use_short_content: false,
    short_content: "",
    content: "",
    featured_products_widget: false,
    recommended_products_widget: false,
    featured_image: "",
    mobile_image: "",
    featured_image_title: "",
    featured_image_alt: "",
    featured_image_link: "",
    listing_image: "",
    listing_image_title: "",
    listing_image_alt: "",
    status: "draft",
    publish_at: toDatetimeLocal(new Date().toISOString()),
    end_at: "",
    is_featured: false,
    is_recipe: false,
    category_ids: [],
    tag_ids: [],
    customer_group_ids: customerGroupIdsForForm([]),
    meta_title: "",
    meta_keywords: "",
    meta_description: "",
    meta_prefix: "",
    meta_suffix: "",
  };
}

export function postFromResponse(post: BlogPostRecord): BlogPostRecord {
  return {
    ...emptyPost(),
    ...post,
    postId: post.postId ?? null,
    publish_at: toDatetimeLocal(post.publish_at),
    end_at: toDatetimeLocal(post.end_at),
    category_ids: [...(post.category_ids || [])],
    tag_ids: [...(post.tag_ids || [])],
    customer_group_ids: customerGroupIdsForForm(post.customer_group_ids || []),
  };
}

export function toDatetimeLocal(iso: string): string {
  const raw = String(iso || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocal(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

export function slugifyTitle(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "post";
}

export function taxonomyLabels(ids: string[], options: BlogTaxonomyItem[]): string {
  if (!ids.length) return "—";
  const byId = new Map(options.map(item => [String(item.id), item.title]));
  return ids.map(id => byId.get(String(id)) || id).join(", ");
}
