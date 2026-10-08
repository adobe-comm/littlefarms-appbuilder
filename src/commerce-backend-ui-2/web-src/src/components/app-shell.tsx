import type { ReactNode } from "react";
import {
  appModules,
  defaultAppModuleId,
} from "../modules/registry.ts";

type AppShellProps = {
  activeModuleId: string;
  onModuleChange: (moduleId: string) => void;
  children: ReactNode;
};

export function AppShell({ activeModuleId, onModuleChange, children }: AppShellProps) {
  const visibleModules = appModules.filter(module => module.available);

  return (
    <div className="lf-app-shell">
      <aside className="lf-module-rail" aria-label="Little Farms Admin features">
        <p className="lf-module-rail-heading">Features</p>
        <nav className="lf-module-nav">
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
      </aside>
      <div className="lf-app-main">{children}</div>
    </div>
  );
}

export { defaultAppModuleId };
