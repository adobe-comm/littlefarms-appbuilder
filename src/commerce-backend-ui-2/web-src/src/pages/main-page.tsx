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
type CategoryChoice = { id: string; label: string; name?: string; parentId?: string; productCount?: number | null };
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

type BlockListFilters = {
  blockIdFrom: string;
  blockIdTo: string;
  createdFrom: string;
  createdTo: string;
  title: string;
  enabled: "" | "1" | "0";
};

const emptyBlockFilters = (): BlockListFilters => ({
  blockIdFrom: "",
  blockIdTo: "",
  createdFrom: "",
  createdTo: "",
  title: "",
  enabled: "",
});

function presetMatchesFilters(preset: SavedCondition, keyword: string, filters: BlockListFilters): boolean {
  const term = keyword.trim().toLowerCase();
  if (term) {
    const haystack = `${preset.name} ${displayBlockId(preset)}`.toLowerCase();
    if (!haystack.includes(term)) return false;
  }
  const title = filters.title.trim().toLowerCase();
  if (title && !preset.name.toLowerCase().includes(title)) return false;
  if (filters.enabled === "1" && preset.enabled === false) return false;
  if (filters.enabled === "0" && preset.enabled !== false) return false;

  const blockId = displayBlockId(preset);
  const blockNumber = /^\d+$/.test(blockId) ? Number(blockId) : null;
  if (filters.blockIdFrom.trim()) {
    const from = Number(filters.blockIdFrom);
    if (blockNumber == null || !Number.isFinite(from) || blockNumber < from) return false;
  }
  if (filters.blockIdTo.trim()) {
    const to = Number(filters.blockIdTo);
    if (blockNumber == null || !Number.isFinite(to) || blockNumber > to) return false;
  }

  const createdRaw = preset.createdAt || preset.updatedAt;
  const created = createdRaw ? new Date(createdRaw) : null;
  const createdTime = created && !Number.isNaN(created.getTime()) ? created.getTime() : null;
  if (filters.createdFrom) {
    const from = new Date(`${filters.createdFrom}T00:00:00`).getTime();
    if (createdTime == null || createdTime < from) return false;
  }
  if (filters.createdTo) {
    const to = new Date(`${filters.createdTo}T23:59:59`).getTime();
    if (createdTime == null || createdTime > to) return false;
  }
  return true;
}

const blockColumns = [
  { id: "blockId", label: "Block ID" },
  { id: "title", label: "Title" },
  { id: "createdAt", label: "Created At" },
  { id: "enabled", label: "Enabled" },
  { id: "action", label: "Action" },
] as const;

type BlockColumnId = (typeof blockColumns)[number]["id"];

const defaultBlockColumns = (): Record<BlockColumnId, boolean> => ({
  blockId: true,
  title: true,
  createdAt: true,
  enabled: true,
  action: true,
});

