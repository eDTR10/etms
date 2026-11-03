import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlignCenter, AlignLeft, AlignRight, Eraser } from "lucide-react";
import Swal from "sweetalert2";
import IPCRRichTextField from "./IPCRRichTextField";
import { cellCoords, flattenRuns, htmlToRuns, parseCellStyle, runsNeedRichText, runsToEditorHtml } from "./ipcrGridUtils";
import type { IPCRField, IPCRGridData, IPCRRichTextRun } from "./types";

const FONTS = ["Arial", "Calibri", "Cambria", "Courier New", "Georgia", "Palatino Linotype", "Tahoma", "Times New Roman", "Verdana"];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24];

// A colour picker that hands its colour over once you stop dragging, not on every shade it passes (each change redraws the
// whole sheet, which made dragging crawl).
function ColorInput({ value, label, onCommit }: { value: string; label: string; onCommit: (color: string) => void }) {
  const [shown, setShown] = useState(value);
  const timer = useRef<number | null>(null);
  const latest = useRef(shown);
  useEffect(() => { setShown(value); latest.current = value; }, [value]);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  const commit = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } if (latest.current !== value) onCommit(latest.current); };
  return (
    <input type="color" aria-label={label} value={shown}
      onChange={event => {
        latest.current = event.target.value;
        setShown(event.target.value);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => { timer.current = null; onCommit(latest.current); }, 500);
      }}
      onBlur={commit}
      style={{ width: 26, height: 24, padding: 0, border: 0, background: "transparent" }} />
  );
}

interface IPCRCellBarProps {
  grid: IPCRGridData;
  fields: IPCRField[];
  cell: string;
  // New text for the cell (null runs: plain text) — keeps the cell's look.
  onText: (runs: IPCRRichTextRun[] | null, text: string) => void;
  // Changes (or with null removes) CSS rules of the cell's look, e.g. { "font-weight": "bold" }.
  onStyle: (patch: Record<string, string | null>) => void;
  // When given, the text is typed there (in the cell itself) instead of in this bar.
  editorHost?: HTMLElement | null;
}

