import { useEffect, useState } from "react";
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
function computeSize(grid: IPCRGridData, cell: string): { width: number; height: number } {
  const { col, row } = cellCoords(cell);
  const merge = grid.mergeCells[cell];
  if (!merge) return { width: grid.colWidths[col] ?? DEFAULT_COL_WIDTH, height: grid.rowHeights?.[row] ?? DEFAULT_ROW_HEIGHT };
  const [colspan, rowspan] = merge;
  let width = 0;
  for (let c = col; c < col + colspan; c++) width += grid.colWidths[c] ?? DEFAULT_COL_WIDTH;
  let height = 0;
  for (let r = row; r < row + rowspan; r++) height += grid.rowHeights?.[r] ?? DEFAULT_ROW_HEIGHT;
  return { width, height };
}

// Draws the mixed-formatting (per-run bold/italic/underline) content of richText cells exactly
// over their plain-text jspreadsheet cell — the grid itself only supports one uniform style per
// cell, so a cell like "I, NAME, TITLE of OFFICE, commit to..." (only NAME/TITLE/OFFICE bold+
// underlined) can't be rendered by the grid alone. Each overlay div gets an opaque background
// matching the cell's own fill so it fully masks the plain rendering underneath rather than
// visually doubling it.
export default function IPCRGridRichTextOverlay({ grid, gridRef, refreshKey }: IPCRGridRichTextOverlayProps) {
  const cells = Object.keys(grid.richText ?? {});
  const cellsKey = cells.join("|");
  const [rects, setRects] = useState<Record<string, IPCRGridCellRect>>({});

  useEffect(() => {
    const handle = gridRef.current;
    if (!handle || !cells.length) { setRects({}); return; }
    const compute = () => {
      const next: Record<string, IPCRGridCellRect> = {};
      cells.forEach(cell => {
        const rect = handle.getCellRect(cell);
        if (rect) next[cell] = rect;
      });
      setRects(next);
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
    return () => { cancelled = true; cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridRef, refreshKey, cellsKey]);

  if (!cells.length) return null;

  return (
    <div className="etm-ipcr-richtext-overlay">
      {cells.map(cell => {
        const rect = rects[cell];
        const runs = grid.richText?.[cell];
        if (!rect || !runs) return null;
        const parsed = parseCellStyle(grid.style[cell]);
        const size = computeSize(grid, cell);
        return (
          <div
            key={cell}
            className="etm-ipcr-richtext-cell"
            style={{
              left: rect.left,
              top: rect.top,
              width: size.width,
              // Height is a floor, not a fixed size: rows auto-expand to fit wrapped content in
              // jspreadsheet, but the grid's own *stored* row height (from the source .xlsx)
              // doesn't know how tall a row needs to be once its text actually wraps at this
              // width — using it as a hard height clipped most of a long wrapped sentence down
              // to a sliver. Auto-height lets this box grow to fit its own (same) text instead.
              minHeight: size.height,
              backgroundColor: parsed.backgroundColor || "#fff",
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
                fontFamily: parsed.fontFamily || undefined,
                fontSize: parsed.fontSize ? `${parsed.fontSize}px` : undefined,
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
