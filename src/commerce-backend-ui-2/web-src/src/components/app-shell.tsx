import type { ReactNode } from "react";
import {
  appModules,
  defaultAppModuleId,
  getAppModule,
  littleFarmsLogo,
} from "../modules/registry.ts";

type AppShellProps = {
  activeModuleId: string;
  onModuleChange: (moduleId: string) => void;
  children: ReactNode;
};

export function AppShell({ activeModuleId, onModuleChange, children }: AppShellProps) {
  const activeModule = getAppModule(activeModuleId);
  const visibleModules = appModules.filter(module => module.available);

  return (
    <div className="lf-app-shell">
      <aside className="lf-module-rail" aria-label="LittleFarms modules">
        <div className="lf-module-rail-brand">
          <img src={littleFarmsLogo} alt="Little Farms" className="lf-logo" />
          <span className="lf-brand-name">Little Farms</span>
        </div>
        <p className="lf-module-rail-heading">Extensions</p>
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
        {activeModule && (
          <p className="lf-module-active-hint">Viewing: {activeModule.pageTitle}</p>
        )}
      </aside>
      <div className="lf-app-main">{children}</div>
    </div>
  );
}

export { defaultAppModuleId };
