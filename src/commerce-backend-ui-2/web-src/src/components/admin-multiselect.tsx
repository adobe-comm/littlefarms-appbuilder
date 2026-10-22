import { useEffect, useId, useRef, useState } from "react";

export type AdminMultiselectOption = {
  value: string;
  label: string;
};

export function AdminMultiselect({
  id: idProp,
  label,
  options,
  values,
  onChange,
  onAddNew,
  disabled,
}: {
  id?: string;
  label: string;
  options: AdminMultiselectOption[];
  values: string[];
  onChange: (next: string[]) => void;
  onAddNew?: () => void;
  disabled?: boolean;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const byValue = new Map(options.map(option => [option.value, option.label]));

  function toggle(value: string) {
    if (values.includes(value)) {
      onChange(values.filter(item => item !== value));
    } else {
      onChange([...values, value]);
    }
  }

  const summary =
    values.length === 0
      ? "Select..."
      : values.map(value => byValue.get(value) || value).join(", ");

  return (
    <div className="field-row admin-multiselect-field">
      <label htmlFor={`${id}-trigger`}>{label}</label>
      <div className={`admin-ui-multiselect${open ? " is-open" : ""}`} ref={rootRef}>
        <button
          type="button"
          id={`${id}-trigger`}
          className="admin-ui-multiselect-trigger"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen(current => !current)}
        >
          <span className={`admin-ui-multiselect-value${values.length === 0 ? " is-placeholder" : ""}`}>
            {summary}
          </span>
          <span className="admin-ui-multiselect-caret" aria-hidden="true" />
        </button>
        {open ? (
          <div className="admin-ui-multiselect-panel" role="listbox" aria-label={label}>
            {onAddNew ? (
              <div className="admin-ui-multiselect-toolbar">
                <button type="button" onClick={onAddNew}>
                  Add new
                </button>
              </div>
            ) : null}
            <ul className="admin-ui-multiselect-options">
              {options.length === 0 ? (
                <li className="admin-ui-multiselect-empty">No options yet.</li>
              ) : (
                options.map(option => {
                  const checked = values.includes(option.value);
                  return (
                    <li key={option.value} role="presentation">
                      <div
                        className="admin-ui-multiselect-option"
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggle(option.value)}
                        onKeyDown={event => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggle(option.value);
                          }
                        }}
                        tabIndex={0}
                      >
                        <input type="checkbox" checked={checked} readOnly tabIndex={-1} aria-hidden="true" />
                        <span className="admin-ui-multiselect-option-text">{option.label}</span>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
            <div className="admin-ui-multiselect-footer">
              <button type="button" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
