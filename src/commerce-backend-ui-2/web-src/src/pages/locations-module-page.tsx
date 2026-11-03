import { useEffect, useState } from "react";
import { LocationContentListPage } from "./location-content-list-page.tsx";
import type { LocationSectionId } from "./location-section-types.ts";
import { LocationStoresPage } from "./locations-page.tsx";
import "./blog.css";
import "./locations.css";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

export function LocationsPage({
  ims,
  initialSection,
}: {
  ims: Ims;
  initialSection?: LocationSectionId;
}) {
  const [activeSection, setActiveSection] = useState<LocationSectionId>(initialSection ?? "stores");

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  return (
    <div className="lf-location-module">
      {activeSection === "stores" ? <LocationStoresPage ims={ims} /> : null}
      {activeSection === "services" ? <LocationContentListPage ims={ims} kind="service" /> : null}
      {activeSection === "galleries" ? <LocationContentListPage ims={ims} kind="gallery" /> : null}
      {activeSection === "team" ? <LocationContentListPage ims={ims} kind="team" /> : null}
    </div>
  );
}

export type { LocationSectionId } from "./location-section-types.ts";
