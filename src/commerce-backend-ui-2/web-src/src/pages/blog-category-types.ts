export type CategoryStatus = "enabled" | "disabled";

export type CategoryDisplayMode =
  | "blog_posts_only"
  | "static_block_only"
  | "posts_and_static_block";

export const categoryDisplayModeOptions: { value: CategoryDisplayMode; label: string }[] = [
  { value: "blog_posts_only", label: "Blog Posts only" },
  { value: "static_block_only", label: "Static Block only" },
  { value: "posts_and_static_block", label: "Static Block and Blog Posts" },
];

export type BlogCategoryRecord = {
  categoryId: number | null;
  title: string;
  url_key: string;
  parent_id: number | null;
  sort_order: number;
  status: CategoryStatus;
  is_active: boolean;
  image: string;
  image_title: string;
  image_alt: string;
  display_mode: CategoryDisplayMode;
  enable_description: boolean;
  description: string;
  meta_title: string;
  meta_keywords: string;
  meta_description: string;
  meta_prefix: string;
  meta_suffix: string;
  createdAt?: string;
  updatedAt?: string;
};

export type BlogCategoryListItem = {
  id: string;
  categoryId: number;
  title: string;
  url_key: string;
  meta_title: string;
  meta_keywords: string;
  meta_description: string;
  status: CategoryStatus;
  sort_order: number;
  parent_id: number | null;
  usedInPosts: number;
};

export type BlogCategoryListResponse = {
  items: BlogCategoryListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export const blogCategoryPageSizes = [20, 30, 50, 100] as const;

export function emptyCategory(parentId: number | null = null): BlogCategoryRecord {
  return {
    categoryId: null,
    title: "",
    url_key: "",
    parent_id: parentId,
    sort_order: 0,
    status: "disabled",
    is_active: false,
    image: "",
    image_title: "",
    image_alt: "",
    display_mode: "blog_posts_only",
    enable_description: false,
    description: "",
    meta_title: "",
    meta_keywords: "",
    meta_description: "",
    meta_prefix: "",
    meta_suffix: "",
  };
}

const displayModeValues = new Set(categoryDisplayModeOptions.map(option => option.value));

export function categoryFromResponse(category: BlogCategoryRecord): BlogCategoryRecord {
  const display_mode = displayModeValues.has(category.display_mode as CategoryDisplayMode)
    ? category.display_mode
    : "blog_posts_only";
  return {
    ...emptyCategory(),
    ...category,
    categoryId: category.categoryId ?? null,
    parent_id: category.parent_id ?? null,
    sort_order: Number(category.sort_order) || 0,
    status: category.status === "enabled" ? "enabled" : "disabled",
    display_mode,
  };
}

export function slugifyTitle(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "category";
}

export type CategoryTreeNode = {
  categoryId: number;
  title: string;
  parent_id: number | null;
  children: CategoryTreeNode[];
};

export function buildCategoryTree(items: { categoryId: number; title: string; parent_id: number | null }[]): CategoryTreeNode[] {
  const byId = new Map<number, CategoryTreeNode>();
  for (const item of items) {
    byId.set(item.categoryId, {
      categoryId: item.categoryId,
      title: item.title,
      parent_id: item.parent_id,
      children: [],
    });
  }
  const roots: CategoryTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  function sortNodes(nodes: CategoryTreeNode[]) {
    nodes.sort((a, b) => a.title.localeCompare(b.title));
    for (const node of nodes) sortNodes(node.children);
  }
  sortNodes(roots);
  return roots;
}
