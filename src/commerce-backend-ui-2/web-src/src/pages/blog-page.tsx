import { useEffect, useState } from "react";
import { BlogCategoriesPage } from "./blog-categories-page.tsx";
import { BlogPostsPage } from "./blog-posts-page.tsx";
import { BlogTagsPage } from "./blog-tags-page.tsx";
import type { BlogSectionId } from "./blog-section-types.ts";
import "./blog.css";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

type BlogPageProps = {
  ims: Ims;
  initialSection?: BlogSectionId;
};

export function BlogPage({ ims, initialSection }: BlogPageProps) {
  const [activeSection, setActiveSection] = useState<BlogSectionId>(initialSection ?? "posts");

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  return (
    <div className="lf-blog-module">
      {activeSection === "posts" ? (
        <BlogPostsPage ims={ims} onNavigateSection={setActiveSection} />
      ) : null}
      {activeSection === "tags" ? (
        <BlogTagsPage ims={ims} onNavigateSection={setActiveSection} />
      ) : null}
      {activeSection === "categories" ? <BlogCategoriesPage ims={ims} /> : null}
    </div>
  );
}

export type { BlogSectionId } from "./blog-section-types.ts";
