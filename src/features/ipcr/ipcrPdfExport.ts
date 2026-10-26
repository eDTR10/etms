import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import timesFonts from "pdfmake/build/standard-fonts/Times";
import helveticaFonts from "pdfmake/build/standard-fonts/Helvetica";
import courierFonts from "pdfmake/build/standard-fonts/Courier";
import type { Content, PageSize, TableCell } from "pdfmake/interfaces";
import { cellCoords, cellName, parseCellStyle } from "./ipcrGridUtils";
import type { IPCRGridData, IPCROrientation, IPCRPaperSize } from "./types";

(pdfMake as unknown as { vfs: typeof pdfFonts }).vfs = pdfFonts;
// The PDF's built-in Times / Helvetica / Courier, so a template designed in a serif (or monospace)
// face doesn't silently print in Roboto. Registering again is harmless if the import already did it.
const fontRegistry = pdfMake as unknown as { addFontContainer?: (container: unknown) => void };
[timesFonts, helveticaFonts, courierFonts].forEach(container => fontRegistry.addFontContainer?.(container));

// pdfmake accepts either a built-in page-size name or an explicit {width, height}
// in points (72pt/inch) — "long" (8.5x13", the Philippine government/legal-ish
// size used for a lot of DICT paperwork) isn't one of pdfmake's built-ins, so it
// always goes through the explicit-points path; everything else uses the name.
const PDFMAKE_PAGE_SIZE: Record<IPCRPaperSize, PageSize> = {
  a3: "A3", a4: "A4", a5: "A5", letter: "LETTER", legal: "LEGAL", folio: "FOLIO",
  long: { width: 612, height: 936 },
};

// Portrait size of each paper in points, to know how wide the printable area is.
const PAGE_POINTS: Record<IPCRPaperSize, [number, number]> = {
  a3: [841.89, 1190.55], a4: [595.28, 841.89], a5: [419.53, 595.28],
  letter: [612, 792], legal: [612, 1008], folio: [612, 936], long: [612, 936],
};

const PX_TO_PT = 0.75;
// 0.75" on every side — the "Normal" margins of a spreadsheet print.
const PAGE_MARGIN = 54;
// Fallbacks for grids saved before column widths / image origin were recorded.
const DEFAULT_COL_PX = 64;
// A row with no saved height is as tall as the designer draws an ordinary row (about 24px). Without this the empty
// rows above a title collapsed to a text line, so the title slid up under the logos.
const DEFAULT_ROW_PX = 24;
// A cell with no font size is drawn at the sheet's own default (12.5px) on screen, so it is in the PDF too.
const DEFAULT_FONT_PX = 12.5;
const FALLBACK_IMAGE_ORIGIN = { x: 36, y: 12 };

type PdfFont = "Times" | "Helvetica" | "Courier";

// Spreadsheet font names -> the closest face the PDF can print. Palatino, Georgia, Cambria etc. are all
// serifs, so they map to Times; Arial, Calibri and friends map to Helvetica.
function pdfFontFor(family: string | undefined): PdfFont {
  const name = (family ?? "").toLowerCase();
  if (/courier|consolas|mono|menlo/.test(name)) return "Courier";
  if (/times|palatino|pagella|book antiqua|georgia|garamond|cambria|century|bookman|didot|baskerville|serif/.test(name) && !/sans/.test(name)) return "Times";
  return "Helvetica";
}

// Average glyph width as a fraction of the font size — enough to guess how many lines a cell wraps to.
const AVERAGE_GLYPH_EM: Record<PdfFont, number> = { Times: 0.46, Helvetica: 0.52, Courier: 0.6 };

function estimateTextHeight(text: string, fontPt: number, widthPt: number, font: PdfFont, bold: boolean): number {
  const usable = Math.max(8, widthPt - 8);
  const glyph = fontPt * AVERAGE_GLYPH_EM[font] * (bold ? 1.07 : 1);
  const lines = text.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil((line.length * glyph) / usable)), 0);
  return lines * fontPt * 1.2;
}

type Side = "top" | "right" | "bottom" | "left";

export function buildIPCRPdfDocDefinition(grid: IPCRGridData, paperSize: IPCRPaperSize = "a3", orientation: IPCROrientation = "landscape") {
  return layoutIPCRPdf(grid, paperSize, orientation).doc;
}

