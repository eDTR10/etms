import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface MultiSelectOption {
  id: number;
  name: string;
  // A smaller line under the name (e.g. a position); searched too.
  detail?: string;
}

interface MultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  selected: number[];
  onChange: (selected: number[]) => void;
  placeholder?: string;
  // Draws the open list over the page (not inside its parent), so a dialog or a scrolling box cannot cut it off.
  portal?: boolean;
  // Opens the list in place, pushing what is below it down (for use inside a window, where a floating list can get hidden).
  inline?: boolean;
  // Pick one option (not several): choosing closes the list, choosing it again clears it.
  single?: boolean;
  disabled?: boolean;
}

// A dropdown of checkboxes with a search box: pick any number of options; the button shows how many are picked.
export default function MultiSelect({ label, options, selected, onChange, placeholder = "All", portal = false, inline = false, single = false, disabled = false }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    setQuery("");
    search.current?.focus();
    const away = (event: MouseEvent) => { const inside = event.target as Node; if (!root.current?.contains(inside) && !menu.current?.contains(inside)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", escape); };
  }, [open]);

  // Where the list goes when it is drawn over the page: under the button, or above it when there is no room below.
  useLayoutEffect(() => {
    if (!open || !portal) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom;
      const width = Math.max(rect.width, 300);
      const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
      setBox(below > 330 || below > rect.top ? { left, top: rect.bottom + 6, width } : { left, bottom: window.innerHeight - rect.top + 6, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, portal]);

  const chosen = useMemo(() => new Set(selected), [selected]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter(option => `${option.name} ${option.detail ?? ""}`.toLowerCase().includes(needle)) : options;
  }, [options, query]);
  // With nothing typed, what is already picked is listed first, under its own heading, so it is easy to see and undo.
  const grouped = !query.trim() && selected.length > 0 && visible.some(option => !chosen.has(option.id));
  const pickedOptions = grouped ? visible.filter(option => chosen.has(option.id)) : [];
  const restOptions = grouped ? visible.filter(option => !chosen.has(option.id)) : visible;
  const toggle = (id: number) => {
    if (single) { onChange(chosen.has(id) ? [] : [id]); setOpen(false); return; }
    onChange(chosen.has(id) ? selected.filter(item => item !== id) : [...selected, id]);
  };
  const summary = selected.length === 0 ? placeholder : selected.length === 1 ? (options.find(option => option.id === selected[0])?.name ?? "1 selected") : `${selected.length} selected`;

  return (
    <div className="etm-multi" ref={root}>
      <span className="etm-field-label">{label}</span>
      <button type="button" ref={trigger} className={`etm-multi-trigger ${selected.length ? "active" : ""}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={menuId} disabled={disabled} onClick={() => setOpen(value => !value)}>
        <span className="etm-multi-summary">{summary}</span>
        {selected.length > 0 && !single && <span className="etm-multi-count">{selected.length}</span>}
        <ChevronDown size={16} className="etm-multi-chevron" />
      </button>
      {open && (() => {
        const list = (
          <div className={`etm-multi-menu ${portal && !inline ? "portal" : ""} ${inline ? "inline" : ""}`} id={menuId} ref={menu}
            style={portal && !inline ? { position: "fixed", zIndex: 100000, left: box?.left ?? 0, width: box?.width, ...(box?.top !== undefined ? { top: box.top } : { bottom: box?.bottom }), visibility: box ? "visible" : "hidden" } : undefined}>
          <div className="etm-multi-search">
            <Search size={14} />
            <input ref={search} value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}…`} aria-label={`Search ${label}`} />
            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={13} /></button>}
          </div>
          <div className="etm-multi-actions">
            {single ? <span /> : <button type="button" onClick={() => onChange(Array.from(new Set([...selected, ...visible.map(option => option.id)])))} disabled={!visible.length}>Select {query ? "shown" : "all"}</button>}
            <button type="button" onClick={() => onChange(query ? selected.filter(id => !visible.some(option => option.id === id)) : [])} disabled={!selected.length}>Clear</button>
          </div>
          <div className="etm-multi-list" role="listbox" aria-multiselectable={!single}>
            {(() => {
              const row = (option: { id: number; name: string; detail?: string }) => {
                const on = chosen.has(option.id);
                return (
                  <button type="button" key={option.id} role="option" aria-selected={on} className={`etm-multi-option ${on ? "on" : ""}`} onClick={() => toggle(option.id)}>
                    <span className={`etm-multi-box ${single ? "round" : ""}`}>{on && <Check size={12} strokeWidth={3} />}</span>
                    <span className="etm-multi-text"><span>{option.name}</span>{option.detail && <small>{option.detail}</small>}</span>
                  </button>
                );
              };
              if (!visible.length) return <p className="etm-multi-none">Nothing matches.</p>;
              return (
                <>
                  {grouped && <p className="etm-multi-heading">Selected ({pickedOptions.length})</p>}
                  {pickedOptions.map(row)}
                  {grouped && <p className="etm-multi-heading">All options</p>}
                  {restOptions.map(row)}
                </>
              );
            })()}
          </div>
          </div>
        );
        return portal && !inline ? createPortal(list, document.body) : list;
      })()}
    </div>
  );
}
