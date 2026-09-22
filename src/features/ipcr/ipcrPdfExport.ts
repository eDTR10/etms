import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TableCell } from "pdfmake/interfaces";
import { cellName, parseCellStyle } from "./ipcrGridUtils";
import type { IPCRGridData } from "./types";

(pdfMake as unknown as { vfs: typeof pdfFonts }).vfs = pdfFonts;

export function buildIPCRPdfDocDefinition(grid: IPCRGridData) {
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
      const cell: TableCell = {
        text: value === "" || value === null || value === undefined ? " " : String(value),
        bold: parsed.bold || undefined,
        italics: parsed.italic || undefined,
        decoration: parsed.underline ? "underline" : undefined,
        color: parsed.color,
        fillColor: parsed.backgroundColor,
        alignment: parsed.align,
        fontSize: 8,
      };
      if (span) { cell.colSpan = span[0]; cell.rowSpan = span[1]; }
      line.push(cell);
    }
    body.push(line);
  }

  return {
    pageSize: "A3" as const,
    pageOrientation: "landscape" as const,
    pageMargins: [24, 24, 24, 24] as [number, number, number, number],
    content: [
      {
        table: { headerRows: 0, widths: Array(colCount).fill("*"), body },
        layout: { defaultBorder: true, hLineColor: () => "#9a9a9a", vLineColor: () => "#9a9a9a", paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3 },
      },
    ],
    defaultStyle: { fontSize: 8 },
  };
}

export function downloadIPCRPdf(grid: IPCRGridData, filename: string) {
  pdfMake.createPdf(buildIPCRPdfDocDefinition(grid)).download(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