// The tools shown above the sheet while a cell of it is picked: type what the cell shows (with bold / italic / underline / bullets
// on any words), tie words to one of your fields, and change the cell's font, size, alignment and colours — right where you are,
// on this IPCR only.
export default function IPCRCellBar({ grid, fields, cell, onText, onStyle, editorHost = null }: IPCRCellBarProps) {
  const { col, row } = cellCoords(cell);
  const [html, setHtml] = useState(() => runsToEditorHtml(grid.richText?.[cell] ?? [{ text: String(grid.data[row]?.[col] ?? "") }]));
  const timer = useRef<number | null>(null);
  const latest = useRef({ onText });
  latest.current = { onText };
  // Another cell was picked: show what it holds (any change typed into the previous one has been applied already).
  useEffect(() => {
    flush();
    setHtml(runsToEditorHtml(grid.richText?.[cell] ?? [{ text: String(grid.data[row]?.[col] ?? "") }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell]);
  useEffect(() => () => flush(), []);  // eslint-disable-line react-hooks/exhaustive-deps

  function flush() {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
    pending.current?.();
  }
  const pending = useRef<(() => void) | null>(null);

  function change(next: string) {
    setHtml(next);
    pending.current = () => {
      const runs = htmlToRuns(next, { keepBlankLines: true });
      latest.current.onText(runsNeedRichText(runs) ? runs : null, flattenRuns(runs));
    };
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; pending.current?.(); }, 350);
  }

  // Turns the highlighted words into one of the fields the person already has.
  async function useField(selected: string, replace: (token: string) => void) {
    const options = Object.fromEntries(fields.map(field => [`{{${field.key}}}`, `${field.label} (${field.cell})`]));
    const { value, isConfirmed } = await Swal.fire({
      title: "Which field?",
      text: selected ? `"${selected.length > 40 ? `${selected.slice(0, 40)}…` : selected}" will show this field's answer.` : "This part of the cell will show this field's answer.",
      input: "select",
      inputOptions: options,
      inputPlaceholder: "Choose a field",
      showCancelButton: true,
      confirmButtonText: "Use field",
      inputValidator: choice => (choice ? null : "Choose one of your fields."),
    });
    if (isConfirmed && value) replace(String(value));
  }

  // The caret in the cell's own typing box, kept while the field list is open (opening it takes the focus away).
  const caret = useRef<Range | null>(null);
  function saveCaret() {
    const selection = window.getSelection();
    caret.current = editorHost && selection?.rangeCount && editorHost.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
  }
  function insertToken(token: string) {
    const editable = editorHost?.querySelector<HTMLElement>("[contenteditable]");
    if (!editable) { change(`${html}${token}`); return; }
    editable.focus();
    if (caret.current) { const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(caret.current); }
    document.execCommand("insertText", false, token);
  }

  // Bold / italic / underline: with words highlighted in the cell's typing box only those words change, otherwise the whole cell.
  function format(command: "bold" | "italic" | "underline", whole: () => void) {
    const selection = window.getSelection();
    const editable = editorHost?.querySelector<HTMLElement>("[contenteditable]");
    if (editable && selection && selection.rangeCount && !selection.isCollapsed && editable.contains(selection.anchorNode)) {
      document.execCommand(command);
      return;
    }
    whole();
  }
  // Keeps the highlighted words highlighted while a button of this bar is pressed.
  const keepSelection = (event: React.MouseEvent) => event.preventDefault();

  const look = parseCellStyle(grid.style[cell]);
  const control = "h-7 rounded border border-border bg-background px-1.5 text-[11px] text-foreground";
  const toggle = (active: boolean) => `h-7 w-7 inline-flex items-center justify-center rounded border text-[12px] ${active ? "border-primary bg-primary/15 text-primary" : "border-border bg-background text-foreground hover:bg-accent"}`;

  return (
    <div className="etm-ipcr-cellbar" role="region" aria-label={`Edit cell ${cell}`}
      style={{ position: "sticky", top: -12, zIndex: 40, boxShadow: "0 4px 14px rgba(0,0,0,.25)", display: "grid", gap: 8, padding: 10, marginBottom: 10, border: "1px solid var(--etm-border)", borderRadius: 10, background: "var(--etm-surface)", color: "var(--etm-ink)" }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <strong style={{ fontSize: 12.5, marginRight: 4 }}>Cell {cell}</strong>
        <select className={control} aria-label="Font" value={look.fontFamily && FONTS.includes(look.fontFamily) ? look.fontFamily : ""} onChange={event => onStyle({ "font-family": event.target.value || null })}>
          <option value="">Font</option>
          {FONTS.map(name => <option key={name} value={name}>{name}</option>)}
          {look.fontFamily && !FONTS.includes(look.fontFamily) && <option value="">{look.fontFamily}</option>}
        </select>
        <select className={control} aria-label="Size" value={look.fontSize && SIZES.includes(look.fontSize) ? String(look.fontSize) : ""} onChange={event => onStyle({ "font-size": event.target.value ? `${event.target.value}px` : null })}>
          <option value="">Size</option>
          {SIZES.map(size => <option key={size} value={size}>{size}</option>)}
        </select>
        <button type="button" className={toggle(look.bold)} title="Bold (the highlighted words, or the whole cell)" onMouseDown={keepSelection} onClick={() => format("bold", () => onStyle({ "font-weight": look.bold ? null : "bold" }))}><b>B</b></button>
        <button type="button" className={toggle(look.italic)} title="Italic (the highlighted words, or the whole cell)" onMouseDown={keepSelection} onClick={() => format("italic", () => onStyle({ "font-style": look.italic ? null : "italic" }))}><i>I</i></button>
        <button type="button" className={toggle(look.underline)} title="Underline (the highlighted words, or the whole cell)" onMouseDown={keepSelection} onClick={() => format("underline", () => onStyle({ "text-decoration": look.underline ? null : "underline" }))}><u>U</u></button>
        <button type="button" className={toggle(!look.align || look.align === "left")} title="Align left" onClick={() => onStyle({ "text-align": "left" })}><AlignLeft size={14} /></button>
        <button type="button" className={toggle(look.align === "center")} title="Align center" onClick={() => onStyle({ "text-align": "center" })}><AlignCenter size={14} /></button>
        <button type="button" className={toggle(look.align === "right")} title="Align right" onClick={() => onStyle({ "text-align": "right" })}><AlignRight size={14} /></button>
        <label className="inline-flex items-center gap-1 text-[11px]" title="Text colour">Text
          <ColorInput label="Text colour" value={look.color && /^#[0-9a-f]{6}$/i.test(look.color) ? look.color : "#000000"} onCommit={color => onStyle({ color })} />
        </label>
        <label className="inline-flex items-center gap-1 text-[11px]" title="Fill colour">Fill
          <ColorInput label="Fill colour" value={look.backgroundColor && /^#[0-9a-f]{6}$/i.test(look.backgroundColor) ? look.backgroundColor : "#ffffff"} onCommit={color => onStyle({ "background-color": color })} />
        </label>
        <select className={control} aria-label="Insert one of your fields" value="" onMouseDown={() => saveCaret()} onChange={event => { const token = event.target.value; if (token) insertToken(token); }}>
          <option value="">Insert field…</option>
          {fields.map(field => <option key={field.key} value={`{{${field.key}}}`}>{field.label} ({field.cell})</option>)}
        </select>
        <button type="button" className={toggle(false)} title="Clear fill" onClick={() => onStyle({ "background-color": null })}><Eraser size={14} /></button>
      </div>
      {(() => {
        const editor = <IPCRRichTextField value={html} onChange={change} placeholder="Type what this cell should show" onMakeField={(selected, replace) => void useField(selected, replace)} />;
        return editorHost ? createPortal(editor, editorHost) : editor;
      })()}
      <p style={{ margin: 0, fontSize: 11.5, color: "var(--etm-muted)" }}>
        Changes show in the sheet as you type and belong to this IPCR only. Double-click a cell to type in it; Ctrl+B / I / U style the words you highlight. Use “Insert field…” to put one of your fields in the text.
      </p>
    </div>
  );
}
