import { useEffect, useMemo, useRef } from "react";
import IPCRGrid, { type IPCRGridHandle } from "./IPCRGrid";
import IPCRGridImageOverlay from "./IPCRGridImageOverlay";
import IPCRGridRichTextOverlay from "./IPCRGridRichTextOverlay";
import { TASK_DRAG_TYPE, columnName, fillGrid } from "./ipcrGridUtils";
import type { IPCRField, IPCRFieldValue, IPCRGridData } from "./types";

interface IPCRLivePreviewProps {
  grid: IPCRGridData;
  fields: IPCRField[];
  values: Record<string, IPCRFieldValue>;
  // Bump this from the caller when the values changed: the text layers redraw. The sheet itself is NOT rebuilt for it —
  // only the cells whose text changed are updated in place, so typing never blanks or flickers the preview. (The sheet is
  // rebuilt only when its structure changes: a different layout, merges, sizes, formatting or a row / column added.)
  refreshKey: number | string;
  // The field whose cell(s) should glow in the sheet (the one being typed in or pointed at on the form).
  focusKey?: string | null;
  // Double-clicking a cell of the sheet (its text layers included) reports which one, e.g. "D63".
  onCellDoubleClick?: (cell: string) => void;
  // A single click on a cell (its text layers included) reports which one; `pickedRow` is tinted to show the choice.
  onCellClick?: (cell: string) => void;
  pickedRow?: number | null;
  // Something dragged from the task list and dropped on a cell: the cell and what was dragged (the drag's payload string).
  onDropTask?: (cell: string, payload: string) => void;
  // Filled in with a function that reports the heights the rows really have on screen (see IPCRGrid).
  measureRef?: { current: (() => Record<number, number>) | null };
  // What the right-click menu of the sheet offers (see IPCRGrid's `contextItems`).
  contextItems?: (target: { col: number | null; row: number | null }) => { title: string; onclick: () => void }[];
}

export default function IPCRLivePreview({ grid, fields, values, refreshKey, focusKey = null, onCellDoubleClick, onCellClick, pickedRow = null, onDropTask, contextItems, measureRef }: IPCRLivePreviewProps) {
  if (measureRef) measureRef.current = () => gridRef.current?.getRenderedRowHeights() ?? {};
  const gridRef = useRef<IPCRGridHandle>(null);
  // Every cell of the (unfilled) sheet that holds this field's {{token}}.
  const cellsKey = focusKey
    ? grid.data.flatMap((row, y) => row.map((value, x) => typeof value === "string" && value.includes(`{{${focusKey}}}`) ? `${columnName(x)}${y + 1}` : null)).filter((cell): cell is string => !!cell).join("|")
    : "";
  const lastScrolled = useRef("");
  useEffect(() => {
    const cells = cellsKey ? cellsKey.split("|") : [];
    let cancelled = false;
    let frame = 0;
    // The sheet settles its merges over a few frames after it mounts or redraws, so the glow is re-applied for a moment.
    const apply = (count: number) => {
      if (cancelled) return;
      const scroll = count === 0 && cells.length > 0 && lastScrolled.current !== cellsKey;
      gridRef.current?.glowCells(cells, scroll);
      if (scroll) lastScrolled.current = cellsKey;
      if (count < 20) frame = requestAnimationFrame(() => apply(count + 1));
    };
    apply(0);
    if (!cells.length) lastScrolled.current = "";
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [cellsKey, refreshKey]);
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    const apply = (count: number) => {
      if (cancelled) return;
      gridRef.current?.markPickedRow(pickedRow);
      if (count < 20) frame = requestAnimationFrame(() => apply(count + 1));
    };
    apply(0);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [pickedRow, refreshKey]);
  const dropCell = useRef<string | null>(null);
  const cellAt = (event: { clientX: number; clientY: number }) => {
    // Text layers sit over the cells, so look through everything under the pointer for the cell itself.
    const cell = document.elementsFromPoint(event.clientX, event.clientY).map(element => element.closest<HTMLElement>("td[data-x][data-y]")).find(Boolean);
    return cell ? `${columnName(Number(cell.dataset.x))}${Number(cell.dataset.y) + 1}` : null;
  };
  // Same object until the sheet, fields or values really change.
  const filled = useMemo(() => fillGrid(grid, fields, values), [grid, fields, values]);
  const structureKey = useMemo(
    () => JSON.stringify([grid.mergeCells, grid.colWidths, grid.rowHeights, grid.style, grid.data.length, grid.data[0]?.length ?? 0, (grid.images ?? []).length]),
    [grid],
  );
  // What the mounted sheet currently shows, to find which cells to update when the values change.
  const shown = useRef<IPCRGridData["data"]>(filled.data);
  const mountedFor = useRef(structureKey);
  if (mountedFor.current !== structureKey) { mountedFor.current = structureKey; shown.current = filled.data; }
  useEffect(() => {
    const handle = gridRef.current;
    const previous = shown.current;
    if (!handle || previous === filled.data) return;
    filled.data.forEach((row, y) => row.forEach((value, x) => {
      if (previous[y]?.[x] !== value) handle.setCellValue(`${columnName(x)}${y + 1}`, String(value ?? ""));
    }));
    shown.current = filled.data;
  }, [filled]);
  return (
    <div
      className="etm-ipcr-grid-overlay-wrap"
      onDragOver={onDropTask ? event => {
        if (!event.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        const cell = cellAt(event);
        if (cell !== dropCell.current) { dropCell.current = cell; gridRef.current?.markDropCell(cell); }
      } : undefined}
      onDragLeave={onDropTask ? event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { dropCell.current = null; gridRef.current?.markDropCell(null); } } : undefined}
      onDrop={onDropTask ? event => {
        const payload = event.dataTransfer.getData(TASK_DRAG_TYPE);
        if (!payload) return;
        event.preventDefault();
        dropCell.current = null;
        gridRef.current?.markDropCell(null);
        const cell = cellAt(event);
        if (cell) onDropTask(cell, payload);
      } : undefined}
      onDoubleClick={onCellDoubleClick ? event => { const cell = cellAt(event); if (cell) onCellDoubleClick(cell); } : undefined}
      onClick={onCellClick ? event => { const cell = cellAt(event); if (cell) onCellClick(cell); } : undefined}
    >
      <IPCRGrid key={structureKey} ref={gridRef} value={filled} editable={false} contextItems={contextItems} />
      <IPCRGridImageOverlay images={grid.images} editable={false} />
      <IPCRGridRichTextOverlay grid={filled} gridRef={gridRef} refreshKey={refreshKey} />
    </div>
  );
}
