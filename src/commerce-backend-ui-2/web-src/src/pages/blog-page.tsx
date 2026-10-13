import { useState } from "react";
import { BlogSectionNav } from "../components/blog-section-nav.tsx";
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
};

export function BlogPage({ ims }: BlogPageProps) {
  const [activeSection, setActiveSection] = useState<BlogSectionId>("posts");

  return (
    <div className="lf-blog-module">
      <BlogSectionNav activeSection={activeSection} onSectionChange={setActiveSection} />
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
