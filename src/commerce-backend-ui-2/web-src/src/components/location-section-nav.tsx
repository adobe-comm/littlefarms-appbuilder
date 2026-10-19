import type { LocationSectionId } from "../pages/location-section-types.ts";

const sections: { id: LocationSectionId; label: string }[] = [
  { id: "stores", label: "Stores" },
  { id: "services", label: "Service" },
  { id: "galleries", label: "Gallery" },
  { id: "team", label: "Team Profile" },
];

export function LocationSectionNav({
  activeSection,
  onSectionChange,
}: {
  activeSection: LocationSectionId;
  onSectionChange: (section: LocationSectionId) => void;
}) {
  return (
    <nav className="lf-blog-tab-nav" aria-label="Location sections">
      {sections.map(section => (
        <button
          key={section.id}
          type="button"
          className={section.id === activeSection ? "lf-blog-tab active" : "lf-blog-tab"}
          aria-current={section.id === activeSection ? "page" : undefined}
          onClick={() => onSectionChange(section.id)}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}
