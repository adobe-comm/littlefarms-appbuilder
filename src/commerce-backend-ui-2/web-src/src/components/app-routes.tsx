import { Navigate, Route, Routes, useParams } from "react-router-dom";
import type { Ims } from "../app-types.ts";
import {
  isBlogSection,
  isLocationSection,
  moduleRouteToPath,
  readRouteFromSession,
} from "../lib/module-route.ts";
import { BrandsPage } from "../pages/brands-page.tsx";
import { BlogPage } from "../pages/blog-page.tsx";
import { LocationsPage } from "../pages/locations-module-page.tsx";
import { MainPage } from "../pages/main-page.tsx";
import { SettingsPage } from "../pages/settings-page.tsx";
import { DeliverySlotsPage } from "../pages/delivery-slots-page.tsx";
import { defaultAppModuleId } from "../modules/registry.ts";

function DefaultModuleEntry() {
  const session = readRouteFromSession();
  const target = session ?? { moduleId: defaultAppModuleId };
  return <Navigate to={moduleRouteToPath(target)} replace />;
}

type ModuleRoutesProps = {
  ims: Ims;
};

function LocationsRoute({ ims }: { ims: Ims }) {
  const { section } = useParams<{ section?: string }>();
  const initialSection = isLocationSection(section) ? section : undefined;
  return (
    <LocationsPage
      ims={ims}
      initialSection={initialSection}
      key={`locations-${initialSection ?? "stores"}`}
    />
  );
}

function BlogRoute({ ims }: { ims: Ims }) {
  const { section } = useParams<{ section?: string }>();
  const initialSection = isBlogSection(section) ? section : undefined;
  return (
    <BlogPage
      ims={ims}
      initialSection={initialSection}
      key={`blog-${initialSection ?? "posts"}`}
    />
  );
}

export function ModuleRoutes({ ims }: ModuleRoutesProps) {
  return (
    <Routes>
      <Route path="/blocks-management" element={<MainPage ims={ims} />} />
      <Route path="/brands-management" element={<BrandsPage ims={ims} />} />
      <Route path="/locations/:section?" element={<LocationsRoute ims={ims} />} />
      <Route path="/blog/:section?" element={<BlogRoute ims={ims} />} />
      <Route path="/settings" element={<SettingsPage ims={ims} />} />
      <Route path="/delivery-slot-management" element={<DeliverySlotsPage ims={ims} />} />
      <Route path="/" element={<DefaultModuleEntry />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function LauncherModuleRoutes({ ims }: ModuleRoutesProps) {
  return (
    <Routes>
      <Route path="/blocks-management" element={<MainPage ims={ims} />} />
      <Route path="/brands-management" element={<BrandsPage ims={ims} />} />
      <Route path="/locations/:section?" element={<LocationsRoute ims={ims} />} />
      <Route path="/blog/:section?" element={<BlogRoute ims={ims} />} />
      <Route path="/settings" element={<SettingsPage ims={ims} />} />
      <Route path="/delivery-slot-management" element={<DeliverySlotsPage ims={ims} />} />
      <Route path="/" element={<></>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
