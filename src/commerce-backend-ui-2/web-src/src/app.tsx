import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, useLocation, useNavigate } from "react-router-dom";
import { attach, register } from "@adobe/uix-guest";
import Runtime, { init } from "@adobe/exc-app";

import config from "../../../commerce-extensibility-1/.generated/app.commerce.config.js";
import type { Ims } from "./app-types.ts";
import { LauncherModuleRoutes, ModuleRoutes } from "./components/app-routes.tsx";
import { AppShell, defaultAppModuleId } from "./components/app-shell.tsx";
import { PathBootstrap, useSyncNavigationPath } from "./components/path-bootstrap.tsx";
import {
  isFeatureMenuRoute,
  moduleRouteToPath,
  parseRelativeAppPath,
  type ModuleRoute,
} from "./lib/module-route.ts";
import { CommerceLoader } from "./components/commerce-loader.tsx";

type Host = "commerce-ui" | "commerce-control" | "shell" | "standalone";

const SHELL_RUNTIME_HOST = /^(exc-unifiedcontent\.)?experience(-qa|-stage|-cdn|-cdn-stage)?\.adobe\.(com|net)$/u;
const TIMEOUT_MS = 20000;
const LOCAL_IMS_TOKEN_KEY = "littlefarmsBlocks.localImsToken";
const LOCAL_IMS_ORG_ID_KEY = "littlefarmsBlocks.localImsOrgId";

function shellRuntimeUrl(): URL | null {
  const raw = new URL(window.location.href).searchParams.get("_mr")
    || window.sessionStorage.getItem("unifiedShellMRScript");
  if (!raw) return null;
  const url = new URL(decodeURIComponent(raw));
  if (url.protocol !== "https:" || !SHELL_RUNTIME_HOST.test(url.hostname) || !url.pathname.endsWith(".js")) {
    return null;
  }
  return url;
}

function detectHost(): Host {
  if (window.parent === window) return "standalone";
  if (window.name.startsWith("uix-guest-")) return "commerce-ui";
  if (!window.name) return "commerce-control";
  return shellRuntimeUrl() ? "shell" : "standalone";
}

function connectCommerce(extensionId: string): Promise<Ims> {
  return attach({ id: extensionId, timeout: TIMEOUT_MS }).then(connection => {
    const imsToken = connection.sharedContext?.get("imsToken");
    const imsOrgId = connection.sharedContext?.get("imsOrgId");
    if (!imsToken || !imsOrgId) {
      throw new Error("Commerce Admin did not provide IMS credentials.");
    }
    return { imsToken, imsOrgId };
  });
}

function connectShell(): Promise<Ims> {
  return new Promise((resolve, reject) => {
    const url = shellRuntimeUrl();
    if (!url) {
      reject(new Error("Experience Cloud runtime script is missing or not trusted."));
      return;
    }
    window.sessionStorage.setItem("unifiedShellMRScript", url.toString());
    const timer = window.setTimeout(
      () => reject(new Error("Timed out waiting for the Experience Cloud shell.")),
      TIMEOUT_MS
    );
    init(() => {
      const runtime = Runtime();
      runtime.on("ready", configuration => {
        window.clearTimeout(timer);
        const { imsToken, imsOrg } = configuration ?? runtime.lastConfigurationPayload ?? {};
        if (!imsToken || !imsOrg) {
          reject(new Error("Experience Cloud shell did not provide IMS credentials."));
          return;
        }
        resolve({ imsToken, imsOrgId: imsOrg });
      });
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = url.toString();
    script.onload = () => {
      const ready = (window as unknown as { EXC_MR_READY?: () => void }).EXC_MR_READY;
      if (typeof ready === "function") ready();
    };
    document.head.append(script);
  });
}

function AdminApp({ ims }: { ims: Ims }) {
  const [host] = useState(detectHost);
  const location = useLocation();
  const navigate = useNavigate();
  const [navigationReady, setNavigationReady] = useState(false);
  const onNavigationReady = useCallback(() => setNavigationReady(true), []);

  const inCommerceEmbed = host === "commerce-ui" || host === "shell";
  const useModuleLauncher =
    inCommerceEmbed
    || process.env.NODE_ENV === "development"
    || new URLSearchParams(window.location.search).has("lfLauncher");

  const featureMenuOpen = useModuleLauncher && isFeatureMenuRoute(location.pathname);

  const activeModuleId = useMemo(() => {
    const parsed = parseRelativeAppPath(location.pathname);
    if (parsed && parsed !== "menu") {
      return parsed.moduleId;
    }
    return defaultAppModuleId;
  }, [location.pathname]);

  useSyncNavigationPath(location.pathname, navigationReady);

  useEffect(() => {
    const embedClass = "lf-embed";
    if (inCommerceEmbed) {
      document.documentElement.classList.add(embedClass);
    }
    return () => document.documentElement.classList.remove(embedClass);
  }, [inCommerceEmbed]);

  useEffect(() => {
    const legacy = window.location.hash.replace(/^#/, "").trim();
    if (legacy.startsWith("lf/") || legacy === "lf") {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
  }, []);

  const navigateModule = (moduleId: string, section?: string) => {
    const route: ModuleRoute = { moduleId, section };
    navigate(moduleRouteToPath(route));
  };

  return (
    <>
      <PathBootstrap useModuleLauncher={useModuleLauncher} onReady={onNavigationReady} />
      <AppShell
        activeModuleId={activeModuleId}
        featureMenuOpen={featureMenuOpen}
        onModuleChange={navigateModule}
        useModuleLauncher={useModuleLauncher}
      >
        {useModuleLauncher ? (
          <LauncherModuleRoutes ims={ims} />
        ) : (
          <ModuleRoutes ims={ims} />
        )}
      </AppShell>
    </>
  );
}

function App() {
  const [host] = useState(detectHost);
  const [ims, setIms] = useState<Ims | null>(() =>
    detectHost() === "standalone"
      ? {
          imsToken: window.sessionStorage.getItem(LOCAL_IMS_TOKEN_KEY) || "test-token",
          imsOrgId: window.sessionStorage.getItem(LOCAL_IMS_ORG_ID_KEY) || "test-org-id",
        }
      : null,
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const extensionId = config.metadata.id;
    if (host === "commerce-control") {
      void register({ id: extensionId, methods: {} }).catch(setError);
    } else if (host === "commerce-ui") {
      connectCommerce(extensionId).then(setIms, setError);
    } else if (host === "shell") {
      connectShell().then(setIms, setError);
    }
  }, [host]);

  if (host === "commerce-control") return null;
  if (error) return <main><h1>Little Farms Admin</h1><p>{error.message}</p></main>;
  if (!ims) return <CommerceLoader cover="screen" />;

  return <AdminApp ims={ims} />;
}

createRoot(document.getElementById("root")!).render(
  <HashRouter>
    <App />
  </HashRouter>,
);
