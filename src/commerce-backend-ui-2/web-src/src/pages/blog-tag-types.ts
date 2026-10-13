export type BlogTagRecord = {
  tagId: number | null;
  title: string;
  url_key: string;
  is_active: boolean;
  meta_title: string;
  meta_keywords: string;
  meta_description: string;
  meta_prefix: string;
  meta_suffix: string;
  createdAt?: string;
  updatedAt?: string;
};

export type BlogTagListItem = {
  id: string;
  tagId: number;
  title: string;
  url_key: string;
  usedInPosts: number;
  createdAt: string;
};

export type BlogTagListResponse = {
  items: BlogTagListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export const blogTagPageSizes = [20, 30, 50, 100] as const;

export function emptyTag(): BlogTagRecord {
  return {
    tagId: null,
    title: "",
    url_key: "",
    is_active: true,
    meta_title: "",
    meta_keywords: "",
    meta_description: "",
    meta_prefix: "",
    meta_suffix: "",
  };
}

export function tagFromResponse(tag: BlogTagRecord): BlogTagRecord {
  return {
    ...emptyTag(),
    ...tag,
    tagId: tag.tagId ?? null,
  };
}

export function slugifyTitle(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "tag";
}
