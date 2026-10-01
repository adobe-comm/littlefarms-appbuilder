import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { attach, register } from "@adobe/uix-guest";
import Runtime, { init } from "@adobe/exc-app";

import config from "../../../commerce-extensibility-1/.generated/app.commerce.config.js";
import { AppShell, defaultAppModuleId } from "./components/app-shell.tsx";
import { MainPage } from "./pages/main-page.tsx";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

type Host = "commerce-ui" | "commerce-control" | "shell" | "standalone";

const SHELL_RUNTIME_HOST = /^(exc-unifiedcontent\.)?experience(-qa|-stage|-cdn|-cdn-stage)?\.adobe\.(com|net)$/u;
const TIMEOUT_MS = 20000;
const LOCAL_IMS_TOKEN_KEY = "littlefarmsBlocks.localImsToken";
const LOCAL_IMS_ORG_ID_KEY = "littlefarmsBlocks.localImsOrgId";

function localImsCredentials(): Ims | null {
  const imsToken = window.sessionStorage.getItem(LOCAL_IMS_TOKEN_KEY);
  const imsOrgId = window.sessionStorage.getItem(LOCAL_IMS_ORG_ID_KEY);
  return imsToken && imsOrgId ? { imsToken, imsOrgId } : null;
}

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

function App() {
  const [host] = useState(detectHost);
  const [ims, setIms] = useState<Ims | null>(() =>
    detectHost() === "standalone" ? localImsCredentials() : null
  );
  const [error, setError] = useState<Error | null>(null);
  const [activeModuleId, setActiveModuleId] = useState(defaultAppModuleId);

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
  if (host === "standalone" && !ims) {
    return (
      <main>
        <h1>Little Farms Admin</h1>
        <p>Local development credentials are not configured for this browser tab.</p>
        <p>Set the IMS token and organization ID in session storage, then reload.</p>
      </main>
    );
  }
  if (error) return <main><h1>Little Farms Admin</h1><p>{error.message}</p></main>;
  if (!ims) return <main><p>Connecting…</p></main>;
  return (
    <AppShell activeModuleId={activeModuleId} onModuleChange={setActiveModuleId}>
      {activeModuleId === "blocks-management" && <MainPage ims={ims} />}
      {activeModuleId !== "blocks-management" && (
        <main className="conditional-blocks">
          <p>This module is not available yet.</p>
        </main>
      )}
    </AppShell>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
