import { countryName } from "./locations-directory.ts";

export type LocationStatus = "enabled" | "disabled";

export type StoreLocation = {
  locationId: number;
  title: string;
  storeViewLabel: string;
  country: string;
  city: string;
  street: string;
  phone: string;
  email: string;
  websiteUrl: string;
  zip: string;
  status: LocationStatus;
};

export type LocationFilters = {
  idFrom: string;
  idTo: string;
  title: string;
  country: string;
  city: string;
  street: string;
  phone: string;
  email: string;
  websiteUrl: string;
  zip: string;
  status: "" | LocationStatus;
};

export type LocationListResponse = {
  items: StoreLocation[];
  total: number;
  page: number;
  pageSize: number;
  countries: string[];
};

export const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export type WeekDay = (typeof WEEK_DAYS)[number];

export type DayHours = {
  open: boolean;
  from: string;
  to: string;
};

export type WeekHours = Record<WeekDay, DayHours>;

export type LocationRecord = {
  locationId: number | null;
  status: LocationStatus;
  logo: string;
  title: string;
  storeUrl: string;
  country: string;
  state: string;
  city: string;
  street: string;
  zip: string;
  phone: string;
  email: string;
  websiteUrl: string;
  openInNewTab: boolean;
  storeViews: string[];
  description: string;
  sortOrder: string;
  locationImage: string;
  mapMarker: string;
  metaTitle: string;
  metaKeywords: string;
  metaDescription: string;
  isFeatured: boolean;
  zoom: string;
  latitude: string;
  longitude: string;
  storeBanner: string;
  travelSuggestion: string;
  services: string[];
  storeContent: string;
  galleries: string[];
  galleryTitle: string;
  galleryDescription: string;
  teamProfiles: string[];
  promotions: string;
  isStore: boolean;
  storeHours: WeekHours;
  isCafe: boolean;
  cafeHours: WeekHours;
};

export const STORE_VIEW_OPTIONS = ["All Store Views", "Main Website", "Main Website Store", "Default Store View"];

export const locationSections = [
  { id: "general", label: "General Information" },
  { id: "maps", label: "Google Maps Settings" },
  { id: "content", label: "Store Content" },
  { id: "store-hours", label: "Store Hours" },
  { id: "cafe-hours", label: "Cafe Hours" },
];

const DAY_LABELS: Record<WeekDay, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function dayLabel(day: WeekDay): string {
  return DAY_LABELS[day];
}

/** 24-hour clock `HH:mm` for store / cafe hours. */
export function normalizeTime24(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function emptyWeekHours(): WeekHours {
  return {
    monday: { open: false, from: "", to: "" },
    tuesday: { open: false, from: "", to: "" },
    wednesday: { open: false, from: "", to: "" },
    thursday: { open: false, from: "", to: "" },
    friday: { open: false, from: "", to: "" },
    saturday: { open: false, from: "", to: "" },
    sunday: { open: false, from: "", to: "" },
  };
}

export function emptyLocation(): LocationRecord {
  return {
    locationId: null,
    status: "enabled",
    logo: "",
    title: "",
    storeUrl: "",
    country: "US",
    state: "",
    city: "",
    street: "",
    zip: "",
    phone: "",
    email: "",
    websiteUrl: "",
    openInNewTab: false,
    storeViews: ["All Store Views"],
    description: "",
    sortOrder: "",
    locationImage: "",
    mapMarker: "",
    metaTitle: "",
    metaKeywords: "",
    metaDescription: "",
    isFeatured: false,
    zoom: "",
    latitude: "",
    longitude: "",
    storeBanner: "",
    travelSuggestion: "",
    services: [],
    storeContent: "",
    galleries: [],
    galleryTitle: "",
    galleryDescription: "",
    teamProfiles: [],
    promotions: "",
    isStore: false,
    storeHours: emptyWeekHours(),
    isCafe: false,
    cafeHours: emptyWeekHours(),
  };
}

export function locationFromResponse(raw: Partial<LocationRecord> | null | undefined): LocationRecord {
  const blank = emptyLocation();
  if (!raw) return blank;
  const hours = (value: WeekHours | undefined, fallback: WeekHours): WeekHours => {
    const next = { ...fallback };
    for (const day of WEEK_DAYS) {
      const row = value?.[day];
      if (!row) continue;
      next[day] = {
        open: row.open === true,
        from: normalizeTime24(row.from || ""),
        to: normalizeTime24(row.to || ""),
      };
    }
    return next;
  };
  return {
    ...blank,
    ...raw,
    locationId: typeof raw.locationId === "number" ? raw.locationId : null,
    status: raw.status === "disabled" ? "disabled" : "enabled",
    openInNewTab: raw.openInNewTab === true,
    isFeatured: raw.isFeatured === true,
    isStore: raw.isStore === true,
    isCafe: raw.isCafe === true,
    storeViews: raw.storeViews?.length ? raw.storeViews : blank.storeViews,
    services: raw.services || [],
    galleries: raw.galleries || [],
    teamProfiles: raw.teamProfiles || [],
    storeHours: hours(raw.storeHours, blank.storeHours),
    cafeHours: hours(raw.cafeHours, blank.cafeHours),
  };
}

export const locationPageSizes = [20, 30, 50, 100, 200] as const;

export function emptyLocationFilters(): LocationFilters {
  return {
    idFrom: "",
    idTo: "",
    title: "",
    country: "",
    city: "",
    street: "",
    phone: "",
    email: "",
    websiteUrl: "",
    zip: "",
    status: "",
  };
}

export function locationFilterLabels(filters: LocationFilters): string[] {
  const labels: string[] = [];
  if (filters.idFrom.trim() || filters.idTo.trim()) {
    const range = [
      filters.idFrom.trim() ? `from ${filters.idFrom.trim()}` : "",
      filters.idTo.trim() ? `to ${filters.idTo.trim()}` : "",
    ].filter(Boolean).join(" ");
    labels.push(`ID: ${range}`);
  }
  if (filters.title.trim()) labels.push(`Title: ${filters.title.trim()}`);
  if (filters.country.trim()) labels.push(`Country: ${countryName(filters.country.trim())}`);
  if (filters.city.trim()) labels.push(`City: ${filters.city.trim()}`);
  if (filters.street.trim()) labels.push(`Street: ${filters.street.trim()}`);
  if (filters.phone.trim()) labels.push(`Phone: ${filters.phone.trim()}`);
  if (filters.email.trim()) labels.push(`Email: ${filters.email.trim()}`);
  if (filters.websiteUrl.trim()) labels.push(`Website url: ${filters.websiteUrl.trim()}`);
  if (filters.zip.trim()) labels.push(`Zip: ${filters.zip.trim()}`);
  if (filters.status === "enabled") labels.push("Status: Enabled");
  if (filters.status === "disabled") labels.push("Status: Disabled");
  return labels;
}
