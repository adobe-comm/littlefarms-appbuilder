const STORAGE_KEY = "littlefarms.brands.ui";

export type BrandsUiState = {
  page: number;
  search: string;
  optionValue: string;
  section: string;
};

const defaults: BrandsUiState = {
  page: 1,
  search: "",
  optionValue: "",
  section: "general",
};

export function readBrandsUiState(): BrandsUiState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<BrandsUiState>;
    return {
      page: Math.max(1, Number(parsed.page) || 1),
      search: String(parsed.search ?? ""),
      optionValue: String(parsed.optionValue ?? ""),
      section: String(parsed.section ?? "general") || "general",
    };
  } catch {
    return { ...defaults };
  }
}

export function writeBrandsUiState(partial: Partial<BrandsUiState>) {
  const next = { ...readBrandsUiState(), ...partial };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearBrandsUiState() {
  window.sessionStorage.removeItem(STORAGE_KEY);
}
