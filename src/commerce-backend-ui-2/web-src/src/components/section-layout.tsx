import type { ReactNode } from "react";

export type SectionNavItem = {
  id: string;
  label: string;
};

type SectionLayoutProps = {
  heading: string;
  sections: SectionNavItem[];
  activeSectionId: string;
  onSectionChange: (sectionId: string) => void;
  children: ReactNode;
  headerActions?: ReactNode;
};

/** Page Builder–style section menu (left) with form content (right). */
export function SectionLayout({
  heading,
  sections,
  activeSectionId,
  onSectionChange,
  children,
  headerActions,
}: SectionLayoutProps) {
  return (
    <div className="lf-section-layout">
      <header className="lf-section-layout-header">
        <h1>{heading}</h1>
        {headerActions}
      </header>
      <div className="lf-section-layout-body">
        <nav className="lf-section-nav" aria-label={`${heading} sections`}>
          <p className="lf-section-nav-title">Block information</p>
          {sections.map(section => (
            <button
              key={section.id}
              type="button"
              className={section.id === activeSectionId ? "lf-section-link active" : "lf-section-link"}
              aria-current={section.id === activeSectionId ? "true" : undefined}
              onClick={() => onSectionChange(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
        <div className="lf-section-content">{children}</div>
      </div>
    </div>
  );
}
