export type BrandListItem = {
  image: string;
  name: string;
  link: string;
};

export type BrandsListLogic = {
  url: string;
  items: BrandListItem[];
};

export const MAX_BRAND_ITEMS = 50;

export function emptyBrandItem(): BrandListItem {
  return { image: "", name: "", link: "" };
}

export function emptyBrandsListLogic(): BrandsListLogic {
  return { url: "", items: [emptyBrandItem()] };
}

export function parseBrandsListLogic(raw: unknown): BrandsListLogic {
  const logic = (raw && typeof raw === "object" ? raw : {}) as Partial<BrandsListLogic>;
  const items = Array.isArray(logic.items)
    ? logic.items.map(item => ({
        image: String((item as BrandListItem)?.image ?? "").trim(),
        name: String((item as BrandListItem)?.name ?? "").trim(),
        link: String((item as BrandListItem)?.link ?? "").trim(),
      }))
    : [];
  return {
    url: String(logic.url ?? "").trim(),
    items: items.length > 0 ? items : [emptyBrandItem()],
  };
}
