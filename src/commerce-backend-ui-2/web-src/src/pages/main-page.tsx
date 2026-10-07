import { useEffect, useState } from "react";
import actions from "../config.json";
import {
  blockTypes,
  BLOCK_TYPE_FEATURED_RECOMMENDED,
  BLOCK_TYPE_BRANDS_LIST,
  getBlockType,
} from "../block-types/index.ts";
import {
  emptyBrandsListLogic,
  parseBrandsListLogic,
  type BrandsListLogic,
} from "../block-types/brands-list-types.ts";
import { BrandsListForm } from "../block-types/forms/brands-list-form.tsx";
import { CommerceLoader } from "../components/commerce-loader.tsx";
import { SectionLayout } from "../components/section-layout.tsx";

type Condition = {
  attribute: string;
  operator: string;
  value: string | number | string[];
};

type ConditionGroup = {
  aggregator: "all" | "any";
  matchValue?: boolean;
  conditions: ConditionNode[];
};

type ConditionNode = Condition | ConditionGroup;

type Rule = ConditionGroup & {
  productsToDisplay: number;
};

type AttributeOption = { value: string; label: string };
type AttributeField = {
  code: string;
  label: string;
  input: string;
  group: "common" | "custom";
  options: AttributeOption[];
};
type CategoryChoice = { id: string; label: string };
type ProductChoice = { sku: string; name: string };
type ProductRow = ProductChoice & { id: string; typeId: string; attributeSetId: string };
type CatalogPage = { items: ProductRow[]; total: number; page: number; pageSize: number };
type CatalogQuery = { page: number; entityId: string; typeId: string; attributeSetId: string; sku: string; name: string };
type SavedCondition = {
  id: string;
  name: string;
  blockType?: string;
  enabled?: boolean;
  blockId?: number;
  sequence?: number;
  logic: Rule | BrandsListLogic | Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

type AdminView =
  | { screen: "list" }
  | { screen: "type-select" }
  | { screen: "edit"; blockTypeId: string; presetId?: string };

type BlockEditSection = "frontend-properties" | "block-options";

const PAGE_SIZE = 20;
const blockEditSections = [
  { id: "frontend-properties", label: "Frontend Properties" },
  { id: "block-options", label: "Block Options" },
] as const;

const MAX_GROUP_DEPTH = 3;
const DEFAULT_PRODUCTS_TO_DISPLAY = 10;
const COMBINATION = "__combination__";
const emptyCatalogQuery = (): CatalogQuery => ({ page: 1, entityId: "", typeId: "", attributeSetId: "", sku: "", name: "" });

const comparisonOperators = [
  ["eq", "is"],
  ["neq", "is not"],
  ["gt", "is greater than"],
  ["gte", "is greater than or equal to"],
  ["lt", "is less than"],
  ["lte", "is less than or equal to"],
];
const choiceOperators = [
  ["eq", "is"],
  ["neq", "is not"],
  ["in", "is one of"],
  ["nin", "is not one of"],
];

const fallbackAttributes: AttributeField[] = [
  { code: "sku", label: "SKU", input: "sku", group: "common", options: [] },
  { code: "category_ids", label: "Category", input: "category", group: "common", options: [] },
  { code: "custom_design_from", label: "Active From", input: "date", group: "common", options: [] },
  { code: "custom_design_to", label: "Active To", input: "date", group: "common", options: [] },
  { code: "from_price", label: "From Price", input: "price", group: "common", options: [] },
  { code: "price", label: "Price", input: "price", group: "common", options: [] },
  { code: "attribute_set_id", label: "Attribute Set", input: "text", group: "common", options: [] },
  { code: "lf_brand", label: "Brand", input: "text", group: "custom", options: [] },
];

const emptyRule = (): Rule => ({
  aggregator: "all",
  matchValue: true,
  productsToDisplay: DEFAULT_PRODUCTS_TO_DISPLAY,
  conditions: [],
});

const emptyGroup = (): ConditionGroup => ({
  aggregator: "all",
  matchValue: true,
  conditions: [],
});

function isGroup(node: ConditionNode): node is ConditionGroup {
  return Array.isArray((node as ConditionGroup).conditions) && !(node as Condition).attribute;
}

function displayCount(value: unknown): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return DEFAULT_PRODUCTS_TO_DISPLAY;
  return Math.min(number, 50);
}

