import { HtmlEditor } from "../components/html-editor.tsx";
import type { BrandRecord } from "./brands-types.ts";

type BrandFormProps = {
  brand: BrandRecord;
  section: string;
  onChange: (brand: BrandRecord) => void;
  onUpload: (kind: "image" | "small", file: File) => void;
  uploading: boolean;
};

const SECTIONS = ["general", "options", "seo", "meta", "content", "other"] as const;

export function brandSections() {
  return [
    { id: "general", label: "General Options" },
    { id: "options", label: "Brand Options" },
    { id: "seo", label: "SEO" },
    { id: "meta", label: "Meta Data" },
    { id: "content", label: "Page Content" },
    { id: "other", label: "Other" },
  ];
}

export function isBrandSection(id: string): id is (typeof SECTIONS)[number] {
  return SECTIONS.some(section => section === id);
}

function YesNo({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label htmlFor={id}>
      {label}
      <select id={id} value={value ? "yes" : "no"} onChange={event => onChange(event.target.value === "yes")}>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function BrandForm({ brand, section, onChange, onUpload, uploading }: BrandFormProps) {
  function patch(partial: Partial<BrandRecord>) {
    onChange({ ...brand, ...partial });
  }

  return (
    <>
      {section === "general" && (
      <section className="widget-options">
        <h3 className="widget-options-heading">General Options</h3>
        <YesNo id="brand-active" label="Is Active" hint="Select Yes for an active brand." value={brand.is_active !== false} onChange={is_active => patch({ is_active })} />
        <YesNo id="brand-new" label="Is New Brand" hint="Select Yes to mark this as a new brand." value={brand.is_new_brand === true} onChange={is_new_brand => patch({ is_new_brand })} />
        <YesNo id="brand-top" label="Is Top Brand" hint="Select Yes to mark this as a top brand." value={brand.is_top_brand === true} onChange={is_top_brand => patch({ is_top_brand })} />
      </section>
      )}
      {section === "options" && (
      <section className="widget-options">
        <h3 className="widget-options-heading">Brand Options</h3>
        <YesNo
          id="brand-featured"
          label="Is Featured"
          hint="Featured brands can stay outside a show-more treatment on the storefront."
          value={brand.is_featured === true}
          onChange={is_featured => patch({ is_featured })}
        />
        <YesNo id="brand-list-widget" label="Show in Brand List Widget" value={brand.show_in_brand_list_widget !== false} onChange={show_in_brand_list_widget => patch({ show_in_brand_list_widget })} />
        <YesNo id="brand-slider-widget" label="Show in Brand Slider Widget" value={brand.show_in_brand_slider_widget === true} onChange={show_in_brand_slider_widget => patch({ show_in_brand_slider_widget })} />
        <label htmlFor="brand-slider-position">
          Position in Slider
          <input
            id="brand-slider-position"
            type="number"
            value={brand.slider_position ?? 0}
            onChange={event => patch({ slider_position: Number(event.target.value) })}
          />
        </label>
      </section>
      )}
      {section === "seo" && (
      <section className="widget-options">
        <h3 className="widget-options-heading">SEO</h3>
        <label htmlFor="brand-url-alias">
          URL alias
          <input id="brand-url-alias" value={brand.url_alias || ""} onChange={event => patch({ url_alias: event.target.value })} />
        </label>
      </section>
      )}
      {section === "meta" && (
      <section className="widget-options">
        <h3 className="widget-options-heading">Meta Data</h3>
        <label htmlFor="brand-meta-title">
          Meta Title
          <input
            id="brand-meta-title"
            value={brand.meta_title || ""}
            disabled={brand.meta_title_use_default !== false}
            onChange={event => patch({ meta_title: event.target.value, meta_title_use_default: false })}
          />
        </label>
        <label className="brand-check">
          <input
            type="checkbox"
            checked={brand.meta_title_use_default !== false}
            onChange={event => patch({
              meta_title_use_default: event.target.checked,
              meta_title: event.target.checked ? brand.optionLabel : brand.meta_title,
            })}
          />
          Use Default Value
        </label>
        <label htmlFor="brand-meta-description">
          Meta Description
          <textarea id="brand-meta-description" rows={4} value={brand.meta_description || ""} onChange={event => patch({ meta_description: event.target.value })} />
        </label>
        <label htmlFor="brand-meta-keywords">
          Meta Keywords
          <textarea id="brand-meta-keywords" rows={3} value={brand.meta_keywords || ""} onChange={event => patch({ meta_keywords: event.target.value })} />
        </label>
      </section>
      )}
      {section === "content" && (
      <section className="widget-options">
        <h3 className="widget-options-heading">Page Content</h3>
        <label htmlFor="brand-page-title">
          Page Title
          <input
            id="brand-page-title"
            value={brand.page_title || ""}
            disabled={brand.page_title_use_default !== false}
            onChange={event => patch({ page_title: event.target.value, page_title_use_default: false })}
          />
        </label>
        <label className="brand-check">
          <input
            type="checkbox"
            checked={brand.page_title_use_default !== false}
            onChange={event => patch({
              page_title_use_default: event.target.checked,
              page_title: event.target.checked ? brand.optionLabel : brand.page_title,
            })}
          />
          Use Default Value
        </label>
        <HtmlEditor
          key={`${brand.attributeCode}:${brand.optionValue}:${brand.storeViewCode}`}
          id="brand-description"
          value={brand.description || ""}
          onChange={description => patch({ description })}
        />
        <label htmlFor="brand-image">
          Image
          <input id="brand-image" type="file" accept="image/jpeg,image/png,image/gif,image/webp" disabled={uploading} onChange={event => {
            const file = event.target.files?.[0];
            if (file) onUpload("image", file);
          }} />
          {brand.image ? <img className="brand-preview" src={brand.image} alt={brand.image_alt || brand.optionLabel} /> : <span className="field-hint">No file chosen</span>}
        </label>
        <label htmlFor="brand-short-description">
          Short Description
          <textarea id="brand-short-description" rows={3} value={brand.short_description || ""} onChange={event => patch({ short_description: event.target.value })} />
        </label>
        <label htmlFor="brand-image-alt">
          Image Alt
          <input id="brand-image-alt" value={brand.image_alt || ""} onChange={event => patch({ image_alt: event.target.value })} />
          <span className="field-hint">Used for the brand image on the brand page.</span>
        </label>
      </section>
      )}
      {section === "other" && (
      <section className="widget-options">
        <h3 className="widget-options-heading">Other</h3>
        <label htmlFor="brand-small-image">
          Small Image
          <input id="brand-small-image" type="file" accept="image/jpeg,image/png,image/gif,image/webp" disabled={uploading} onChange={event => {
            const file = event.target.files?.[0];
            if (file) onUpload("small", file);
          }} />
          {brand.small_image ? <img className="brand-preview" src={brand.small_image} alt={brand.small_image_alt || brand.optionLabel} /> : <span className="field-hint">No file chosen</span>}
          <span className="field-hint">Used in the brand slider, on the product page, and as a swatch.</span>
        </label>
        <label htmlFor="brand-small-image-alt">
          Small Image Alt
          <input id="brand-small-image-alt" value={brand.small_image_alt || ""} onChange={event => patch({ small_image_alt: event.target.value })} />
          <span className="field-hint">Used for the slider, product page, and swatch.</span>
        </label>
      </section>
      )}
    </>
  );
}
