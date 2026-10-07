import { useEffect, useId, useRef, useState } from "react";
import { cellCoords, parseCellStyle, runsToHtml } from "./ipcrGridUtils";
import type { IPCRGridCellRect, IPCRGridHandle } from "./IPCRGrid";
import type { IPCRGridData } from "./types";

interface IPCRGridRichTextOverlayProps {
  grid: IPCRGridData;
  gridRef: React.RefObject<IPCRGridHandle | null>;
  // Bump whenever the grid's own layout could have shifted (zoom, row/col insert-delete,
  // remount) — cell rects are read straight off the live DOM (see IPCRGrid.getCellRect), so a
  // recompute pass is all that's needed to keep these aligned.
  refreshKey: number | string;
  // Make a row taller when the text drawn for its cell needs more room (like auto-fit in a spreadsheet), so a long
  // list never spills over the cells below. Off for read-only previews, which must not change the sheet.
  autoFitRows?: boolean;
}

// jspreadsheet-ce's default column width / row height when a cell has no explicit one — used
// as a fallback when summing a merge's span (see computeSize below).
const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 24;

// A merged cell's own <td> doesn't reliably report its full spanned width/height through
// getBoundingClientRect() (confirmed: a 15-column merge measured back as its single anchor
// column's width, no matter how long the position-measurement retry ran — this isn't a timing
// issue, the DOM measurement itself isn't trustworthy for merge size). Width/height are instead
// summed directly from the grid's own known colWidths/rowHeights across the merge's span — data
// we already have and trust (it's what was used to build the merge in the first place) — while
// the anchor's live top-left position (unaffected by merge sizing) still comes from the DOM.
function computeSize(grid: IPCRGridData, cell: string, live?: { colWidths: Record<number, number>; rowHeights: Record<number, number> }): { width: number; height: number } {
  const colWidths = live?.colWidths ?? grid.colWidths;
  const rowHeights = live?.rowHeights ?? grid.rowHeights;
  const { col, row } = cellCoords(cell);
  const merge = grid.mergeCells[cell];
  if (!merge) return { width: colWidths[col] ?? DEFAULT_COL_WIDTH, height: rowHeights?.[row] ?? DEFAULT_ROW_HEIGHT };
  const [colspan, rowspan] = merge;
  let width = 0;
  for (let c = col; c < col + colspan; c++) width += colWidths[c] ?? DEFAULT_COL_WIDTH;
  let height = 0;
  for (let r = row; r < row + rowspan; r++) height += rowHeights?.[r] ?? DEFAULT_ROW_HEIGHT;
  return { width, height };
}

