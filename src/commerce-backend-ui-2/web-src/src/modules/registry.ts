/**
 * Top-level LittleFarms admin modules shown in the app module menu.
 * Register new modules here when adding features (do not use generic "Module" labels).
 */
import logoBundled from "../assets/little-farms-logo.png";
import { resolveAssetUrl } from "../lib/resolve-asset-url.ts";

export type AppModuleDefinition = {
  id: string;
  /** Label in the left-hand module menu */
  menuLabel: string;
  /** Default page heading when this module is active */
  pageTitle: string;
  /** When false, hidden until the feature is ready */
  available: boolean;
};

/** Logo served from the bundle or static `web-src/assets/` fallback. */
export const littleFarmsLogo = (() => {
  const fromImportMeta = (() => {
    try {
      return new URL("../assets/little-farms-logo.png", import.meta.url).href;
    } catch {
      return "";
    }
  })();
  const fromBundler = resolveAssetUrl(logoBundled);
  const staticFallback = "./assets/little-farms-logo.png";
  const candidate = fromImportMeta || fromBundler || staticFallback;
  return candidate.includes("[object Object]") ? staticFallback : candidate;
})();

export const appModules: AppModuleDefinition[] = [
  {
    id: "blocks-management",
    menuLabel: "Blocks Management",
    pageTitle: "Blocks Management",
    available: true,
  },
  // Example future entries:
  // { id: "picker-management", menuLabel: "Picker Management", pageTitle: "Picker Management", available: false },
];

export function getAppModule(id: string): AppModuleDefinition | undefined {
  return appModules.find(module => module.id === id && module.available);
}

export const defaultAppModuleId = "blocks-management";