// The rows that each printed page after the first starts at: the asked-for page breaks plus where a page runs out of room
// (estimated from the row heights, so it can be a row off when text wraps).
export function estimateIPCRPageStarts(grid: IPCRGridData, paperSize: IPCRPaperSize = "a3", orientation: IPCROrientation = "landscape"): number[] {
  return layoutIPCRPdf(grid, paperSize, orientation).pageStarts;
}

function layoutIPCRPdf(
  grid: IPCRGridData,
  paperSize: IPCRPaperSize,
  orientation: IPCROrientation,
) {
  const rowCount = grid.data.length;
  // Empty columns after the last used one only waste width (they shrink the whole sheet to fit the page), so they are left
  // out. Empty ROWS stay: they are the blank lines between blocks. A column is used if a cell in it has text, a border or fill,
  // a merge reaches it, or a picture lies over it.
  const allCols = grid.data[0]?.length ?? 0;
  let colCount = 0;
  grid.data.forEach((line, row) => line.forEach((value, col) => {
    const style = grid.style[cellName(col, row)] ?? "";
    if ((value !== "" && value !== null && value !== undefined) || /border|background/i.test(style)) colCount = Math.max(colCount, col + 1);
  }));
  Object.entries(grid.mergeCells).forEach(([anchor, [colspan]]) => { colCount = Math.max(colCount, cellCoords(anchor).col + colspan); });
  Object.keys(grid.richText ?? {}).forEach(cell => { colCount = Math.max(colCount, cellCoords(cell).col + 1); });
  if (grid.images.length) {
    const imageOriginX = (grid.imageOrigin ?? FALLBACK_IMAGE_ORIGIN).x;
    const imageRight = Math.max(...grid.images.map(image => image.x + image.width)) - imageOriginX;
    let edge = 0;
    for (let col = 0; col < allCols; col++) {
      edge += grid.colWidths[col] ?? DEFAULT_COL_PX;
      if (edge >= imageRight - 1) { colCount = Math.max(colCount, col + 1); break; }
    }
  }
  colCount = Math.min(allCols, Math.max(1, colCount));

  // pdfmake needs an explicit `{}` placeholder for every cell a merge covers (besides the
  // anchor, which carries colSpan/rowSpan) — build that coverage map from jspreadsheet's
  // {anchorCell: [colspan, rowspan]} merge map first.
  const covered = new Set<string>();
  const spans = new Map<string, [number, number]>();
  // A merged block carries its styling (borders included) on its top-left cell only.
  const mergeAnchorOf = new Map<string, string>();
  Object.entries(grid.mergeCells).forEach(([anchor, [colspan, rowspan]]) => {
    if (colspan <= 1 && rowspan <= 1) return;
    spans.set(anchor, [colspan, rowspan]);
    const { col: anchorCol, row: anchorRow } = cellCoords(anchor);
    for (let r = anchorRow; r < anchorRow + rowspan; r++) {
      for (let c = anchorCol; c < anchorCol + colspan; c++) {
        mergeAnchorOf.set(cellName(c, r), anchor);
        if (r === anchorRow && c === anchorCol) continue;
        covered.add(cellName(c, r));
      }
    }
  });

  // ── Borders ────────────────────────────────────────────────────────────────────────────────────
  // Only borders that were actually drawn print (no default gridlines), like printing a spreadsheet.
  // pdfmake takes line WIDTH per whole grid line (hLineWidth/vLineWidth) but lets each cell choose
  // which of its sides to draw (`border`) and in what colour (`borderColor`). So every cell says
  // exactly which sides it draws, and a grid line is as wide as the thickest border on it.
  const parseAt = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= colCount || row >= rowCount) return undefined;
    const name = cellName(col, row);
    return parseCellStyle(grid.style[mergeAnchorOf.get(name) ?? name]);
  };
  const real = (css: string | undefined) => (css && !/transparent|none/i.test(css)) ? css : undefined;
  const ownCss = (col: number, row: number, side: Side) => {
    const parsed = parseAt(col, row);
    return side === "top" ? parsed?.borderTop : side === "bottom" ? parsed?.borderBottom : side === "left" ? parsed?.borderLeft : parsed?.borderRight;
  };
  const FACING: Record<Side, { dc: number; dr: number; side: Side }> = {
    top: { dc: 0, dr: -1, side: "bottom" }, bottom: { dc: 0, dr: 1, side: "top" },
    left: { dc: -1, dr: 0, side: "right" }, right: { dc: 1, dr: 0, side: "left" },
  };
  // The grid keeps one border slot per cell, so a drawn edge may sit on either cell sharing it.
  const sideCss = (col: number, row: number, side: Side) => {
    const facing = FACING[side];
    return real(ownCss(col, row, side)) ?? real(ownCss(col + facing.dc, row + facing.dr, facing.side));
  };

  const hWidth: number[] = new Array(rowCount + 1).fill(0);
  const vWidth: number[] = new Array(colCount + 1).fill(0);
  const cellEdges = new Map<string, Record<Side, string | undefined>>();
  const thickness = (css: string) => (parseFloat(css) || 1) >= 2 ? 1.5 : 0.75;
  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
      const name = cellName(col, row);
      if (covered.has(name)) continue;
      const [colspan, rowspan] = spans.get(name) ?? [1, 1];
      // A merged block's edge is the first drawn border found along that side of the block.
      const along = (cells: [number, number][], side: Side) => cells.map(([c, r]) => sideCss(c, r, side)).find(Boolean);
      const across = Array.from({ length: colspan }, (_, i) => col + i);
      const down = Array.from({ length: rowspan }, (_, i) => row + i);
      const edges: Record<Side, string | undefined> = {
        top: along(across.map(c => [c, row] as [number, number]), "top"),
        bottom: along(across.map(c => [c, row + rowspan - 1] as [number, number]), "bottom"),
        left: along(down.map(r => [col, r] as [number, number]), "left"),
        right: along(down.map(r => [col + colspan - 1, r] as [number, number]), "right"),
      };
      cellEdges.set(name, edges);
      if (edges.top) hWidth[row] = Math.max(hWidth[row], thickness(edges.top));
      if (edges.bottom) hWidth[row + rowspan] = Math.max(hWidth[row + rowspan], thickness(edges.bottom));
      if (edges.left) vWidth[col] = Math.max(vWidth[col], thickness(edges.left));
      if (edges.right) vWidth[col + colspan] = Math.max(vWidth[col + colspan], thickness(edges.right));
    }
  }
  const colorOf = (css: string | undefined) => css?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#000000";

  // ── Page fit ───────────────────────────────────────────────────────────────────────────────────
  // Column widths follow the designed sheet, shrunk (or modestly grown) so every column fits the page's
  // width — like Excel's "fit all columns on one page". The same factor scales row heights, fonts and
  // padding so the whole sheet keeps its proportions.
  const [portraitWidth, portraitHeight] = PAGE_POINTS[paperSize] ?? PAGE_POINTS.a3;
  const pageWidth = orientation === "landscape" ? portraitHeight : portraitWidth;
  const colPts = Array.from({ length: colCount }, (_, col) => (grid.colWidths[col] ?? DEFAULT_COL_PX) * PX_TO_PT);
  const sheetWidth = colPts.reduce((sum, width) => sum + width, 0) || 1;
  const scale = Math.min(1.25, (pageWidth - PAGE_MARGIN * 2) / sheetWidth);
  // pdfmake adds a cell's padding and the grid lines ON TOP of the width/height given for it, so each
  // cell's full footprint (what has to add up to the page) is the designed size and its content area is
  // that minus those extras. Without this the table came out ~15% wider than the page and ran off the edge.
  const padX = 3 * scale;
  const padY = 2 * scale;
  const lineAcross = vWidth.reduce((sum, width) => sum + width, 0) / Math.max(1, colCount);
  const lineDown = hWidth.reduce((sum, width) => sum + width, 0) / Math.max(1, rowCount);
  const footprintWidths = colPts.map(width => width * scale);
  const widths = footprintWidths.map(width => Math.max(4, width - 2 * padX - lineAcross));
  const rowFootprint = (row: number) => ((grid.rowHeights?.[row] || 0) > 0 ? grid.rowHeights![row] : DEFAULT_ROW_PX) * PX_TO_PT * scale;
  const rowPt = (row: number) => Math.max(0, rowFootprint(row) - 2 * padY - lineDown);

  const body: TableCell[][] = [];
  for (let row = 0; row < rowCount; row++) {
    const line: TableCell[] = [];
    for (let col = 0; col < colCount; col++) {
      const name = cellName(col, row);
      // pdfmake requires the cells a merge covers to be bare `{}` placeholders.
      if (covered.has(name)) { line.push({}); continue; }
      const value = grid.data[row][col];
      const parsed = parseCellStyle(grid.style[name]);
      const span = spans.get(name);
      const runs = grid.richText?.[name];
      const font = pdfFontFor(parsed.fontFamily);
      const fontPt = (parsed.fontSize ?? DEFAULT_FONT_PX) * PX_TO_PT * scale;
      const text = value === "" || value === null || value === undefined ? "" : String(value);
      const plain = runs && runs.length ? runs.map(run => run.text).join("") : text;
      const edges = cellEdges.get(name)!;

      const cell: TableCell = {
        // A richText cell (mixed bold/underline within its own sentence, e.g. "I, NAME, TITLE
        // of OFFICE, commit to...") renders as an array of inline runs instead of one plain
        // string — pdfmake treats an array `text` as inline spans in the same paragraph.
        text: runs && runs.length
          ? (runs.map(run => ({ text: run.text, bold: run.bold || undefined, italics: run.italic || undefined, decoration: run.underline || run.link ? "underline" : undefined, link: run.link, color: run.link ? "#0563c1" : undefined })) as Content)
          : (text === "" ? " " : text),
        bold: runs ? undefined : (parsed.bold || undefined),
        italics: runs ? undefined : (parsed.italic || undefined),
        decoration: runs ? undefined : (parsed.underline ? "underline" : undefined),
        color: parsed.color,
        fillColor: parsed.backgroundColor && parsed.backgroundColor !== "transparent" ? parsed.backgroundColor : undefined,
        alignment: parsed.align,
        font,
        // The grid's own fontSize is CSS px (screen/xlsx); PDF points are 0.75x that (96px/72pt per inch).
        fontSize: fontPt,
        border: [!!edges.left, !!edges.top, !!edges.right, !!edges.bottom],
        borderColor: [colorOf(edges.left), colorOf(edges.top), colorOf(edges.right), colorOf(edges.bottom)],
      };

      // pdfmake can't vertically align a cell, so "middle"/"bottom" is imitated by pushing the text down
      // by the spare height — an estimate (it guesses the line count), but it matches the designer closely.
      // A cell with no vertical alignment is centred on screen (the browser default for a table cell), so it is here too.
      const valign = parsed.valign ?? "middle";
      if (valign === "middle" || valign === "bottom") {
        const spanCols = span ? span[0] : 1;
        const spanRows = span ? span[1] : 1;
        let cellWidth = 0;
        for (let c = col; c < col + spanCols; c++) cellWidth += footprintWidths[c] ?? 0;
        let cellHeight = 0;
        for (let r = row; r < row + spanRows; r++) cellHeight += rowFootprint(r);
        const spare = cellHeight - estimateTextHeight(plain, fontPt, cellWidth, font, !!(parsed.bold || runs?.some(run => run.bold))) - 6 * scale;
        if (spare > 0) cell.margin = [0, valign === "middle" ? spare / 2 : spare, 0, 0];
      }
      if (span) { cell.colSpan = span[0]; cell.rowSpan = span[1]; }
      line.push(cell);
    }
    body.push(line);
  }

  // Images are positioned in on-screen px from the wrapper around the grid; move that origin onto the
  // table's top-left and apply the same scale as everything else.
  const origin = grid.imageOrigin ?? FALLBACK_IMAGE_ORIGIN;
  // Where the sheet is cut into pages: asked-for breaks, except ones a merged cell runs across.
  const crossesMerge = (row: number) => Object.entries(grid.mergeCells).some(([anchor, [, rowspan]]) => { const top = cellCoords(anchor).row; return top < row && top + rowspan > row; });
  const cuts = Array.from(new Set(grid.pageBreaks ?? [])).filter(row => row > 0 && row < rowCount && !crossesMerge(row)).sort((a, b) => a - b);
  const segments: [number, number][] = [];
  let from = 0;
  cuts.forEach(cut => { segments.push([from, cut]); from = cut; });
  segments.push([from, rowCount]);
  const pageHeight = orientation === "landscape" ? portraitWidth : portraitHeight;
  const capacity = pageHeight - PAGE_MARGIN * 2;
  const pageStarts: number[] = [];
  segments.forEach(([start, end], index) => {
    if (index > 0) pageStarts.push(start);
    let used = 0;
    for (let row = start; row < end; row++) {
      const height = rowFootprint(row);
      if (used > 0 && used + height > capacity) { pageStarts.push(row); used = 0; }
      used += height;
    }
  });
  const doc = {
    pageSize: PDFMAKE_PAGE_SIZE[paperSize] ?? "A3",
    pageOrientation: orientation,
    pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN] as [number, number, number, number],
    // One table per printed "chunk": the sheet is cut where the person asked for a new page, and a row is never split
    // across two pages (it moves whole to the next one).
    content: segments.map(([start, end], index) => ({
      ...(index > 0 ? { pageBreak: "before" as const } : {}),
      table: {
        headerRows: 0,
        widths,
        dontBreakRows: true,
        // A row is at least as tall as in the designer (and grows if its text needs more room).
        heights: (row: number) => rowPt(start + row),
        body: body.slice(start, end),
      },
      layout: {
        defaultBorder: false,
        hLineWidth: (i: number) => hWidth[start + i] ?? 0,
        vLineWidth: (i: number) => vWidth[i] ?? 0,
        paddingLeft: () => padX, paddingRight: () => padX, paddingTop: () => padY, paddingBottom: () => padY,
      },
    })),
    // Pictures are positioned over the top of the sheet, so they go on page 1 as a page background. Placing them
    // in the content (after the table) put them on whichever page the table happened to END on.
    background: (currentPage: number) => currentPage === 1 && grid.images.length
      ? grid.images.map(image => ({
        image: image.dataUrl,
        width: image.width * PX_TO_PT * scale,
        height: image.height * PX_TO_PT * scale,
        absolutePosition: {
          x: PAGE_MARGIN + (image.x - origin.x) * PX_TO_PT * scale,
          y: PAGE_MARGIN + (image.y - origin.y) * PX_TO_PT * scale,
        },
      }))
      : null,
    defaultStyle: { fontSize: 8 * scale, font: "Helvetica" as PdfFont },
  };
  return { doc, pageStarts };
}

