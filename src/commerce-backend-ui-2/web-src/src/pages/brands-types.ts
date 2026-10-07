export type DropdownAttribute = {
  code: string;
  label: string;
  optionsCount: number;
};

export type BrandRecord = {
  optionValue: string;
  optionLabel: string;
  attributeCode: string;
  storeViewCode: string;
  is_active: boolean;
  is_new_brand: boolean;
  is_top_brand: boolean;
  is_featured: boolean;
  show_in_brand_list_widget: boolean;
  show_in_brand_slider_widget: boolean;
  slider_position: number;
  url_alias: string;
  meta_title: string;
  meta_description: string;
  meta_keywords: string;
  page_title: string;
  description: string;
  short_description: string;
  image: string;
  image_alt: string;
  small_image: string;
  small_image_alt: string;
  meta_title_use_default?: boolean;
  page_title_use_default?: boolean;
};

export type BrandListResponse = {
  attributeCode: string;
  storeViewCode: string;
  page: number;
  pageSize: number;
  total: number;
  items: BrandRecord[];
};

export const ALL_STORE_VIEWS = "all";
export const DEFAULT_STORE_VIEW = "default";

export function scopeLabel(code: string): string {
  if (code === ALL_STORE_VIEWS) return "All Store Views";
  if (code === DEFAULT_STORE_VIEW) return "Default Store View";
  return code;
}

export function plainText(value: string): string {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
