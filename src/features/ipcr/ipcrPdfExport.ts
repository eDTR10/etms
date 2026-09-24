import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { Content, PageSize, TableCell } from "pdfmake/interfaces";
import { cellName, parseCellStyle } from "./ipcrGridUtils";
import type { IPCRGridData, IPCROrientation, IPCRPaperSize } from "./types";

(pdfMake as unknown as { vfs: typeof pdfFonts }).vfs = pdfFonts;

// pdfmake accepts either a built-in page-size name or an explicit {width, height}
// in points (72pt/inch) — "long" (8.5x13", the Philippine government/legal-ish
// size used for a lot of DICT paperwork) isn't one of pdfmake's built-ins, so it
// always goes through the explicit-points path; everything else uses the name.
const PDFMAKE_PAGE_SIZE: Record<IPCRPaperSize, PageSize> = {
  a3: "A3", a4: "A4", a5: "A5", letter: "LETTER", legal: "LEGAL", folio: "FOLIO",
  long: { width: 612, height: 936 },
};

// pdfmake's per-line width callbacks (hLineWidth/vLineWidth) apply to a whole line at once —
// there's no per-cell-segment width, only per-cell-segment COLOR (hLineColor/vLineColor do take
// a column/row too). So an explicit border from the source is approximated as: use the widest
// width any cell along that line asked for (thin vs. thick/double), and let color vary per
// segment. Lines with no explicit border anywhere keep the existing uniform thin gray default.
function buildBorderLineMaps(grid: IPCRGridData, rowCount: number, colCount: number) {
  const DEFAULT_WIDTH = 0.75;
  const DEFAULT_COLOR = "#9a9a9a";
  const hWidth = new Array(rowCount + 1).fill(DEFAULT_WIDTH);
  const vWidth = new Array(colCount + 1).fill(DEFAULT_WIDTH);
  const hColor = new Map<string, string>();
  const vColor = new Map<string, string>();

  const apply = (cssBorder: string | undefined, widths: number[], colors: Map<string, string>, lineIndex: number, segmentIndex: number) => {
    if (!cssBorder) return;
    const px = parseFloat(cssBorder) || 1;
    widths[lineIndex] = Math.max(widths[lineIndex], px >= 2 ? 1.5 : 0.75);
    const colorMatch = cssBorder.match(/#[0-9a-fA-F]{6}/);
    colors.set(`${lineIndex}:${segmentIndex}`, colorMatch ? colorMatch[0] : "#000000");
  };

  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
      const parsed = parseCellStyle(grid.style[cellName(col, row)]);
      apply(parsed.borderTop, hWidth, hColor, row, col);
      apply(parsed.borderBottom, hWidth, hColor, row + 1, col);
      apply(parsed.borderLeft, vWidth, vColor, col, row);
      apply(parsed.borderRight, vWidth, vColor, col + 1, row);
    }
  }
  return { hWidth, vWidth, hColor, vColor, DEFAULT_COLOR };
}

