import { getAppModule } from "../modules/registry.ts";
import type { ModuleRoute } from "../lib/module-route.ts";

export type LauncherTarget = {
  moduleId: string;
  label: string;
  section?: string;
};

export type LauncherSection = {
  title: string;
  items: LauncherTarget[];
};

const storeLocationSection: LauncherSection = {
  title: "Store location",
  items: [
    { moduleId: "locations", label: "Locations", section: "stores" },
    { moduleId: "locations", label: "Service", section: "services" },
    { moduleId: "locations", label: "Gallery", section: "galleries" },
    { moduleId: "locations", label: "Team profile", section: "team" },
  ],
};

const brandManagementSection: LauncherSection = {
  title: "Brand management",
  items: [{ moduleId: "brands-management", label: "Brand" }],
};

const contentSection: LauncherSection = {
  title: "Content",
  items: [{ moduleId: "blocks-management", label: "Blocks" }],
};

const blogsSection: LauncherSection = {
  title: "Blogs",
  items: [
    { moduleId: "blog", label: "Posts", section: "posts" },
    { moduleId: "blog", label: "Categories", section: "categories" },
    { moduleId: "blog", label: "Tags", section: "tags" },
  ],
};

const systemSection: LauncherSection = {
  title: "System",
  items: [
    { moduleId: "delivery-slot-management", label: "Delivery time slot" },
    { moduleId: "settings", label: "Setting" },
  ],
};

type LauncherGridSlot = {
  section: LauncherSection;
  gridArea: "store" | "brand" | "blogs" | "content" | "system";
};

/** Grid placement — Blogs and Content share row 2 for aligned headers. */
const launcherGridSlots: LauncherGridSlot[] = [
  { section: storeLocationSection, gridArea: "store" },
  { section: brandManagementSection, gridArea: "brand" },
  { section: blogsSection, gridArea: "blogs" },
  { section: contentSection, gridArea: "content" },
  { section: systemSection, gridArea: "system" },
];

export const launcherSections: LauncherSection[] = [
  storeLocationSection,
  brandManagementSection,
  blogsSection,
  contentSection,
  systemSection,
];

type ModuleLauncherProps = {
  onSelect: (moduleId: string, section?: string) => void;
};

function isLauncherItemActive(route: ModuleRoute, item: LauncherTarget): boolean {
  if (item.moduleId !== route.moduleId) return false;
  const itemSection = item.section;
  const routeSection = route.section;
  if (itemSection || routeSection) {
    return itemSection === routeSection;
  }
  return true;
}

function filterVisibleSection(section: LauncherSection): LauncherSection | null {
  const items = section.items.filter(item => getAppModule(item.moduleId)?.available);
  if (items.length === 0) return null;
  return { ...section, items };
}

function LauncherMenuCard({
  section,
  gridArea,
  onSelect,
}: {
  section: LauncherSection;
  gridArea: LauncherGridSlot["gridArea"];
  onSelect: (moduleId: string, section?: string) => void;
}) {
  return (
    <div className={`lf-module-launcher-card lf-module-launcher-card--${gridArea}`}>
      <section className="lf-module-launcher-group">
        <h2 className="lf-module-launcher-group-heading">{section.title}</h2>
        <ul className="lf-module-launcher-group-list">
          {section.items.map(item => {
            const key = `${item.moduleId}-${item.section ?? "default"}-${item.label}`;
            return (
              <li key={key}>
                <button
                  type="button"
                  className="lf-module-launcher-link"
                  onClick={() => onSelect(item.moduleId, item.section)}
                >
                  <span className="lf-module-launcher-link-label">{item.label}</span>
                  <span className="lf-module-launcher-link-chevron" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export function ModuleLauncher({ onSelect }: ModuleLauncherProps) {
  return (
    <div className="lf-module-launcher" role="dialog" aria-modal="true" aria-labelledby="lf-module-launcher-title">
      <header className="lf-module-launcher-header">
        <div className="lf-module-launcher-title" id="lf-module-launcher-title" role="heading" aria-level={1}>
          Admin
        </div>
      </header>
      <div className="lf-module-launcher-body">
        <div className="lf-module-launcher-grid">
          {launcherGridSlots.map(slot => {
            const visible = filterVisibleSection(slot.section);
            if (!visible) return null;
            return (
              <LauncherMenuCard
                key={slot.gridArea}
                section={visible}
                gridArea={slot.gridArea}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function activeRouteLabel(route: ModuleRoute): string {
  for (const section of launcherSections) {
    for (const item of section.items) {
      if (isLauncherItemActive(route, item)) {
        return item.label;
      }
    }
  }
  return getAppModule(route.moduleId)?.menuLabel ?? "Feature";
}
