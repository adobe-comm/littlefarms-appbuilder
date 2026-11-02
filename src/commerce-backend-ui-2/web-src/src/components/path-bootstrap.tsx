import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  isFeatureMenuRoute,
  parseRelativeAppPath,
  readLastPath,
  setViewMode,
  shouldRestoreLastPathOnBoot,
  syncNavigationFromRoutePath,
} from "../lib/module-route.ts";

type PathBootstrapProps = {
  useModuleLauncher: boolean;
  onReady: () => void;
};

/**
 * Runs once on load: sync hash route → session, or restore last path after reload.
 */
export function PathBootstrap({ useModuleLauncher, onReady }: PathBootstrapProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const ran = useRef(false);

  useLayoutEffect(() => {
    if (ran.current) {
      return;
    }
    ran.current = true;

    const routePath = location.pathname;
    const parsed = parseRelativeAppPath(routePath);

    if (parsed && parsed !== "menu") {
      syncNavigationFromRoutePath(routePath);
      onReady();
      return;
    }

    if (shouldRestoreLastPathOnBoot(useModuleLauncher)) {
      const lastPath = readLastPath();
      if (lastPath) {
        navigate(lastPath, { replace: true });
        onReady();
        return;
      }
    }

    if (useModuleLauncher && isFeatureMenuRoute(routePath)) {
      setViewMode("menu");
      syncNavigationFromRoutePath(routePath);
    } else if (!useModuleLauncher && isFeatureMenuRoute(routePath)) {
      const lastPath = readLastPath();
      if (lastPath && lastPath !== "/") {
        navigate(lastPath, { replace: true });
      }
    }

    onReady();
  }, [location.pathname, navigate, onReady, useModuleLauncher]);

  return null;
}

export function useSyncNavigationPath(routePath: string, enabled: boolean) {
  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    syncNavigationFromRoutePath(routePath);
  }, [enabled, routePath]);
}
