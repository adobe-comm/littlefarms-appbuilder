import { useCallback, useEffect, useState } from "react";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { SectionLayout } from "../components/section-layout.tsx";
import { fileToBase64, invokeBrandAction } from "./brands-api.ts";
import { BrandForm, brandSections } from "./brands-form.tsx";
import {
  ALL_STORE_VIEWS,
  DEFAULT_STORE_VIEW,
  plainText,
  scopeLabel,
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
  const [storeViewCode, setStoreViewCode] = useState(DEFAULT_STORE_VIEW);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<BrandRecord[]>([]);
  const [brand, setBrand] = useState<BrandRecord | null>(null);
  const [editScope, setEditScope] = useState(ALL_STORE_VIEWS);
  const [section, setSection] = useState("general");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadList = useCallback(async (nextPage: number, view: string, attributeCode: string) => {
    setLoading(true);
    setMessage("");
    try {
      const result = await invokeBrandAction<BrandListResponse>(ims, "brand-list", {
        attributeCode,
        page: nextPage,
        pageSize: PAGE_SIZE,
        storeViewCode: view,
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
        if (settings.brandAttributeCode) await loadList(1, DEFAULT_STORE_VIEW, settings.brandAttributeCode);
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
      await loadList(1, storeViewCode, selectedCode);
      setMessage("Brand attribute saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the brand attribute.");
    } finally {
      setSaving(false);
    }
  }

  async function openBrand(optionValue: string, scope: string) {
    setMessage("");
    setLoading(true);
    try {
      const result = await invokeBrandAction<BrandGetResponse>(ims, "brand-list", {
        attributeCode: savedCode,
        optionValue,
        storeViewCode: scope,
      });
      if (!result.brand) {
        setMessage("Unable to open the brand.");
        return;
      }
      setBrand(result.brand);
      setEditScope(scope);
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
        storeViewCode: editScope,
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
            <label className="brand-inline">
              Scope
              <select
                value={editScope}
                onChange={event => void openBrand(brand.optionValue, event.target.value)}
              >
                <option value={ALL_STORE_VIEWS}>All Store Views</option>
                <option value={DEFAULT_STORE_VIEW}>Default Store View</option>
              </select>
            </label>
            <button type="button" onClick={() => { setBrand(null); void loadList(page, storeViewCode, savedCode); }}>Back</button>
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
    <main className="conditional-blocks">
      {busy ? <CommerceLoader /> : null}
      <header className="page-header">
        <h1>Brand Management</h1>
      </header>
      <section className="widget-options">
        <h2 className="widget-options-heading">Brand attribute</h2>
        <p className="field-hint">Choose which product dropdown is the brand. There is no preset attribute.</p>
        <div className="actions">
          <label className="brand-inline">
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
          <button type="button" className="primary" disabled={saving || !selectedCode} onClick={() => void saveAttribute()}>
            {saving ? "Saving…" : "Save attribute"}
          </button>
        </div>
      </section>
      {message ? <p className="message">{message}</p> : null}
      {!savedCode ? <p>Select a dropdown attribute to manage its brands.</p> : null}
      {savedCode ? (
        <>
          <div className="page-header">
            <p>{total} records found</p>
            <label className="brand-inline">
              Store view
              <select
                value={storeViewCode}
                onChange={event => {
                  const next = event.target.value;
                  setStoreViewCode(next);
                  void loadList(1, next, savedCode);
                }}
              >
                <option value={DEFAULT_STORE_VIEW}>Default Store View</option>
                <option value={ALL_STORE_VIEWS}>All Store Views</option>
              </select>
            </label>
          </div>
          <div className="brand-table-wrap">
            <table className="brand-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Store View</th>
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
                {items.map(item => (
                  <tr key={item.optionValue}>
                    <td>{item.optionLabel}</td>
                    <td>{scopeLabel(storeViewCode)}</td>
                    <td>{item.attributeCode}</td>
                    <td>{item.image ? <img className="brand-thumb" src={item.image} alt={item.image_alt || ""} /> : "No image"}</td>
                    <td>{item.show_in_brand_slider_widget ? "Yes" : "No"}</td>
                    <td>{item.slider_position ?? 0}</td>
                    <td>{item.url_alias}</td>
                    <td className="brand-description">{plainText(item.description || "")}</td>
                    <td>
                      <button type="button" onClick={() => void openBrand(item.optionValue, ALL_STORE_VIEWS)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <button type="button" disabled={page <= 1 || loading} onClick={() => void loadList(page - 1, storeViewCode, savedCode)}>Previous</button>
            <span>Page {page} of {pageCount}</span>
            <button type="button" disabled={page >= pageCount || loading} onClick={() => void loadList(page + 1, storeViewCode, savedCode)}>Next</button>
          </div>
        </>
      ) : null}
    </main>
  );
}