function formatCreatedAt(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function presetLookupId(preset: SavedCondition): string {
  if (preset.blockId) return String(preset.blockId);
  if (/^\d+$/.test(preset.id)) return preset.id;
  return preset.id;
}

function displayBlockId(preset: SavedCondition): string {
  const lookup = presetLookupId(preset);
  if (preset.blockId || /^\d+$/.test(preset.id)) return lookup;
  if (preset.sequence) return String(preset.sequence);
  return lookup.slice(0, 8);
}

function actionUrl(name: string): string {
  const actionMap = actions as Record<string, string>;
  return actionMap[`littlefarms-appbuilder/${name}`] || actionMap[name] || "";
}

function operatorsFor(input: string): string[][] {
  return input === "date" || input === "price" ? comparisonOperators : choiceOperators;
}

function valuesOf(value: Condition["value"]): string[] {
  if (Array.isArray(value)) return value.map(String);
  return String(value ?? "").split(",").map(item => item.trim()).filter(Boolean);
}

function AttributeChoices({
  attributes,
  value,
  allowCombination,
  onChange,
}: {
  attributes: AttributeField[];
  value: string;
  allowCombination: boolean;
  onChange: (code: string) => void;
}) {
  const groups = [
    ["common", "Common attributes"],
    ["custom", "Custom attributes"],
  ] as const;
  return (
    <select value={value} onChange={event => onChange(event.target.value)}>
      <option value="">Select an attribute</option>
      {allowCombination && <option value={COMBINATION}>Conditions Combination</option>}
      {groups.map(([group, label]) => (
        <optgroup key={group} label={label}>
          {attributes.filter(attribute => attribute.group === group).map(attribute => (
            <option key={attribute.code} value={attribute.code}>{attribute.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function ProductChooser({
  selected,
  onChange,
  browseCatalog,
}: {
  selected: string[];
  onChange: (skus: string[]) => void;
  browseCatalog: (query: CatalogQuery) => Promise<CatalogPage>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<CatalogQuery>(emptyCatalogQuery());
  const [draft, setDraft] = useState<CatalogQuery>(emptyCatalogQuery());
  const [page, setPage] = useState<CatalogPage>({ items: [], total: 0, page: 1, pageSize: 50 });
  const [picked, setPicked] = useState<string[]>(selected);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(next: CatalogQuery) {
    setLoading(true);
    setError("");
    try {
      const result = await browseCatalog(next);
      setPage(result);
      setQuery(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }

  function openChooser() {
    const next = emptyCatalogQuery();
    setDraft(next);
    setPicked(selected);
    setOpen(true);
    void load(next);
  }

  function toggle(sku: string) {
    setPicked(current => current.includes(sku) ? current.filter(item => item !== sku) : [...current, sku]);
  }

  if (!open) {
    return <button type="button" className="chooser-open" aria-label="Choose products" onClick={openChooser}>▦</button>;
  }

  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize) || 1);
  return (
    <div className="chooser-backdrop" role="dialog" aria-label="Choose products">
      <div className="chooser">
        {loading ? <CommerceLoader cover="local" /> : null}
        <header>
          <strong>{page.total} records found</strong>
          <div className="chooser-actions">
            <button type="button" onClick={() => { const next = emptyCatalogQuery(); setDraft(next); void load(next); }}>Reset Filter</button>
            <button type="button" className="primary" onClick={() => { onChange(picked); setOpen(false); }}>Use selected</button>
            <button type="button" onClick={() => setOpen(false)}>Close</button>
          </div>
        </header>
        <p>{`${page.pageSize} per page · page ${page.page} of ${lastPage}`}</p>
        {error && <p className="message" role="status">{error}</p>}
        <table>
          <thead>
            <tr>
              <th></th>
              <th>ID</th>
              <th>Type</th>
              <th>Attribute Set</th>
              <th>SKU</th>
              <th>Product</th>
            </tr>
            <tr>
              <th></th>
              <th><input value={draft.entityId} onChange={event => setDraft({ ...draft, entityId: event.target.value })} onKeyDown={event => event.key === "Enter" && void load({ ...draft, page: 1 })} /></th>
              <th>
                <select value={draft.typeId} onChange={event => { const next = { ...draft, typeId: event.target.value, page: 1 }; setDraft(next); void load(next); }}>
                  <option value="">Any</option>
                  <option value="simple">Simple Product</option>
                  <option value="configurable">Configurable Product</option>
                  <option value="virtual">Virtual Product</option>
                  <option value="bundle">Bundle Product</option>
                  <option value="grouped">Grouped Product</option>
                </select>
              </th>
              <th><input value={draft.attributeSetId} onChange={event => setDraft({ ...draft, attributeSetId: event.target.value })} onKeyDown={event => event.key === "Enter" && void load({ ...draft, page: 1 })} /></th>
              <th><input value={draft.sku} onChange={event => setDraft({ ...draft, sku: event.target.value })} onKeyDown={event => event.key === "Enter" && void load({ ...draft, page: 1 })} /></th>
              <th><input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} onKeyDown={event => event.key === "Enter" && void load({ ...draft, page: 1 })} /></th>
            </tr>
          </thead>
          <tbody>
            {page.items.map(product => (
              <tr key={product.sku}>
                <td><input type="checkbox" checked={picked.includes(product.sku)} onChange={() => toggle(product.sku)} /></td>
                <td>{product.id}</td>
                <td>{product.typeId}</td>
                <td>{product.attributeSetId}</td>
                <td>{product.sku}</td>
                <td>{product.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer>
          <button type="button" disabled={query.page <= 1 || loading} onClick={() => void load({ ...query, page: query.page - 1 })}>Previous</button>
          <button type="button" disabled={query.page >= lastPage || loading} onClick={() => void load({ ...query, page: query.page + 1 })}>Next</button>
        </footer>
      </div>
    </div>
  );
}

function ValueControl({
  attribute,
  condition,
  categories,
  onChange,
  browseCatalog,
}: {
  attribute: AttributeField;
  condition: Condition;
  categories: CategoryChoice[];
  onChange: (value: Condition["value"]) => void;
  browseCatalog: (query: CatalogQuery) => Promise<CatalogPage>;
}) {
  const multiple = condition.operator === "in" || condition.operator === "nin" || attribute.input === "multiselect";
  const [search, setSearch] = useState("");

  if (attribute.input === "date") {
    return <input type="date" value={String(condition.value || "").slice(0, 10)} onChange={event => onChange(event.target.value)} />;
  }
  if (attribute.input === "price") {
    return <input type="number" value={String(condition.value ?? "")} onChange={event => onChange(event.target.value)} />;
  }
  if (attribute.input === "boolean") {
    const options = attribute.options.length ? attribute.options : [{ value: "1", label: "Yes" }, { value: "0", label: "No" }];
    return (
      <select value={String(condition.value ?? "")} onChange={event => onChange(event.target.value)}>
        <option value="">Select</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  if (attribute.input === "select" || attribute.input === "multiselect") {
    return (
      <select multiple={multiple} value={multiple ? valuesOf(condition.value) : String(condition.value ?? "")} onChange={event => onChange(multiple ? Array.from(event.target.selectedOptions, option => option.value) : event.target.value)}>
        {!multiple && <option value="">Select</option>}
        {attribute.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  if (attribute.input === "category") {
    const selected = valuesOf(condition.value);
    const available = categories.filter(category => {
      if (selected.includes(category.id)) return false;
      if (!search.trim()) return true;
      return `${category.label} ${category.id}`.toLowerCase().includes(search.trim().toLowerCase());
    });
    return (
      <div className="choice-editor">
        <div className="chips">
          {selected.map(id => {
            const category = categories.find(item => item.id === id);
            return (
              <button key={id} type="button" onClick={() => onChange(selected.filter(item => item !== id))}>
                {category ? `${category.label} (${id})` : id} ×
              </button>
            );
          })}
        </div>
        <input value={search} placeholder="Search categories" onChange={event => setSearch(event.target.value)} />
        <select value="" onChange={event => { if (event.target.value) onChange([...new Set([...selected, event.target.value])]); }}>
          <option value="">Select a category</option>
          {available.map(category => (
            <option key={category.id} value={category.id}>{category.label} ({category.id})</option>
          ))}
        </select>
      </div>
    );
  }
  if (attribute.input === "sku") {
    const selected = valuesOf(condition.value);
    return (
      <div className="choice-editor">
        <div className="chooser-field">
          <input value={selected.join(",")} placeholder="SKU" onChange={event => onChange(valuesOf(event.target.value))} />
          <ProductChooser selected={selected} onChange={onChange} browseCatalog={browseCatalog} />
        </div>
        <div className="chips">
          {selected.map(sku => (
            <button key={sku} type="button" onClick={() => onChange(selected.filter(item => item !== sku))}>{sku} ×</button>
          ))}
        </div>
      </div>
    );
  }
  return <input value={Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value ?? "")} onChange={event => onChange(event.target.value)} />;
}

function ConditionGroupEditor({
  group,
  depth,
  attributes,
  categories,
  onChange,
  onRemove,
  browseCatalog,
}: {
  group: ConditionGroup;
  depth: number;
  attributes: AttributeField[];
  categories: CategoryChoice[];
  onChange: (group: ConditionGroup) => void;
  onRemove?: () => void;
  browseCatalog: (query: CatalogQuery) => Promise<CatalogPage>;
}) {
  function updateChild(index: number, next: ConditionNode) {
    onChange({
      ...group,
      conditions: group.conditions.map((node, nodeIndex) => (nodeIndex === index ? next : node)),
    });
  }

  function removeChild(index: number) {
    onChange({ ...group, conditions: group.conditions.filter((_, nodeIndex) => nodeIndex !== index) });
  }

  return (
    <div className={depth > 1 ? "condition-group nested" : "condition-group"}>
      <p className="condition-heading">
        <span>If</span>
        <select value={group.aggregator} onChange={event => onChange({ ...group, aggregator: event.target.value as "all" | "any" })}>
          <option value="all">ALL</option>
          <option value="any">ANY</option>
        </select>
        <span>of these conditions are</span>
        <select value={String(group.matchValue !== false)} onChange={event => onChange({ ...group, matchValue: event.target.value === "true" })}>
          <option value="true">TRUE</option>
          <option value="false">FALSE</option>
        </select>
        {onRemove && <button className="minus" type="button" aria-label="Remove combination" onClick={onRemove}>−</button>}
      </p>
      {group.conditions.map((node, index) => {
        if (isGroup(node)) {
          return (
            <ConditionGroupEditor
              key={`group-${index}`}
              group={node}
              depth={depth + 1}
              attributes={attributes}
              categories={categories}
              onChange={next => updateChild(index, next)}
              onRemove={() => removeChild(index)}
              browseCatalog={browseCatalog}
            />
          );
        }
        const attribute = attributes.find(item => item.code === node.attribute);
        const operators = operatorsFor(attribute?.input || "text");
        return (
          <div className="condition-row" key={`condition-${index}-${node.attribute}`}>
            <AttributeChoices
              attributes={attributes}
              value={node.attribute}
              allowCombination={depth < MAX_GROUP_DEPTH}
              onChange={code => {
                if (code === COMBINATION) {
                  updateChild(index, emptyGroup());
                  return;
                }
                const nextAttribute = attributes.find(item => item.code === code);
                updateChild(index, { attribute: code, operator: operatorsFor(nextAttribute?.input || "text")[0][0], value: "" });
              }}
            />
            {attribute && (
              <>
                <select value={node.operator} onChange={event => updateChild(index, { ...node, operator: event.target.value })}>
                  {operators.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <div className="condition-value">
                  <ValueControl
                    attribute={attribute}
                    condition={node}
                    categories={categories}
                    onChange={value => updateChild(index, { ...node, value })}
                    browseCatalog={browseCatalog}
                  />
                </div>
              </>
            )}
            <button className="minus" type="button" aria-label="Remove condition" onClick={() => removeChild(index)}>−</button>
          </div>
        );
      })}
      <div className="group-actions">
        <button className="plus" type="button" aria-label="Add condition" onClick={() => onChange({ ...group, conditions: [...group.conditions, { attribute: "", operator: "eq", value: "" }] })}>+</button>
      </div>
    </div>
  );
}

/** Entrypoint for Blocks Management admin page. */
export function MainPage({ ims }: { ims: { imsToken: string; imsOrgId: string } }) {
  const [view, setView] = useState<AdminView>({ screen: "list" });
  const [rule, setRule] = useState<Rule>(emptyRule());
  const [brandsLogic, setBrandsLogic] = useState<BrandsListLogic>(emptyBrandsListLogic());
  const [presetId, setPresetId] = useState<string>();
  const [blockTypeId, setBlockTypeId] = useState(BLOCK_TYPE_FEATURED_RECOMMENDED);
  const blockType = getBlockType(blockTypeId);
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [presets, setPresets] = useState<SavedCondition[]>([]);
  const [attributes, setAttributes] = useState<AttributeField[]>(fallbackAttributes);
  const [categories, setCategories] = useState<CategoryChoice[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flushingCache, setFlushingCache] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [matched, setMatched] = useState<ProductChoice[]>([]);
  const [message, setMessage] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [editSection, setEditSection] = useState<BlockEditSection>("frontend-properties");

  async function invoke(name: string, params: Record<string, unknown>) {
    const url = actionUrl(name);
    if (!url) throw new Error(`Runtime action ${name} is not available. Run aio app dev so the action URL is generated.`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ims.imsToken}`,
        "Content-Type": "application/json",
        "x-gw-ims-org-id": ims.imsOrgId,
      },
      body: JSON.stringify(params),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Request failed with status ${response.status}.`);
    return payload;
  }

  async function loadPresets() {
    setLoadingPresets(true);
    try {
      const payload = await invoke("block-condition-list", {});
      setPresets(payload.presets || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load saved conditions.");
    } finally {
      setLoadingPresets(false);
    }
  }

  async function flushStorefrontCache() {
    setFlushingCache(true);
    try {
      await invoke("block-cache-flush", {});
      setMessage("Storefront caches cleared (condition SKU results and PDP evaluation).");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to flush storefront cache.");
    } finally {
      setFlushingCache(false);
    }
  }

  function resetEditor() {
    setPresetId(undefined);
    setName("");
    setEnabled(true);
    setRule(emptyRule());
    setBrandsLogic(emptyBrandsListLogic());
    setMatched([]);
    setMessage("");
  }

  function openPresetForEdit(preset: SavedCondition) {
    const typeId = preset.blockType || BLOCK_TYPE_FEATURED_RECOMMENDED;
    setPresetId(presetLookupId(preset));
    setBlockTypeId(typeId);
    setName(preset.name);
    setEnabled(preset.enabled !== false);
    if (typeId === BLOCK_TYPE_BRANDS_LIST) {
      setBrandsLogic(parseBrandsListLogic(preset.logic));
      setRule(emptyRule());
    } else {
      const featuredLogic = preset.logic as Rule;
      setRule({
        aggregator: featuredLogic.aggregator,
        matchValue: featuredLogic.matchValue !== false,
        productsToDisplay: displayCount(featuredLogic.productsToDisplay),
        conditions: featuredLogic.conditions || [],
      });
      setBrandsLogic(emptyBrandsListLogic());
    }
    setMatched([]);
    setMessage("");
    setEditSection("block-options");
    setView({ screen: "edit", blockTypeId: typeId, presetId: presetLookupId(preset) });
  }

  function buildLogicPayload() {
    if (blockTypeId === BLOCK_TYPE_BRANDS_LIST) {
      return brandsLogic;
    }
    return {
      aggregator: rule.aggregator,
      matchValue: rule.matchValue !== false,
      productsToDisplay: rule.productsToDisplay,
      conditions: rule.conditions,
    };
  }

  async function saveBlock(options?: { stayOnForm?: boolean }) {
    setSaving(true);
    try {
      const payload = await invoke("block-condition-write", {
        preset: {
          id: presetId,
          name,
          enabled,
          blockType: blockTypeId,
          logic: buildLogicPayload(),
        },
      });
      setPresetId(payload.preset.id);
      setName(payload.preset.name);
      await loadPresets();
      setMessage(`Saved ${payload.preset.name}.`);
      if (!options?.stayOnForm) {
        setView({ screen: "list" });
        resetEditor();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save this block.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBlock(id: string) {
    if (!window.confirm("Delete this block?")) return;
    try {
      await invoke("block-condition-remove", { id });
      await loadPresets();
      setMessage("Block deleted.");
      if (presetId === id) {
        resetEditor();
        setView({ screen: "list" });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete this block.");
    }
  }

  async function toggleEnabled(preset: SavedCondition) {
    try {
      await invoke("block-condition-write", {
        preset: {
          id: presetLookupId(preset),
          name: preset.name,
          enabled: preset.enabled === false,
          blockType: preset.blockType || BLOCK_TYPE_FEATURED_RECOMMENDED,
          logic: preset.logic,
        },
      });
      await loadPresets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update block status.");
    }
  }

  function runRowAction(preset: SavedCondition, action: string) {
    if (action === "edit") openPresetForEdit(preset);
    if (action === "delete") void deleteBlock(presetLookupId(preset));
    if (action === "toggle") void toggleEnabled(preset);
  }

  useEffect(() => {
    void loadPresets();
    void invoke("block-metadata", { resource: "attributes" })
      .then(payload => {
        if (payload.attributes?.length) setAttributes(payload.attributes);
      })
      .catch(error => setMessage(error instanceof Error ? error.message : "Unable to load product attributes."));
    void invoke("block-metadata", { resource: "categories" })
      .then(payload => setCategories(payload.categories || []))
      .catch(() => setCategories([]));
  }, []);

  async function fetchSkus() {
    setFetching(true);
    try {
      const payload = await invoke("block-metadata", {
        resource: "matches",
        aggregator: rule.aggregator,
        matchValue: rule.matchValue !== false,
        productsToDisplay: rule.productsToDisplay,
        conditions: rule.conditions,
      });
      const products = payload.products || [];
      setMatched(products);
      setMessage(products.length ? `${products.length} matching SKUs.` : "No SKUs match these conditions.");
    } catch (error) {
      setMatched([]);
      setMessage(error instanceof Error ? error.message : "Unable to fetch matching SKUs.");
    } finally {
      setFetching(false);
    }
  }

  const filteredPresets = presets.filter(preset => {
    if (!searchKeyword.trim()) return true;
    const haystack = `${preset.name} ${displayBlockId(preset)}`.toLowerCase();
    return haystack.includes(searchKeyword.trim().toLowerCase());
  });
  const totalPages = Math.max(1, Math.ceil(filteredPresets.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagePresets = filteredPresets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (view.screen === "type-select") {
    return (
      <main className="conditional-blocks">
        {message && <p className="message" role="status">{message}</p>}
        <SectionLayout
          heading="New Block"
          sections={[{ id: "frontend-properties", label: "Frontend Properties" }]}
          activeSectionId="frontend-properties"
          onSectionChange={() => {}}
          headerActions={
            <button type="button" className="link-button" onClick={() => setView({ screen: "list" })}>
              ← Back
            </button>
          }
        >
          <div className="field-row">
            <label htmlFor="block-type">Type</label>
            <select
              id="block-type"
              value={blockTypeId}
              onChange={event => setBlockTypeId(event.target.value)}
            >
              {blockTypes.map(type => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-continue"
            onClick={() => {
              resetEditor();
              setBlockTypeId(blockTypeId);
              if (blockTypeId === BLOCK_TYPE_BRANDS_LIST) {
                setBrandsLogic(emptyBrandsListLogic());
              } else {
                setRule(emptyRule());
              }
              setEditSection("frontend-properties");
              setView({ screen: "edit", blockTypeId });
            }}
          >
            Continue
          </button>
        </SectionLayout>
      </main>
    );
  }

  if (view.screen === "edit") {
    return (
      <main className="conditional-blocks">
        {(saving || fetching) ? <CommerceLoader /> : null}
        {message && <p className="message" role="status">{message}</p>}
        <SectionLayout
          heading={presetId ? "Edit Block" : "New Block"}
          sections={[...blockEditSections]}
          activeSectionId={editSection}
          onSectionChange={id => setEditSection(id as BlockEditSection)}
          headerActions={
            <button type="button" className="link-button" onClick={() => { resetEditor(); setView({ screen: "list" }); }}>
              ← Back to list
            </button>
          }
        >
          {editSection === "frontend-properties" && (
            <>
              <div className="field-row">
                <span id="block-type-edit-label">Type</span>
                <p className="field-readonly" id="block-type-edit" aria-labelledby="block-type-edit-label">
                  {blockType?.label ?? blockTypeId}
                </p>
              </div>
              <div className="field-row">
                <label htmlFor="block-title">Title<span className="required">*</span></label>
                <input id="block-title" value={name} onChange={event => setName(event.target.value)} />
              </div>
              <div className="field-row">
                <label htmlFor="block-enabled">Enabled</label>
                <select id="block-enabled" value={enabled ? "1" : "0"} onChange={event => setEnabled(event.target.value === "1")}>
                  <option value="1">Enabled</option>
                  <option value="0">Disabled</option>
                </select>
              </div>
            </>
          )}

          {editSection === "block-options" && (
            <>
              {blockTypeId === BLOCK_TYPE_BRANDS_LIST && (
                <BrandsListForm logic={brandsLogic} onChange={setBrandsLogic} />
              )}

              {blockTypeId === BLOCK_TYPE_FEATURED_RECOMMENDED && (
                <>
                  <div className="field-row">
                    <label htmlFor="products-count">Number of Products to Display<span className="required">*</span></label>
                    <input
                      id="products-count"
                      type="number"
                      min={1}
                      max={50}
                      value={rule.productsToDisplay}
                      onChange={event => setRule({ ...rule, productsToDisplay: displayCount(event.target.value) })}
                    />
                  </div>
                  <div className="conditions-field">
                    <div className="field-row conditions-label">
                      <span>Conditions<span className="required">*</span></span>
                    </div>
                    <ConditionGroupEditor
                      group={rule}
                      depth={1}
                      attributes={attributes}
                      categories={categories}
                      onChange={next => setRule(current => ({ ...current, ...next }))}
                      browseCatalog={async query => invoke("block-metadata", { resource: "catalog", ...query })}
                    />
                  </div>
                  <div className="matched-skus">
                    <button type="button" onClick={() => void fetchSkus()} disabled={fetching}>
                      {fetching ? "Fetching…" : "Fetch SKUs"}
                    </button>
                    {matched.length > 0 && (
                      <ul>
                        {matched.map(product => (
                          <li key={product.sku}><strong>{product.sku}</strong> {product.name !== product.sku && product.name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          <footer className="form-actions">
            <button type="button" className="btn-continue" onClick={() => void saveBlock()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => { resetEditor(); setView({ screen: "list" }); }}>Cancel</button>
          </footer>
        </SectionLayout>
      </main>
    );
  }

  return (
    <main className="conditional-blocks">
      {(loadingPresets || flushingCache) ? <CommerceLoader /> : null}
      <header className="page-header list-header">
        <h1>Blocks</h1>
        <div className="list-header-actions">
          <button
            type="button"
            onClick={() => void flushStorefrontCache()}
            disabled={flushingCache}
          >
            {flushingCache ? "Flushing…" : "Flush storefront cache"}
          </button>
          <button
            type="button"
            className="btn-continue"
            onClick={() => {
              resetEditor();
              setBlockTypeId(BLOCK_TYPE_FEATURED_RECOMMENDED);
              setView({ screen: "type-select" });
            }}
          >
            Add New Block
          </button>
        </div>
      </header>
      {message && <p className="message" role="status">{message}</p>}

      <div className="list-toolbar">
        <label className="search-field">
          <span className="sr-only">Search by keyword</span>
          <input
            placeholder="Search by keyword"
            value={searchKeyword}
            onChange={event => { setSearchKeyword(event.target.value); setPage(1); }}
          />
        </label>
        <span className="record-count">{filteredPresets.length} records found</span>
        <div className="pagination">
          <select value={PAGE_SIZE} disabled>
            <option value={PAGE_SIZE}>{PAGE_SIZE}</option>
          </select>
          <span>{currentPage} of {totalPages}</span>
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage(current => current - 1)} aria-label="Previous page">‹</button>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(current => current + 1)} aria-label="Next page">›</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="blocks-grid">
          <thead>
            <tr>
              <th>Block ID</th>
              <th>Title</th>
              <th>Created At</th>
              <th>Enabled</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {!loadingPresets && pagePresets.length === 0 && (
              <tr><td colSpan={5}>No blocks found.</td></tr>
            )}
            {!loadingPresets && pagePresets.map(preset => (
              <tr key={presetLookupId(preset)}>
                <td>{displayBlockId(preset)}</td>
                <td><button type="button" className="link-button" onClick={() => openPresetForEdit(preset)}>{preset.name}</button></td>
                <td>{formatCreatedAt(preset.createdAt || preset.updatedAt)}</td>
                <td>{preset.enabled === false ? "Disabled" : "Enabled"}</td>
                <td>
                  <select
                    defaultValue="select"
                    onChange={event => {
                      const action = event.target.value;
                      if (action !== "select") {
                        runRowAction(preset, action);
                        event.target.value = "select";
                      }
                    }}
                  >
                    <option value="select">Select</option>
                    <option value="edit">Edit</option>
                    <option value="toggle">{preset.enabled === false ? "Enable" : "Disable"}</option>
                    <option value="delete">Delete</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