// Draws the mixed-formatting (per-run bold/italic/underline) content of richText cells exactly
// over their plain-text jspreadsheet cell — the grid itself only supports one uniform style per
// cell, so a cell like "I, NAME, TITLE of OFFICE, commit to..." (only NAME/TITLE/OFFICE bold+
// underlined) can't be rendered by the grid alone. Each overlay div gets an opaque background
// matching the cell's own fill so it fully masks the plain rendering underneath rather than
// visually doubling it.
export default function IPCRGridRichTextOverlay({ grid, gridRef, refreshKey, autoFitRows = false }: IPCRGridRichTextOverlayProps) {
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fitted = useRef<Record<number, number>>({});
  const [fitTick, setFitTick] = useState(0);
  const owner = useId();
  const cells = Object.keys(grid.richText ?? {});
  const cellsKey = cells.join("|");
  const [rects, setRects] = useState<Record<string, IPCRGridCellRect>>({});
  // Sizes from the grid's LIVE column widths / row heights, so a resize drag is reflected here too.
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
  // Each cell's style string right now and the font it is really drawn in. `grid.style` is only the sheet as it
  // was loaded, so an alignment / font change made afterwards (or a font the cell never had set) was ignored.
  const [live, setLive] = useState<Record<string, { style: string; family: string; size: string }>>({});

  useEffect(() => {
    const handle = gridRef.current;
    if (!handle || !cells.length) { handle?.markOverlayCells(owner, []); setRects({}); setSizes({}); setLive({}); return; }
    const compute = () => {
      const next: Record<string, IPCRGridCellRect> = {};
      const nextSizes: Record<string, { width: number; height: number }> = {};
      const nextLive: Record<string, { style: string; family: string; size: string }> = {};
      const layout = handle.getLayout();
      handle.markOverlayCells(owner, cells);
      cells.forEach(cell => {
        const rect = handle.getCellRect(cell);
        if (rect) next[cell] = rect;
        nextSizes[cell] = computeSize(grid, cell, layout);
        const font = handle.getCellFont(cell);
        nextLive[cell] = { style: handle.getCellStyle(cell), family: font?.family ?? "", size: font?.size ?? "" };
      });
      setRects(next);
      setSizes(nextSizes);
      setLive(nextLive);
    };
    compute();
    // Merges apply asynchronously, one at a time, a frame after the grid mounts (see IPCRGrid) —
    // on a sheet with 200+ merges that can take several frames of real browser work to fully
    // settle, not just one. A single follow-up pass wasn't enough (cells were caught mid-merge,
    // rendering with their pre-merge, single-column width). Keep recomputing every frame for
    // about half a second, which comfortably covers that settling window, then stop.
    let frame = 0;
    let cancelled = false;
    const tick = (count: number) => {
      if (cancelled) return;
      compute();
      if (count < 30) frame = requestAnimationFrame(() => tick(count + 1));
    };
    frame = requestAnimationFrame(() => tick(0));

    // While a column/row edge is being dragged the grid resizes live but fires no event until the
    // button is released — follow the pointer so this layer resizes in step instead of jumping at the end.
    let pending = 0;
    const onPointerMove = (event: MouseEvent) => {
      if (event.buttons !== 1 || pending) return;
      pending = requestAnimationFrame(() => { pending = 0; compute(); });
    };
    window.addEventListener("mousemove", onPointerMove);
    return () => {
      gridRef.current?.markOverlayCells(owner, []);
      cancelled = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(pending);
      window.removeEventListener("mousemove", onPointerMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridRef, refreshKey, cellsKey, fitTick]);

  // After the text has been laid out, give any row whose text needs more height exactly that much.
  useEffect(() => {
    const handle = gridRef.current;
    if (!autoFitRows || !handle) return;
    const wanted = new Map<number, number>();
    cells.forEach(cell => {
      const element = itemRefs.current[cell];
      const rect = rects[cell];
      if (!element || !rect) return;
      const needed = element.offsetHeight + 2;
      const { row } = cellCoords(cell);
      const merge = grid.mergeCells[cell];
      const available = merge ? sizes[cell]?.height ?? rect.height : rect.height;
      if (needed > available + 1) {
        // A merged block grows by adding to its last row; a plain cell grows its own row.
        const targetRow = merge ? row + merge[1] - 1 : row;
        const target = merge ? (handle.getLayout().rowHeights[targetRow] ?? DEFAULT_ROW_HEIGHT) + (needed - available) : needed;
        // The same target twice means the grid would not take it: stop rather than retry forever.
        if (fitted.current[targetRow] === Math.ceil(target)) return;
        wanted.set(targetRow, Math.max(wanted.get(targetRow) ?? 0, target));
      }
    });
    if (!wanted.size) return;
    wanted.forEach((height, row) => { fitted.current[row] = Math.ceil(height); handle.setRowHeight(row, height); });
    // Rows moved, so everything drawn over them has to be measured again.
    setFitTick(tick => tick + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rects, sizes, live, autoFitRows, cellsKey]);

  if (!cells.length) return null;

  return (
    <div className="etm-ipcr-richtext-overlay">
      {cells.map(cell => {
        const rect = rects[cell];
        const runs = grid.richText?.[cell];
        if (!rect || !runs) return null;
        const parsed = parseCellStyle(live[cell]?.style ?? grid.style[cell]);
        const size = sizes[cell] ?? computeSize(grid, cell);
        return (
          <div
            key={cell}
            ref={element => { itemRefs.current[cell] = element; }}
            className="etm-ipcr-richtext-cell"
            style={{
              // Inset by 1px on every side so the opaque cover leaves the cell's own border (and the
              // grid line around it) visible instead of painting over it.
              left: rect.left + 1,
              top: rect.top + 1,
              width: Math.max(0, size.width - 2),
              // Height is a floor, not a fixed size: rows auto-expand to fit wrapped content in
              // jspreadsheet, but the grid's own *stored* row height (from the source .xlsx)
              // doesn't know how tall a row needs to be once its text actually wraps at this
              // width — using it as a hard height clipped most of a long wrapped sentence down
              // to a sliver. Auto-height lets this box grow to fit its own (same) text instead.
              // A plain cell's rendered height is trustworthy (rows grow to fit wrapped text, e.g. a
              // grouped task dropped into a narrow column) — use it so the cover layer never ends
              // short and lets the cell's own plain text show through underneath. Merged cells'
              // measured height isn't reliable (see computeSize), so they keep the summed one.
              minHeight: Math.max(0, (grid.mergeCells[cell] ? size.height : Math.max(size.height, rect.height)) - 2),
              justifyContent: parsed.valign === "middle" ? "center" : parsed.valign === "bottom" ? "flex-end" : "flex-start",
            }}
          >
            {/* The rich text's mixed text nodes + <b>/<u> elements must NOT be direct children
                of the flex container above: in flexbox, every direct child — including bare
                text nodes — becomes its own flex item, and in a column-direction flex container
                each item gets its own line, which is exactly why "I,", "IAN NICO M. CAULIN",
                "INFORMATION SYSTEMS ANALYST III", etc. were each rendering on a separate line
                instead of flowing together as one wrapped sentence. This inner (non-flex) span
                is the single flex item; the actual rich text flows normally inside it. */}
            <span
              style={{
                textAlign: parsed.align ?? "left",
                fontFamily: parsed.fontFamily || live[cell]?.family || undefined,
                fontSize: parsed.fontSize ? `${parsed.fontSize}px` : (live[cell]?.size || undefined),
                color: parsed.color || undefined,
              }}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: runsToHtml(runs) }}
            />
          </div>
        );
      })}
    </div>
  );
}
