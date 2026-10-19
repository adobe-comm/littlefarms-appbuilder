import { useEffect, useState, type ReactNode } from "react";
import {
  appModules,
  defaultAppModuleId,
} from "../modules/registry.ts";

const MODULE_NAV_COLLAPSED_KEY = "littlefarms.admin.moduleNavCollapsed";

type AppShellProps = {
  activeModuleId: string;
  onModuleChange: (moduleId: string) => void;
  children: ReactNode;
};

function readNavCollapsed(): boolean {
  try {
    return window.localStorage.getItem(MODULE_NAV_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppShell({ activeModuleId, onModuleChange, children }: AppShellProps) {
  const visibleModules = appModules.filter(module => module.available);
  const [navCollapsed, setNavCollapsed] = useState(readNavCollapsed);

  useEffect(() => {
    try {
      window.localStorage.setItem(MODULE_NAV_COLLAPSED_KEY, navCollapsed ? "1" : "0");
    } catch {
      // ignore private browsing / quota errors
    }
  }, [navCollapsed]);

  return (
    <div className={`lf-app-shell${navCollapsed ? " lf-app-shell--nav-collapsed" : ""}`}>
      {!navCollapsed && (
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
      {navCollapsed && (
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
      <div className="lf-app-main">{children}</div>
    </div>
  );
}

export { defaultAppModuleId };