export function buildIPCRPdfDocDefinition(
  grid: IPCRGridData,
  paperSize: IPCRPaperSize = "a3",
  orientation: IPCROrientation = "landscape",
) {
  const rowCount = grid.data.length;
  const colCount = grid.data[0]?.length ?? 0;

  // pdfmake needs an explicit `{}` placeholder for every cell a merge covers (besides the
  // anchor, which carries colSpan/rowSpan) — build that coverage map from jspreadsheet's
  // {anchorCell: [colspan, rowspan]} merge map first.
  const covered = new Set<string>();
  const spans = new Map<string, [number, number]>();
  Object.entries(grid.mergeCells).forEach(([anchor, [colspan, rowspan]]) => {
    if (colspan <= 1 && rowspan <= 1) return;
    spans.set(anchor, [colspan, rowspan]);
    const match = anchor.match(/^([A-Z]+)(\d+)$/);
    if (!match) return;
    let anchorCol = 0;
    for (const char of match[1]) anchorCol = anchorCol * 26 + (char.charCodeAt(0) - 64);
    anchorCol -= 1;
    const anchorRow = Number(match[2]) - 1;
    for (let r = anchorRow; r < anchorRow + rowspan; r++) {
      for (let c = anchorCol; c < anchorCol + colspan; c++) {
        if (r === anchorRow && c === anchorCol) continue;
        covered.add(cellName(c, r));
      }
    }
  });

  const body: TableCell[][] = [];
  for (let row = 0; row < rowCount; row++) {
    const line: TableCell[] = [];
    for (let col = 0; col < colCount; col++) {
      const name = cellName(col, row);
      if (covered.has(name)) { line.push({}); continue; }
      const value = grid.data[row][col];
      const parsed = parseCellStyle(grid.style[name]);
      const span = spans.get(name);
      const runs = grid.richText?.[name];
      const cell: TableCell = {
        // A richText cell (mixed bold/underline within its own sentence, e.g. "I, NAME, TITLE
        // of OFFICE, commit to...") renders as an array of inline runs instead of one plain
        // string — pdfmake treats an array `text` as inline spans in the same paragraph.
        text: runs && runs.length
          ? (runs.map(run => ({ text: run.text, bold: run.bold || undefined, italics: run.italic || undefined, decoration: run.underline ? "underline" : undefined })) as Content)
          : (value === "" || value === null || value === undefined ? " " : String(value)),
        bold: runs ? undefined : (parsed.bold || undefined),
        italics: runs ? undefined : (parsed.italic || undefined),
        decoration: runs ? undefined : (parsed.underline ? "underline" : undefined),
        color: parsed.color,
        fillColor: parsed.backgroundColor,
        alignment: parsed.align,
        // The grid's own fontSize is CSS px (screen/xlsx); PDF points are 0.75x that (96px/72pt
        // per inch). Font FAMILY isn't carried over — pdfmake only renders fonts it has
        // registered (Roboto by default), so an arbitrary family name would just be ignored or
        // error rather than degrade gracefully.
        fontSize: parsed.fontSize ? parsed.fontSize * 0.75 : 8,
      };
      if (span) { cell.colSpan = span[0]; cell.rowSpan = span[1]; }
      line.push(cell);
    }
    body.push(line);
  }

  const { hWidth, vWidth, hColor, vColor, DEFAULT_COLOR } = buildBorderLineMaps(grid, rowCount, colCount);

  const pageMargin = 24;
  return {
    pageSize: PDFMAKE_PAGE_SIZE[paperSize] ?? "A3",
    pageOrientation: orientation,
    pageMargins: [pageMargin, pageMargin, pageMargin, pageMargin] as [number, number, number, number],
    content: [
      {
        table: { headerRows: 0, widths: Array(colCount).fill("*"), body },
        layout: {
          defaultBorder: true,
          hLineWidth: (i: number) => hWidth[i] ?? 0.75,
          vLineWidth: (i: number) => vWidth[i] ?? 0.75,
          hLineColor: (i: number, _node: unknown, col: number) => hColor.get(`${i}:${col}`) ?? DEFAULT_COLOR,
          vLineColor: (i: number, _node: unknown, row: number) => vColor.get(`${i}:${row}`) ?? DEFAULT_COLOR,
          paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3,
        },
      },
      ...grid.images.map(image => ({
        image: image.dataUrl,
        width: image.width,
        height: image.height,
        absolutePosition: { x: pageMargin + image.x, y: pageMargin + image.y },
      })),
    ],
    defaultStyle: { fontSize: 8 },
  };
}

export function downloadIPCRPdf(
  grid: IPCRGridData,
  filename: string,
  paperSize: IPCRPaperSize = "a3",
  orientation: IPCROrientation = "landscape",
) {
  pdfMake.createPdf(buildIPCRPdfDocDefinition(grid, paperSize, orientation)).download(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
