import {
  emptyBrandItem,
  MAX_BRAND_ITEMS,
  type BrandListItem,
  type BrandsListLogic,
} from "../brands-list-types.ts";

type BrandsListFormProps = {
  logic: BrandsListLogic;
  onChange: (next: BrandsListLogic) => void;
};

function updateItem(items: BrandListItem[], index: number, patch: Partial<BrandListItem>): BrandListItem[] {
  return items.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

export function BrandsListForm({ logic, onChange }: BrandsListFormProps) {
  function setUrl(url: string) {
    onChange({ ...logic, url });
  }

  function setItem(index: number, patch: Partial<BrandListItem>) {
    onChange({ ...logic, items: updateItem(logic.items, index, patch) });
  }

  function addItem() {
    if (logic.items.length >= MAX_BRAND_ITEMS) return;
    onChange({ ...logic, items: [...logic.items, emptyBrandItem()] });
  }

  function removeItem(index: number) {
    if (logic.items.length <= 1) {
      onChange({ ...logic, items: [emptyBrandItem()] });
      return;
    }
    onChange({ ...logic, items: logic.items.filter((_, i) => i !== index) });
  }

  return (
    <section className="widget-options" aria-labelledby="brands-widget-options-heading">
      <h3 id="brands-widget-options-heading" className="widget-options-heading">
        Widget Options
      </h3>

      <div className="field-row">
        <label htmlFor="brands-list-url">URL</label>
        <input
          id="brands-list-url"
          type="url"
          placeholder="https://"
          value={logic.url}
          onChange={event => setUrl(event.target.value)}
        />
      </div>

      {logic.items.map((item, index) => (
        <div key={index} className="brand-list-item">
          <div className="brand-list-item-header">
            <span className="brand-list-item-title">Brand {index + 1}</span>
            {logic.items.length > 1 && (
              <button type="button" className="link-button" onClick={() => removeItem(index)}>
                Remove
              </button>
            )}
          </div>

          <div className="field-row">
            <label htmlFor={`brand-image-${index}`}>Image</label>
            <input
              id={`brand-image-${index}`}
              value={item.image}
              placeholder="/media/… or https://"
              onChange={event => setItem(index, { image: event.target.value })}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => document.getElementById(`brand-image-${index}`)?.focus()}
            >
              Choose Image…
            </button>
            <p className="field-hint">Enter a media path or URL from your catalog (Commerce media gallery integration can be added later).</p>
          </div>

          <div className="field-row">
            <label htmlFor={`brand-name-${index}`}>
              Name<span className="required">*</span>
            </label>
            <input
              id={`brand-name-${index}`}
              value={item.name}
              onChange={event => setItem(index, { name: event.target.value })}
            />
          </div>

          <div className="field-row">
            <label htmlFor={`brand-link-${index}`}>
              Link<span className="required">*</span>
            </label>
            <input
              id={`brand-link-${index}`}
              type="url"
              placeholder="https://"
              value={item.link}
              onChange={event => setItem(index, { link: event.target.value })}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn-add-item"
        onClick={addItem}
        disabled={logic.items.length >= MAX_BRAND_ITEMS}
      >
        Add New Item
      </button>
    </section>
  );
}
