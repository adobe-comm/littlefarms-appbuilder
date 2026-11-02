import { useEffect, useState, type ReactNode } from "react";
import {
  appModules,
  defaultAppModuleId,
} from "../modules/registry.ts";
import { ModuleLauncher } from "./module-launcher.tsx";

const MODULE_NAV_COLLAPSED_KEY = "littlefarms.admin.moduleNavCollapsed";

type AppShellProps = {
  activeModuleId: string;
  featureMenuOpen: boolean;
  onModuleChange: (moduleId: string, section?: string) => void;
  /** Content-style launcher + no Features rail (Commerce embed or local dev) */
  useModuleLauncher?: boolean;
  children: ReactNode;
};

function readNavCollapsed(useModuleLauncher: boolean): boolean {
  if (useModuleLauncher) return true;
  try {
    return window.localStorage.getItem(MODULE_NAV_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppShell({
  activeModuleId,
  featureMenuOpen,
  onModuleChange,
  useModuleLauncher = false,
  children,
}: AppShellProps) {
  const visibleModules = appModules.filter(module => module.available);
  const [navCollapsed, setNavCollapsed] = useState(() => readNavCollapsed(useModuleLauncher));

  useEffect(() => {
    if (useModuleLauncher) return;
    try {
      window.localStorage.setItem(MODULE_NAV_COLLAPSED_KEY, navCollapsed ? "1" : "0");
    } catch {
      // ignore private browsing / quota errors
    }
  }, [navCollapsed, useModuleLauncher]);

  return (
    <div
      className={`lf-app-shell${navCollapsed || useModuleLauncher ? " lf-app-shell--nav-collapsed" : ""}${useModuleLauncher ? " lf-app-shell--embedded" : ""}`}
    >
      {!useModuleLauncher && !navCollapsed && (
        <aside className="lf-module-rail" aria-label="Little Farms Admin features">
          <p className="lf-module-rail-heading">Features</p>
          <nav id="lf-module-nav" className="lf-module-nav">
            {visibleModules.map(module => (
              <button
                key={module.id}
                type="button"
                className={module.id === activeModuleId ? "lf-module-link active" : "lf-module-link"}
                aria-current={module.id === activeModuleId ? "page" : undefined}
                onClick={() => onModuleChange(module.id)}
              >
                {module.menuLabel}
              </button>
            ))}
          </nav>
          <div className="lf-module-rail-footer">
            <button
              type="button"
              className="lf-module-rail-toggle"
              aria-expanded
              aria-controls="lf-module-nav"
              title="Hide"
              onClick={() => setNavCollapsed(true)}
            >
              <span className="lf-module-rail-toggle-icon" aria-hidden="true">‹</span>
              <span className="lf-module-rail-toggle-label">Hide</span>
            </button>
          </div>
        </aside>
      )}
      {!useModuleLauncher && navCollapsed && (
        <button
          type="button"
          className="lf-module-rail-toggle lf-module-rail-toggle--expand"
          aria-expanded={false}
          aria-controls="lf-module-nav"
          title="Show menu"
          onClick={() => setNavCollapsed(false)}
        >
          <span className="lf-module-rail-toggle-icon" aria-hidden="true">›</span>
          <span className="lf-module-rail-toggle-label">Menu</span>
        </button>
      )}
      <div className="lf-app-main">
        {featureMenuOpen ? null : children}
        {featureMenuOpen ? (
          <ModuleLauncher onSelect={onModuleChange} />
        ) : null}
      </div>
    </div>
  );
}

export { defaultAppModuleId };