function appliedFilterLabels(keyword: string, filters: BlockListFilters): string[] {
  const labels: string[] = [];
  if (keyword.trim()) labels.push(`Keyword: ${keyword.trim()}`);
  if (filters.blockIdFrom.trim() || filters.blockIdTo.trim()) {
    const range = [
      filters.blockIdFrom.trim() ? `from ${filters.blockIdFrom.trim()}` : "",
      filters.blockIdTo.trim() ? `to ${filters.blockIdTo.trim()}` : "",
    ].filter(Boolean).join(" ");
    labels.push(`Block ID: ${range}`);
  }
  if (filters.createdFrom || filters.createdTo) {
    const range = [
      filters.createdFrom ? `from ${filters.createdFrom}` : "",
      filters.createdTo ? `to ${filters.createdTo}` : "",
    ].filter(Boolean).join(" ");
    labels.push(`Created At: ${range}`);
  }
  if (filters.title.trim()) labels.push(`Title: ${filters.title.trim()}`);
  if (filters.enabled === "1") labels.push("Enabled: Yes");
  if (filters.enabled === "0") labels.push("Enabled: No");
  return labels;
}
const blockEditSections = [
  { id: "frontend-properties", label: "Frontend Properties" },
  { id: "block-options", label: "Widget Options" },
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

type EditorBaseline = {
  name: string;
  enabled: boolean;
  rule: Rule;
  brandsLogic: BrandsListLogic;
};

function cloneDraft<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function emptyBaseline(): EditorBaseline {
  return { name: "", enabled: true, rule: emptyRule(), brandsLogic: emptyBrandsListLogic() };
}

function uniqueCopyName(name: string, existing: SavedCondition[]): string {
  const names = new Set(existing.map(item => item.name.toLowerCase()));
  const base = `${name} - copy`;
  if (!names.has(base.toLowerCase())) return base;
  let index = 2;
  while (names.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
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
      <option value="">Please choose a condition to add.</option>
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
  const [page, setPage] = useState<CatalogPage>({ items: [], total: 0, page: 1, pageSize: 20 });
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

  const pageSize = page.pageSize || 20;
  const lastPage = Math.max(1, Math.ceil(page.total / pageSize) || 1);
  const pageSkus = page.items.map(product => product.sku);
  const allPicked = pageSkus.length > 0 && pageSkus.every(sku => picked.includes(sku));
  const typeLabel = (typeId: string) => ({
    simple: "Simple Product",
    configurable: "Configurable Product",
    virtual: "Virtual Product",
    bundle: "Bundle Product",
    grouped: "Grouped Product",
  }[typeId] || typeId);

  return (
    <div className="sku-condition">
      <div className="rule-value">
        <input
          value={selected.join(",")}
          aria-label="SKU"
          onChange={event => {
            const next = valuesOf(event.target.value);
            onChange(next);
            setPicked(next);
          }}
        />
        <button type="button" className="chooser-open" aria-label="Choose products" aria-expanded={open} onClick={() => open ? setOpen(false) : openChooser()}>▦</button>
        <button type="button" className="rule-confirm" aria-label="Apply" onClick={() => { onChange(picked); setOpen(false); }}>✓</button>
      </div>
      {open ? (
        <div className="chooser-panel" role="dialog" aria-label="Choose products">
          {loading ? <CommerceLoader cover="local" /> : null}
          <div className="chooser-toolbar">
            <button type="button" className="chooser-search" onClick={() => void load({ ...draft, page: 1 })}>Search</button>
            <button type="button" className="chooser-reset" onClick={() => { const next = emptyCatalogQuery(); setDraft(next); void load(next); }}>Reset Filter</button>
            <span className="chooser-count">{page.total} records found</span>
            <div className="admin-pager">
              <label>
                <select value={pageSize} disabled aria-label="Records per page">
                  <option value={pageSize}>{pageSize}</option>
                </select>
                <span>per page</span>
              </label>
              <button type="button" disabled={query.page <= 1 || loading} onClick={() => void load({ ...query, page: query.page - 1 })} aria-label="Previous page">‹</button>
              <input aria-label="Current page" value={query.page} readOnly />
              <span>of {lastPage}</span>
              <button type="button" disabled={query.page >= lastPage || loading} onClick={() => void load({ ...query, page: query.page + 1 })} aria-label="Next page">›</button>
            </div>
          </div>
          {error ? <p className="message" role="status">{error}</p> : null}
          <div className="admin-grid-wrap">
            <table className="admin-grid chooser-grid">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={allPicked} aria-label="Select page" onChange={event => {
                    setPicked(current => event.target.checked
                      ? [...new Set([...current, ...pageSkus])]
                      : current.filter(sku => !pageSkus.includes(sku)));
                  }} /></th>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Attribute Set</th>
                  <th>SKU</th>
                  <th>Product</th>
                </tr>
                <tr className="chooser-filters">
                  <th><select aria-label="Match" defaultValue="any"><option value="any">Any</option></select></th>
                  <th><input aria-label="ID" value={draft.entityId} onChange={event => setDraft({ ...draft, entityId: event.target.value })} onKeyDown={event => { if (event.key === "Enter") void load({ ...draft, page: 1 }); }} /></th>
                  <th>
                    <select aria-label="Type" value={draft.typeId} onChange={event => setDraft({ ...draft, typeId: event.target.value })}>
                      <option value=""> </option>
                      <option value="simple">Simple Product</option>
                      <option value="configurable">Configurable Product</option>
                      <option value="virtual">Virtual Product</option>
                      <option value="bundle">Bundle Product</option>
                      <option value="grouped">Grouped Product</option>
                    </select>
                  </th>
                  <th><input aria-label="Attribute set" value={draft.attributeSetId} onChange={event => setDraft({ ...draft, attributeSetId: event.target.value })} onKeyDown={event => { if (event.key === "Enter") void load({ ...draft, page: 1 }); }} /></th>
                  <th><input aria-label="SKU filter" value={draft.sku} onChange={event => setDraft({ ...draft, sku: event.target.value })} onKeyDown={event => { if (event.key === "Enter") void load({ ...draft, page: 1 }); }} /></th>
                  <th><input aria-label="Product" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} onKeyDown={event => { if (event.key === "Enter") void load({ ...draft, page: 1 }); }} /></th>
                </tr>
              </thead>
              <tbody>
                {!loading && page.items.length === 0 ? (
                  <tr><td colSpan={6}>We couldn't find any records.</td></tr>
                ) : null}
                {page.items.map(product => (
                  <tr key={product.sku}>
                    <td><input type="checkbox" checked={picked.includes(product.sku)} aria-label={`Select ${product.sku}`} onChange={() => toggle(product.sku)} /></td>
                    <td>{product.id}</td>
                    <td>{typeLabel(product.typeId)}</td>
                    <td>{product.attributeSetId}</td>
                    <td>{product.sku}</td>
                    <td>{product.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type CategoryNode = CategoryChoice & { children: CategoryNode[] };

function categoryOwnName(category: CategoryChoice): string {
  if (category.name && !category.name.includes(" / ")) return category.name;
  const parts = category.label.split(" / ").map(part => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || category.label;
}

function categoryNodes(categories: CategoryChoice[]): CategoryNode[] {
  const linked = categories.some(category => category.parentId && categories.some(item => item.id === category.parentId));
  if (linked) {
    const nodes = new Map<string, CategoryNode>();
    for (const category of categories) nodes.set(category.id, { ...category, name: categoryOwnName(category), children: [] });
    const roots: CategoryNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent && parent.id !== node.id) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  const byPath = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];
  const ordered = [...categories].sort((left, right) => left.label.split(" / ").length - right.label.split(" / ").length);
  for (const category of ordered) {
    const parts = category.label.split(" / ").map(part => part.trim()).filter(Boolean);
    const node: CategoryNode = { ...category, name: parts[parts.length - 1] || category.label, children: [] };
    byPath.set(parts.join(" / "), node);
    let parent: CategoryNode | undefined;
    for (let size = parts.length - 1; size >= 1; size -= 1) {
      parent = byPath.get(parts.slice(0, size).join(" / "));
      if (parent) break;
    }
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function CategoryTreeNode({
  node,
  picked,
  onToggle,
  depth,
}: {
  node: CategoryNode;
  picked: string[];
  onToggle: (id: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 1);
  const count = node.productCount != null ? node.productCount : node.id;
  return (
    <li>
      <div className="category-node">
        {node.children.length ? (
          <button type="button" className="category-toggle" aria-expanded={open} onClick={() => setOpen(current => !current)}>{open ? "▾" : "▸"}</button>
        ) : <span className="category-toggle" />}
        <input type="checkbox" checked={picked.includes(node.id)} aria-label={node.name || node.label} onChange={() => onToggle(node.id)} />
        <span className="category-folder" aria-hidden="true" />
        <span>{node.name || node.label} ({count})</span>
      </div>
      {open && node.children.length ? (
        <ul>
          {node.children.map(child => (
            <CategoryTreeNode key={child.id} node={child} picked={picked} onToggle={onToggle} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function CategoryChooser({
  categories,
  selected,
  onChange,
}: {
  categories: CategoryChoice[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(selected.length > 0);
  const [picked, setPicked] = useState<string[]>(selected);
  const tree = categoryNodes(categories);
  const summary = selected.map(id => categories.find(category => category.id === id)?.name || id).join(", ");

  function toggle(id: string) {
    setPicked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  if (!editing) {
    return <button type="button" className="rule-placeholder" onClick={() => setEditing(true)}>...</button>;
  }

  return (
    <div className="sku-condition">
      <div className="rule-value">
        <input value={summary} aria-label="Categories" readOnly />
        <button type="button" className="chooser-open" aria-label="Choose categories" aria-expanded={open} onClick={() => {
          if (open) setOpen(false);
          else {
            setPicked(selected);
            setOpen(true);
          }
        }}>▦</button>
        <button type="button" className="rule-confirm" aria-label="Apply" onClick={() => { onChange(picked); setOpen(false); }}>✓</button>
      </div>
      {open ? (
        <div className="category-tree" role="tree" aria-label="Categories">
          <ul>
            {tree.map(node => (
              <CategoryTreeNode key={node.id} node={node} picked={picked} onToggle={toggle} depth={0} />
            ))}
          </ul>
        </div>
      ) : null}
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
    return <CategoryChooser categories={categories} selected={valuesOf(condition.value)} onChange={onChange} />;
  }
  if (attribute.input === "sku") {
    return <ProductChooser selected={valuesOf(condition.value)} onChange={onChange} browseCatalog={browseCatalog} />;
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
        <span>:</span>
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
          <div className="condition-entry" key={`condition-${index}-${node.attribute}`}>
            <div className="condition-row">
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
              {node.attribute ? <button className="minus" type="button" aria-label="Remove condition" onClick={() => removeChild(index)}>×</button> : null}
            </div>
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
  const [fetching, setFetching] = useState(false);
  const [matched, setMatched] = useState<ProductChoice[]>([]);
  const [message, setMessage] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(defaultBlockColumns);
  const [columnSnapshot, setColumnSnapshot] = useState(defaultBlockColumns);
  const [filterDraft, setFilterDraft] = useState<BlockListFilters>(emptyBlockFilters());
  const [appliedFilters, setAppliedFilters] = useState<BlockListFilters>(emptyBlockFilters());
  const [page, setPage] = useState(1);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<EditorBaseline>(emptyBaseline);
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
    const nextRule = typeId === BLOCK_TYPE_BRANDS_LIST
      ? emptyRule()
      : {
        aggregator: (preset.logic as Rule).aggregator,
        matchValue: (preset.logic as Rule).matchValue !== false,
        productsToDisplay: displayCount((preset.logic as Rule).productsToDisplay),
        conditions: (preset.logic as Rule).conditions || [],
      };
    const nextBrands = typeId === BLOCK_TYPE_BRANDS_LIST
      ? parseBrandsListLogic(preset.logic)
      : emptyBrandsListLogic();
    setRule(nextRule);
    setBrandsLogic(nextBrands);
    setMatched([]);
    setMessage("");
    setEditSection("frontend-properties");
    setBaseline(cloneDraft({
      name: preset.name,
      enabled: preset.enabled !== false,
      rule: nextRule,
      brandsLogic: nextBrands,
    }));
    setView({ screen: "edit", blockTypeId: typeId, presetId: presetLookupId(preset) });
  }

  function resetToBaseline() {
    setName(baseline.name);
    setEnabled(baseline.enabled);
    setRule(cloneDraft(baseline.rule));
    setBrandsLogic(cloneDraft(baseline.brandsLogic));
    setMatched([]);
    setMessage("");
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
      if (options?.stayOnForm) {
        setBaseline(cloneDraft({
          name: payload.preset.name,
          enabled,
          rule,
          brandsLogic,
        }));
      } else {
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

  async function duplicateBlock(preset: SavedCondition) {
    try {
      await invoke("block-condition-write", {
        preset: {
          name: uniqueCopyName(preset.name, presets),
          enabled: preset.enabled !== false,
          blockType: preset.blockType || BLOCK_TYPE_FEATURED_RECOMMENDED,
          logic: preset.logic,
        },
      });
      await loadPresets();
      setMessage(`Duplicated ${preset.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to duplicate this block.");
    }
  }

  function runRowAction(preset: SavedCondition, action: string) {
    setOpenActionId(null);
    if (action === "edit") openPresetForEdit(preset);
    if (action === "duplicate") void duplicateBlock(preset);
    if (action === "delete") void deleteBlock(presetLookupId(preset));
  }

  useEffect(() => {
    if (!openActionId) return;
    function close(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".admin-action")) return;
      setOpenActionId(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenActionId(null);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openActionId]);

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

  const filteredPresets = presets.filter(preset => presetMatchesFilters(preset, searchKeyword, appliedFilters));
  const activeFilters = appliedFilterLabels(searchKeyword, appliedFilters);
  const shownColumns = blockColumns.filter(column => visibleColumns[column.id]);
  const visibleColumnCount = shownColumns.length;
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
              const nextRule = emptyRule();
              const nextBrands = emptyBrandsListLogic();
              if (blockTypeId === BLOCK_TYPE_BRANDS_LIST) {
                setBrandsLogic(nextBrands);
              } else {
                setRule(nextRule);
              }
              setBaseline(cloneDraft({ name: "", enabled: true, rule: nextRule, brandsLogic: nextBrands }));
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
      <main className="conditional-blocks block-edit-page">
        {(saving || fetching) ? <CommerceLoader /> : null}
        <SectionLayout
          heading={presetId ? "Edit Block" : "New Block"}
          navTitle="Widget information"
          sections={[...blockEditSections]}
          activeSectionId={editSection}
          onSectionChange={id => setEditSection(id as BlockEditSection)}
          headerActions={
            <div className="block-edit-actions">
              <button type="button" onClick={() => { resetEditor(); setView({ screen: "list" }); }}>← Back</button>
              {presetId ? (
                <button type="button" onClick={() => void deleteBlock(presetId)} disabled={saving}>Delete Block</button>
              ) : null}
              <button type="button" onClick={resetToBaseline} disabled={saving}>Reset</button>
              <button type="button" onClick={() => void saveBlock({ stayOnForm: true })} disabled={saving}>Save and Continue Edit</button>
              <button type="button" className="admin-primary" onClick={() => void saveBlock()} disabled={saving}>
                {saving ? "Saving…" : "Save Block"}
              </button>
            </div>
          }
        >
          {message ? <p className="message" role="status">{message}</p> : null}
          {editSection === "frontend-properties" && (
            <>
              <h2 className="block-edit-section-title">Frontend Properties</h2>
              <div className="field-row">
                <label htmlFor="block-type-edit">Type</label>
                <select id="block-type-edit" value={blockTypeId} disabled>
                  <option value={blockTypeId}>{blockType?.label ?? blockTypeId}</option>
                </select>
              </div>
              <div className="field-row">
                <label htmlFor="block-title">Title<span className="required">*</span></label>
                <input id="block-title" value={name} onChange={event => setName(event.target.value)} />
              </div>
              <div className="field-row">
                <label htmlFor="block-enabled">Enable Block</label>
                <span className="admin-toggle">
                  <input id="block-enabled" type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
                  <span>{enabled ? "Yes" : "No"}</span>
                </span>
              </div>
            </>
          )}

          {editSection === "block-options" && (
            <>
              <h2 className="block-edit-section-title">Widget Options</h2>
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
                  <div className="field-row conditions-label">
                    <span>Conditions<span className="required">*</span></span>
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

        </SectionLayout>
      </main>
    );
  }

  return (
    <main className="conditional-blocks admin-list">
      {loadingPresets ? <CommerceLoader /> : null}
      <header className="admin-list-header">
        <h1>Blocks Management</h1>
      </header>
      <div className="admin-list-band">
        <button
          type="button"
          className="admin-primary"
          onClick={() => {
            resetEditor();
            setBlockTypeId(BLOCK_TYPE_FEATURED_RECOMMENDED);
            setView({ screen: "type-select" });
          }}
        >
          Add New Block
        </button>
      </div>
      <div className="admin-list-body">
      {message && <p className="message" role="status">{message}</p>}

      <section className="admin-grid-card">
        {activeFilters.length > 0 ? (
          <div className="admin-active-filters">
            <span>Active filters:</span>
            {activeFilters.map(label => (
              <span key={label} className="admin-filter-chip">{label}</span>
            ))}
            <button
              type="button"
              className="admin-clear"
              onClick={() => {
                setSearchKeyword("");
                setAppliedFilters(emptyBlockFilters());
                setFilterDraft(emptyBlockFilters());
                setPage(1);
              }}
            >
              Clear all
            </button>
          </div>
        ) : null}
        <div className="admin-search-row">
          <form className="admin-keyword" onSubmit={event => event.preventDefault()}>
            <label className="sr-only" htmlFor="block-keyword">Search by keyword</label>
            <input
              id="block-keyword"
              placeholder="Search by keyword"
              value={searchKeyword}
              onChange={event => { setSearchKeyword(event.target.value); setPage(1); }}
            />
            <button type="submit" className="admin-keyword-submit">Search</button>
          </form>
          <div className="admin-grid-tools">
            <button
              type="button"
              className={filtersOpen ? "admin-filters-toggle open" : "admin-filters-toggle"}
              aria-expanded={filtersOpen}
              onClick={() => {
                setFilterDraft(appliedFilters);
                setFiltersOpen(open => !open);
              }}
            >
              Filters
            </button>
            <div className="admin-columns">
              <button
                type="button"
                className={columnsOpen ? "admin-columns-toggle open" : "admin-columns-toggle"}
                aria-expanded={columnsOpen}
                onClick={() => {
                  setColumnsOpen(open => {
                    if (!open) setColumnSnapshot(visibleColumns);
                    return !open;
                  });
                }}
              >
                Columns
              </button>
              {columnsOpen ? (
                <div className="admin-columns-menu" role="dialog" aria-label="Columns">
                  <p className="admin-columns-count">{visibleColumnCount} out of {blockColumns.length} visible</p>
                  <div className="admin-columns-list">
                    {blockColumns.map(column => (
                      <label key={column.id}>
                        <input
                          type="checkbox"
                          checked={visibleColumns[column.id]}
                          onChange={() => setVisibleColumns(current => ({ ...current, [column.id]: !current[column.id] }))}
                        />
                        {column.label}
                      </label>
                    ))}
                  </div>
                  <div className="admin-columns-actions">
                    <button type="button" className="admin-clear" onClick={() => setVisibleColumns(defaultBlockColumns())}>Reset</button>
                    <button
                      type="button"
                      className="admin-clear"
                      onClick={() => {
                        setVisibleColumns(columnSnapshot);
                        setColumnsOpen(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {filtersOpen ? (
          <form
            className="admin-filter-panel"
            onSubmit={event => {
              event.preventDefault();
              setAppliedFilters(filterDraft);
              setPage(1);
            }}
          >
            <div className="admin-filter-col">
              <span className="admin-filter-name">Block ID</span>
              <label>
                from
                <input
                  inputMode="numeric"
                  value={filterDraft.blockIdFrom}
                  onChange={event => setFilterDraft(current => ({ ...current, blockIdFrom: event.target.value }))}
                />
              </label>
              <label>
                to
                <input
                  inputMode="numeric"
                  value={filterDraft.blockIdTo}
                  onChange={event => setFilterDraft(current => ({ ...current, blockIdTo: event.target.value }))}
                />
              </label>
            </div>
            <div className="admin-filter-col">
              <span className="admin-filter-name">Created At</span>
              <label>
                from
                <input
                  type="date"
                  value={filterDraft.createdFrom}
                  onChange={event => setFilterDraft(current => ({ ...current, createdFrom: event.target.value }))}
                />
              </label>
              <label>
                to
                <input
                  type="date"
                  value={filterDraft.createdTo}
                  onChange={event => setFilterDraft(current => ({ ...current, createdTo: event.target.value }))}
                />
              </label>
            </div>
            <div className="admin-filter-col admin-filter-title">
              <span className="admin-filter-name">Title</span>
              <label>
                <span className="sr-only">Title</span>
                <input
                  value={filterDraft.title}
                  onChange={event => setFilterDraft(current => ({ ...current, title: event.target.value }))}
                />
              </label>
            </div>
            <div className="admin-filter-col">
              <span className="admin-filter-name">Enabled</span>
              <label>
                <span className="sr-only">Enabled</span>
                <select
                  value={filterDraft.enabled}
                  onChange={event => setFilterDraft(current => ({ ...current, enabled: event.target.value as BlockListFilters["enabled"] }))}
                >
                  <option value=""> </option>
                  <option value="1">Enabled</option>
                  <option value="0">Disabled</option>
                </select>
              </label>
            </div>
            <div className="admin-filter-actions">
              <button
                type="button"
                className="admin-clear"
                onClick={() => {
                  setFilterDraft(appliedFilters);
                  setFiltersOpen(false);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="admin-apply-filters">Apply Filters</button>
            </div>
          </form>
        ) : null}
        <div className="admin-grid-toolbar">
          <span className="admin-record-count">{filteredPresets.length} records found</span>
          <div className="admin-pager">
            <label>
              <select value={PAGE_SIZE} disabled aria-label="Records per page">
                <option value={PAGE_SIZE}>{PAGE_SIZE}</option>
              </select>
              <span>per page</span>
            </label>
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage(current => current - 1)} aria-label="Previous page">‹</button>
            <input
              key={currentPage}
              aria-label="Current page"
              defaultValue={currentPage}
              onBlur={event => {
                const next = Number(event.target.value);
                if (Number.isInteger(next) && next >= 1 && next <= totalPages) setPage(next);
              }}
              onKeyDown={event => {
                if (event.key !== "Enter") return;
                const next = Number((event.target as HTMLInputElement).value);
                if (Number.isInteger(next) && next >= 1 && next <= totalPages) setPage(next);
              }}
            />
            <span>of {totalPages}</span>
            <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(current => current + 1)} aria-label="Next page">›</button>
          </div>
        </div>

      <div className="admin-grid-wrap">
        <table className="admin-grid">
          <thead>
            <tr>
              {shownColumns.map(column => <th key={column.id}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {!loadingPresets && pagePresets.length === 0 && (
              <tr><td colSpan={Math.max(visibleColumnCount, 1)}>We couldn't find any records.</td></tr>
            )}
            {!loadingPresets && pagePresets.map(preset => (
              <tr key={presetLookupId(preset)}>
                {visibleColumns.blockId ? <td>{displayBlockId(preset)}</td> : null}
                {visibleColumns.title ? <td><button type="button" className="admin-row-link" onClick={() => openPresetForEdit(preset)}>{preset.name}</button></td> : null}
                {visibleColumns.createdAt ? <td>{formatCreatedAt(preset.createdAt || preset.updatedAt)}</td> : null}
                {visibleColumns.enabled ? <td>{preset.enabled === false ? "Disabled" : "Enabled"}</td> : null}
                {visibleColumns.action ? (
                  <td>
                    <div className="admin-action">
                      <button
                        type="button"
                        className={openActionId === presetLookupId(preset) ? "admin-action-toggle open" : "admin-action-toggle"}
                        aria-expanded={openActionId === presetLookupId(preset)}
                        aria-haspopup="menu"
                        onClick={() => {
                          const id = presetLookupId(preset);
                          setOpenActionId(current => current === id ? null : id);
                        }}
                      >
                        Select
                      </button>
                      {openActionId === presetLookupId(preset) ? (
                        <div className="admin-action-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => runRowAction(preset, "edit")}>Edit</button>
                          <button type="button" role="menuitem" onClick={() => runRowAction(preset, "duplicate")}>Duplicate</button>
                          <button type="button" role="menuitem" onClick={() => runRowAction(preset, "delete")}>Delete</button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </section>
      </div>
    </main>
  );
}
