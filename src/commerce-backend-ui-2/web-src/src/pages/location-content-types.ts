export type ContentStatus = "enabled" | "disabled";

export type PickerOption = {
  value: string;
  label: string;
};

export type LocationServiceRecord = {
  serviceId: number | null;
  status: ContentStatus;
  title: string;
  serviceUrl: string;
  icon: string;
};

export type LocationGalleryRecord = {
  galleryId: number | null;
  status: ContentStatus;
  title: string;
  image: string;
  imageAlt: string;
};

export type LocationTeamRecord = {
  profileId: number | null;
  status: ContentStatus;
  name: string;
  jobTitle: string;
  image: string;
  sortOrder: string;
};

export const contentPageSizes = [20, 30, 50, 100, 200] as const;

export function emptyService(): LocationServiceRecord {
  return { serviceId: null, status: "enabled", title: "", serviceUrl: "", icon: "" };
}

export function emptyGallery(): LocationGalleryRecord {
  return { galleryId: null, status: "enabled", title: "", image: "", imageAlt: "" };
}

export function emptyTeamProfile(): LocationTeamRecord {
  return { profileId: null, status: "enabled", name: "", jobTitle: "", image: "", sortOrder: "" };
}

export type ContentPickerResponse = {
  options: PickerOption[];
};

export type LocationContentKind = "service" | "gallery" | "team";

export type ServiceListItem = {
  serviceId: number;
  title: string;
  status: ContentStatus;
  createdAt: string;
};

export type GalleryListItem = {
  galleryId: number;
  title: string;
  status: ContentStatus;
  image: string;
  createdAt: string;
};

export type TeamListItem = {
  profileId: number;
  name: string;
  sortOrder: number;
  status: ContentStatus;
  image: string;
  createdAt: string;
};

export type LocationContentListResponse = {
  items: ServiceListItem[] | GalleryListItem[] | TeamListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export function contentKindMeta(kind: LocationContentKind) {
  if (kind === "service") {
    return {
      kind,
      heading: "Service",
      addLabel: "Add New Service",
      searchPlaceholder: "Search by keyword",
      idParam: "serviceId" as const,
    };
  }
  if (kind === "gallery") {
    return {
      kind,
      heading: "Gallery",
      addLabel: "Add New Gallery",
      searchPlaceholder: "Search by keyword",
      idParam: "galleryId" as const,
    };
  }
  return {
    kind,
    heading: "Team Profile",
    addLabel: "Add New Profile",
    searchPlaceholder: "Search by keyword",
    idParam: "profileId" as const,
  };
}