// Opens the finished document as a PDF in a new tab, ready to print or save. It deliberately does NOT pop the browser's
// print dialog by itself: that dialog starts on the computer's default printer, and when that printer is offline or on
// a network it hangs on "waiting for printer connection". The PDF viewer's own Print / Download buttons are one click away,
// and the dialog there can be pointed at "Save as PDF" without anything waiting on a printer first.
export function printIPCRPdf(
  grid: IPCRGridData,
  paperSize: IPCRPaperSize = "a3",
  orientation: IPCROrientation = "landscape",
) {
  // Opened straight away, inside the click / keypress, so the browser's pop-up blocker lets it through.
  const tab = window.open("", "_blank");
  void pdfMake.createPdf(buildIPCRPdfDocDefinition(grid, paperSize, orientation)).getBlob().then(blob => {
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url; else window.open(url, "_blank");
  });
}

// The finished PDF as a file in memory (for showing it inside the page instead of opening it).
export function buildIPCRPdfBlob(grid: IPCRGridData, paperSize: IPCRPaperSize = "a3", orientation: IPCROrientation = "landscape"): Promise<Blob> {
  return pdfMake.createPdf(buildIPCRPdfDocDefinition(grid, paperSize, orientation)).getBlob();
}

export function downloadIPCRPdf(
  grid: IPCRGridData,
  filename: string,
  paperSize: IPCRPaperSize = "a3",
  orientation: IPCROrientation = "landscape",
) {
  pdfMake.createPdf(buildIPCRPdfDocDefinition(grid, paperSize, orientation)).download(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}