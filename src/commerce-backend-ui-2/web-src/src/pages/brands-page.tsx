import { useCallback, useEffect, useState } from "react";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { SectionLayout } from "../components/section-layout.tsx";
import { fileToBase64, invokeBrandAction } from "./brands-api.ts";
import { BrandForm, brandSections } from "./brands-form.tsx";
import {
  ALL_STORE_VIEWS,
  plainText,
  type BrandListResponse,
  type BrandRecord,
  type DropdownAttribute,
} from "./brands-types.ts";

type Ims = {
  imsToken: string;
  imsOrgId: string;
};

type SettingsResponse = {
  brandAttributeCode: string;
  updatedAt: string | null;
  attributes: DropdownAttribute[];
};

type BrandGetResponse = {
  brand: BrandRecord;
};

const PAGE_SIZE = 50;

export function BrandsPage({ ims }: { ims: Ims }) {
  const [attributes, setAttributes] = useState<DropdownAttribute[]>([]);
  const [savedCode, setSavedCode] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<BrandRecord[]>([]);
  const [brand, setBrand] = useState<BrandRecord | null>(null);
  const [section, setSection] = useState("general");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadList = useCallback(async (nextPage: number, attributeCode: string, query = "") => {
    setLoading(true);
    setMessage("");
    try {
      const result = await invokeBrandAction<BrandListResponse>(ims, "brand-list", {
        attributeCode,
        page: nextPage,
        pageSize: PAGE_SIZE,
        storeViewCode: ALL_STORE_VIEWS,
        search: query,
      });
      setItems(result.items || []);
      setTotal(result.total || 0);
      setPage(result.page || nextPage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load brands.");
    } finally {
      setLoading(false);
    }
  }, [ims]);

  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      setLoading(true);
      try {
        const settings = await invokeBrandAction<SettingsResponse>(ims, "brand-settings", { operation: "get" });
        if (cancelled) return;
        setAttributes(settings.attributes || []);
        setSavedCode(settings.brandAttributeCode || "");
        setSelectedCode(settings.brandAttributeCode || "");
        if (settings.brandAttributeCode) await loadList(1, settings.brandAttributeCode);
        else setLoading(false);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Unable to load brand settings.");
          setLoading(false);
        }
      }
    }
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [ims, loadList]);

  async function saveAttribute() {
    if (!selectedCode) {
      setMessage("Choose a dropdown attribute.");
      return;
    }
    const changing = selectedCode !== savedCode && savedCode !== "";
    if (changing) {
      const confirmed = window.confirm("Change the brand attribute? Brands for the previous attribute stay saved and are hidden until you select that attribute again.");
      if (!confirmed) {
        setSelectedCode(savedCode);
        return;
      }
    }
    setSaving(true);
    setMessage("");
    try {
      await invokeBrandAction(ims, "brand-settings", {
        operation: "save",
        brandAttributeCode: selectedCode,
        confirmAttributeChange: changing || savedCode === "",
      });
      setSavedCode(selectedCode);
      setBrand(null);
      setSearch("");
      setSearchDraft("");
      await loadList(1, selectedCode, "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the brand attribute.");
    } finally {
      setSaving(false);
    }
  }

  async function openBrand(optionValue: string) {
    setMessage("");
    setLoading(true);
    try {
      const result = await invokeBrandAction<BrandGetResponse>(ims, "brand-list", {
        attributeCode: savedCode,
        optionValue,
        storeViewCode: ALL_STORE_VIEWS,
      });
      if (!result.brand) {
        setMessage("Unable to open the brand.");
        return;
      }
      setBrand(result.brand);
      setSection("general");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open the brand.");
    } finally {
      setLoading(false);
    }
  }

  async function saveBrand() {
    if (!brand) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await invokeBrandAction<BrandGetResponse>(ims, "brand-write", {
        attributeCode: brand.attributeCode,
        optionValue: brand.optionValue,
        storeViewCode: ALL_STORE_VIEWS,
        fields: {
          is_active: brand.is_active,
          is_new_brand: brand.is_new_brand,
          is_top_brand: brand.is_top_brand,
          is_featured: brand.is_featured,
          show_in_brand_list_widget: brand.show_in_brand_list_widget,
          show_in_brand_slider_widget: brand.show_in_brand_slider_widget,
          slider_position: brand.slider_position,
          url_alias: brand.url_alias,
          meta_title: brand.meta_title,
          meta_title_use_default: brand.meta_title_use_default !== false,
          meta_description: brand.meta_description,
          meta_keywords: brand.meta_keywords,
          page_title: brand.page_title,
          page_title_use_default: brand.page_title_use_default !== false,
          description: brand.description,
          short_description: brand.short_description,
          image: brand.image,
          image_alt: brand.image_alt,
          small_image: brand.small_image,
          small_image_alt: brand.small_image_alt,
        },
        useDefault: [
          brand.meta_title_use_default !== false ? "meta_title" : "",
          brand.page_title_use_default !== false ? "page_title" : "",
        ].filter(Boolean),
      });
      setBrand(result.brand);
      setMessage("Brand saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the brand.");
    } finally {
      setSaving(false);
    }
  }

  async function upload(kind: "image" | "small", file: File) {
    if (!brand) return;
    setUploading(true);
    setMessage("");
    try {
      const content = await fileToBase64(file);
      const uploaded = await invokeBrandAction<{ url: string }>(ims, "brand-asset", {
        attributeCode: brand.attributeCode,
        optionValue: brand.optionValue,
        kind,
        contentType: file.type,
        content,
      });
      setBrand(current => current && {
        ...current,
        [kind === "image" ? "image" : "small_image"]: uploaded.url,
      });
      setMessage("Image uploaded. Save the brand to keep it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload the image.");
    } finally {
      setUploading(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const busy = loading || saving || uploading;
  function clearSearch() {
    setSearch("");
    setSearchDraft("");
    void loadList(1, savedCode, "");
  }

  function goToPage(raw: string) {
    const next = Number(raw);
    if (!Number.isInteger(next) || next < 1 || next > pageCount || next === page) return;
    void loadList(next, savedCode, search);
  }


  if (brand) {
    return (
      <SectionLayout
        heading={brand.optionLabel || "Brand"}
        navTitle="Brand information"
        sections={brandSections()}
        activeSectionId={section}
        onSectionChange={setSection}
        headerActions={(
          <div className="actions">
            <button type="button" onClick={() => { setBrand(null); void loadList(page, savedCode, search); }}>Back</button>
            <button type="button" className="primary" disabled={saving} onClick={() => void saveBrand()}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      >
        {busy ? <CommerceLoader /> : null}
        {message ? <p className="message">{message}</p> : null}
        <BrandForm brand={brand} section={section} onChange={setBrand} onUpload={(kind, file) => void upload(kind, file)} uploading={uploading} />
      </SectionLayout>
    );
  }

  return (
    <main className="conditional-blocks admin-list">
      {busy ? <CommerceLoader /> : null}
      <header className="admin-list-header">
        <h1>Brands</h1>
        <button type="button" className="admin-primary" disabled={saving || !selectedCode} onClick={() => void saveAttribute()}>
          {saving ? "Saving…" : "Save attribute"}
        </button>
      </header>
      <div className="admin-list-body">
        <div className="admin-attribute-bar">
          <label>
            Dropdown attribute
            <select value={selectedCode} onChange={event => setSelectedCode(event.target.value)}>
              <option value="">Select an attribute</option>
              {attributes.map(attribute => (
                <option key={attribute.code} value={attribute.code}>
                  {attribute.label} ({attribute.code})
                </option>
              ))}
            </select>
          </label>
          <p className="field-hint">Choose which product dropdown is the brand. There is no preset attribute.</p>
        </div>
        {message ? <p className="message">{message}</p> : null}
        {!savedCode ? <p className="admin-empty">Select a dropdown attribute to manage its brands.</p> : null}
        {savedCode ? (
          <section className="admin-grid-card">
            {search ? (
              <div className="admin-active-filters">
                <span>Active filters:</span>
                <span className="admin-filter-chip">Keyword: {search}</span>
                <button type="button" className="admin-clear" onClick={clearSearch}>Clear all</button>
              </div>
            ) : null}
            <form className="admin-keyword" onSubmit={event => {
              event.preventDefault();
              const next = searchDraft.trim();
              setSearch(next);
              void loadList(1, savedCode, next);
            }}>
              <label className="sr-only" htmlFor="brand-keyword">Search by keyword</label>
              <input
                id="brand-keyword"
                placeholder="Search by keyword"
                value={searchDraft}
                onChange={event => setSearchDraft(event.target.value)}
              />
              <button type="submit" className="admin-keyword-submit">Search</button>
            </form>
            <div className="admin-grid-toolbar">
              <span className="admin-record-count">{total} records found</span>
              <div className="admin-pager">
                <label>
                  <select value={PAGE_SIZE} disabled aria-label="Records per page">
                    <option value={PAGE_SIZE}>{PAGE_SIZE}</option>
                  </select>
                  <span>per page</span>
                </label>
                <button type="button" disabled={page <= 1 || loading} onClick={() => void loadList(page - 1, savedCode, search)} aria-label="Previous page">‹</button>
                <input
                  key={page}
                  aria-label="Current page"
                  defaultValue={page}
                  onBlur={event => goToPage(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter") goToPage((event.target as HTMLInputElement).value);
                  }}
                />
                <span>of {pageCount}</span>
                <button type="button" disabled={page >= pageCount || loading} onClick={() => void loadList(page + 1, savedCode, search)} aria-label="Next page">›</button>
              </div>
            </div>
            <div className="admin-grid-wrap">
              <table className="admin-grid">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Brand Attribute</th>
                    <th>Slider image</th>
                    <th>Show in Slider</th>
                    <th>Position in Slider</th>
                    <th>URL alias</th>
                    <th>Description</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={8}>We couldn't find any records.</td></tr>
                  ) : null}
                  {items.map(item => (
                    <tr key={item.optionValue}>
                      <td>{item.optionLabel}</td>
                      <td>{item.attributeCode}</td>
                      <td>{item.image ? <img className="brand-thumb" src={item.image} alt={item.image_alt || ""} /> : "No image"}</td>
                      <td>{item.show_in_brand_slider_widget ? "Yes" : "No"}</td>
                      <td>{item.slider_position ?? 0}</td>
                      <td>{item.url_alias}</td>
                      <td className="brand-description">{plainText(item.description || "")}</td>
                      <td>
                        <button type="button" className="admin-edit" onClick={() => void openBrand(item.optionValue)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
