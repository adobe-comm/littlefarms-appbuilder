/**
 * Top-level LittleFarms admin modules shown in the app module menu.
 * Register new modules here when adding features (do not use generic "Module" labels).
 */

export type AppModuleDefinition = {
  id: string;
  /** Label in the left-hand module menu */
  menuLabel: string;
  /** Default page heading when this module is active */
  pageTitle: string;
  /** When false, hidden until the feature is ready */
  available: boolean;
};

export const appModules: AppModuleDefinition[] = [
  {
    id: "blocks-management",
    menuLabel: "Blocks",
    pageTitle: "Blocks",
    available: true,
  },
  {
    id: "brands-management",
    menuLabel: "Brands",
    pageTitle: "Brands",
    available: true,
  },
  {
    id: "settings",
    menuLabel: "Settings",
    pageTitle: "Settings",
    available: true,
  },
];

export function getAppModule(id: string): AppModuleDefinition | undefined {
  return appModules.find(module => module.id === id && module.available);
}

export const defaultAppModuleId = "blocks-management";
