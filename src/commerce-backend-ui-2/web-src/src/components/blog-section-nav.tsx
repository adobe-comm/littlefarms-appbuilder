import type { BlogSectionId } from "../pages/blog-section-types.ts";

const blogSections: { id: BlogSectionId; label: string }[] = [
  { id: "posts", label: "Posts" },
  { id: "categories", label: "Categories" },
  { id: "tags", label: "Tags" },
];

export function BlogSectionNav({
  activeSection,
  onSectionChange,
}: {
  activeSection: BlogSectionId;
  onSectionChange: (section: BlogSectionId) => void;
}) {
  return (
    <nav className="lf-blog-tab-nav" aria-label="Blog sections">
      {blogSections.map(section => (
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
