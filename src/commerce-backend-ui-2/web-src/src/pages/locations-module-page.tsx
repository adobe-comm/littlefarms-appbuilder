import { useState } from "react";
import { LocationSectionNav } from "../components/location-section-nav.tsx";
import { LocationContentListPage } from "./location-content-list-page.tsx";
import type { LocationSectionId } from "./location-section-types.ts";
import { LocationStoresPage } from "./locations-page.tsx";
import "./blog.css";
import "./locations.css";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

export function LocationsPage({ ims }: { ims: Ims }) {
  const [activeSection, setActiveSection] = useState<LocationSectionId>("stores");

  return (
    <div className="lf-location-module">
      <LocationSectionNav activeSection={activeSection} onSectionChange={setActiveSection} />
      {activeSection === "stores" ? <LocationStoresPage ims={ims} /> : null}
      {activeSection === "services" ? <LocationContentListPage ims={ims} kind="service" /> : null}
      {activeSection === "galleries" ? <LocationContentListPage ims={ims} kind="gallery" /> : null}
      {activeSection === "team" ? <LocationContentListPage ims={ims} kind="team" /> : null}
    </div>
  );
}
