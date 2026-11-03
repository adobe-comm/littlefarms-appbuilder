import { getAppModule } from "../modules/registry.ts";
import type { BlogSectionId } from "../pages/blog-section-types.ts";
import type { LocationSectionId } from "../pages/location-section-types.ts";

const ACTIVE_MODULE_KEY = "littlefarms.admin.activeModule";
const ACTIVE_SECTION_KEY = "littlefarms.admin.activeSection";
const VIEW_MODE_KEY = "littlefarms.admin.view";
const LAST_PATH_KEY = "littlefarms.admin.lastPath";

export type ModuleViewMode = "menu" | "module";

export type ModuleRoute = {
  moduleId: string;
  section?: string;
};

const BLOG_SECTIONS = new Set<BlogSectionId>(["posts", "categories", "tags"]);
const LOCATION_SECTIONS = new Set<LocationSectionId>(["stores", "services", "galleries", "team"]);

export function isBlogSection(value: string | undefined): value is BlogSectionId {
  return value !== undefined && BLOG_SECTIONS.has(value as BlogSectionId);
}

export function isLocationSection(value: string | undefined): value is LocationSectionId {
  return value !== undefined && LOCATION_SECTIONS.has(value as LocationSectionId);
}

export function normalizeModuleSection(moduleId: string, section?: string): string | undefined {
  if (!section) return undefined;
  if (moduleId === "blog" && isBlogSection(section)) return section;
  if (moduleId === "locations" && isLocationSection(section)) return section;
  return undefined;
}

export function readRouteFromSession(): ModuleRoute | null {
  const storedModule = getAppModule(window.sessionStorage.getItem(ACTIVE_MODULE_KEY) || "")?.id;
  if (!storedModule) return null;
  const storedSection = window.sessionStorage.getItem(ACTIVE_SECTION_KEY) || undefined;
  return {
    moduleId: storedModule,
    section: normalizeModuleSection(storedModule, storedSection),
  };
}

export function navigationEntryType(): PerformanceNavigationTiming["type"] | undefined {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.type;
}

export function readViewMode(): ModuleViewMode {
  const stored = window.sessionStorage.getItem(VIEW_MODE_KEY);
  if (stored === "module" || stored === "menu") {
    return stored;
  }
  if (navigationEntryType() === "reload" && readLastPath() && readLastPath() !== "/") {
    return "module";
  }
  return "menu";
}

export function setViewMode(mode: ModuleViewMode) {
  window.sessionStorage.setItem(VIEW_MODE_KEY, mode);
}

export function readLastPath(): string | null {
  const path = window.sessionStorage.getItem(LAST_PATH_KEY);
  if (!path) return null;
  return path.startsWith("/") ? path : `/${path}`;
}

export function persistLastPath(relativePath: string) {
  const normalized = relativePath === "" ? "/" : relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  window.sessionStorage.setItem(LAST_PATH_KEY, normalized);
}

export function persistModuleRoute(route: ModuleRoute) {
  const section = normalizeModuleSection(route.moduleId, route.section);
  window.sessionStorage.setItem(ACTIVE_MODULE_KEY, route.moduleId);
  if (section) {
    window.sessionStorage.setItem(ACTIVE_SECTION_KEY, section);
  } else {
    window.sessionStorage.removeItem(ACTIVE_SECTION_KEY);
  }
  setViewMode("module");
}

/** Keep session aligned with the current hash route (for refresh in Commerce iframe) */
export function syncNavigationFromRoutePath(routePath: string) {
  const parsed = parseRelativeAppPath(routePath);
  if (parsed === "menu") {
    setViewMode("menu");
    persistLastPath("/");
    return;
  }
  if (parsed) {
    persistModuleRoute(parsed);
    persistLastPath(moduleRouteToPath(parsed));
  }
}

/** @deprecated use syncNavigationFromRoutePath for HashRouter */
export function syncNavigationFromPathname(pathname: string, basename: string) {
  const parsed = parseAppPath(pathname, basename);
  if (parsed === "menu") {
    syncNavigationFromRoutePath("/");
    return;
  }
  if (parsed) {
    syncNavigationFromRoutePath(moduleRouteToPath(parsed));
  }
}

export function routesEqual(a: ModuleRoute, b: ModuleRoute): boolean {
  return a.moduleId === b.moduleId && a.section === b.section;
}

/** App Builder may serve the SPA under a path ending in index.html */
export function getRouterBasename(): string {
  let path = window.location.pathname;
  if (path.endsWith("/index.html")) {
    path = path.slice(0, -"/index.html".length);
  }
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return path || "/";
}

export function moduleRouteToPath(route: ModuleRoute): string {
  const section = normalizeModuleSection(route.moduleId, route.section);
  if (section) {
    return `/${route.moduleId}/${section}`;
  }
  return `/${route.moduleId}`;
}

export type ParsedAppPath = ModuleRoute | "menu";

export function parseAppPath(pathname: string, basename: string): ParsedAppPath | null {
  let rel = pathname;
  const base = basename === "/" ? "" : basename.replace(/\/$/, "");
  if (base) {
    if (pathname === base || pathname === `${base}/`) {
      rel = "/";
    } else if (pathname.startsWith(`${base}/`)) {
      rel = pathname.slice(base.length);
    } else {
      return null;
    }
  }
  if (rel === "" || rel === "/") {
    return "menu";
  }
  const parts = rel.replace(/^\//, "").split("/").filter(Boolean);
  if (parts.length === 0) {
    return "menu";
  }
  const moduleId = parts[0];
  if (!getAppModule(moduleId)) {
    return null;
  }
  const sectionRaw = parts[1];
  return {
    moduleId,
    section: normalizeModuleSection(moduleId, sectionRaw),
  };
}

export function parseRelativeAppPath(relativePath: string): ParsedAppPath | null {
  const normalized = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return parseAppPath(normalized, "/");
}

export function isFeatureMenuPath(pathname: string, basename: string): boolean {
  return parseAppPath(pathname, basename) === "menu";
}

/** Hash-router path (React Router `location.pathname`, e.g. `/settings`) */
export function isFeatureMenuRoute(routePath: string): boolean {
  return parseRelativeAppPath(routePath) === "menu";
}

export function relativePathFromPathname(pathname: string, basename: string): string {
  const parsed = parseAppPath(pathname, basename);
  if (!parsed || parsed === "menu") {
    return "/";
  }
  return moduleRouteToPath(parsed);
}

/**
 * Restore last module only on full reload when the URL/hash reset to index (`/`).
 * Opening Little Farms Admin from the Commerce menu is `navigate` → show index, not lastPath.
 */
export function shouldRestoreLastPathOnBoot(useModuleLauncher: boolean): boolean {
  if (navigationEntryType() !== "reload") {
    return false;
  }
  const lastPath = readLastPath();
  if (!lastPath || lastPath === "/") {
    return false;
  }
  const parsed = parseRelativeAppPath(lastPath);
  if (!parsed || parsed === "menu") {
    return false;
  }
  if (useModuleLauncher) {
    return true;
  }
  return readViewMode() === "module";
}
