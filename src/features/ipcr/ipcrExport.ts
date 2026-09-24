import ExcelJS from "exceljs";
import { argbToHex, borderSideToCss, buildCellStyleString, cellCoords, cellName, cssBorderToExcelSide, hexToArgb, parseCellStyle, runsNeedRichText } from "./ipcrGridUtils";
import { emptyGrid, type IPCRGridData, type IPCRRichTextRun } from "./types";

// Excel/exceljs row heights are in points (1/72in); the grid's own rowHeights (like its
// colWidths) are plain on-screen CSS pixels — 96 CSS px/in makes the conversion 4/3.
const POINTS_PER_PIXEL = 3 / 4;
const PIXELS_PER_POINT = 4 / 3;

function writeGridToSheet(sheet: ExcelJS.Worksheet, workbook: ExcelJS.Workbook, grid: IPCRGridData) {
  const colCount = grid.data[0]?.length ?? 0;
  for (let col = 0; col < colCount; col++) {
    sheet.getColumn(col + 1).width = (grid.colWidths[col] ?? 100) / 7;
  }
  Object.entries(grid.rowHeights ?? {}).forEach(([row, height]) => {
    sheet.getRow(Number(row) + 1).height = height * POINTS_PER_PIXEL;
  });

  grid.data.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const cell = sheet.getCell(rowIndex + 1, colIndex + 1);
      const runs = grid.richText?.[cellName(colIndex, rowIndex)];
      if (runs && runs.length) {
        cell.value = { richText: runs.map(run => ({ text: run.text, font: { bold: run.bold || undefined, italic: run.italic || undefined, underline: run.underline || undefined } })) };
      } else {
        cell.value = value === "" ? null : value;
      }
      const parsed = parseCellStyle(grid.style[cellName(colIndex, rowIndex)]);
      cell.font = {
        bold: parsed.bold || undefined,
        italic: parsed.italic || undefined,
        underline: parsed.underline || undefined,
        color: parsed.color ? { argb: hexToArgb(parsed.color) ?? undefined } : undefined,
        name: parsed.fontFamily || undefined,
        size: parsed.fontSize || undefined,
      };
      if (parsed.backgroundColor) {
        const argb = hexToArgb(parsed.backgroundColor);
        if (argb) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      }
      cell.alignment = { horizontal: parsed.align, vertical: parsed.valign ?? "top", wrapText: true };
      // Use the cell's own border where the grid actually has one (from an .xlsx import, or
      // drawn with the Borders toolbar button) — falling back to a thin gray gridline so cells
      // with no explicit border still print with a visible grid, same as before this existed.
      const DEFAULT_BORDER = { style: "thin" as const, color: { argb: "FFB0B0B0" } };
      cell.border = {
        top: cssBorderToExcelSide(parsed.borderTop) ?? DEFAULT_BORDER,
        bottom: cssBorderToExcelSide(parsed.borderBottom) ?? DEFAULT_BORDER,
        left: cssBorderToExcelSide(parsed.borderLeft) ?? DEFAULT_BORDER,
        right: cssBorderToExcelSide(parsed.borderRight) ?? DEFAULT_BORDER,
      };
    });
  });

  Object.entries(grid.mergeCells).forEach(([anchor, [colspan, rowspan]]) => {
    if (colspan <= 1 && rowspan <= 1) return;
    const { col, row } = cellCoords(anchor);
    sheet.mergeCells(row + 1, col + 1, row + rowspan, col + colspan);
  });

  // Approximate placement only — the overlay's on-screen x/y is in pixels against whatever
  // column widths/row heights were in effect, which Excel's column-index anchoring can't
  // reproduce exactly. Close enough for a corner logo.
  const AVG_COL_WIDTH_PX = 70;
  const AVG_ROW_HEIGHT_PX = 20;
  grid.images.forEach(image => {
    const match = image.dataUrl.match(/^data:image\/(png|jpe?g|gif);base64,/);
    if (!match) return;
    const extension = match[1] === "jpg" ? "jpeg" : (match[1] as "png" | "jpeg" | "gif");
    const imageId = workbook.addImage({ base64: image.dataUrl, extension });
    sheet.addImage(imageId, {
      tl: { col: image.x / AVG_COL_WIDTH_PX, row: image.y / AVG_ROW_HEIGHT_PX },
      ext: { width: image.width, height: image.height },
    });
  });
}

export async function buildIPCRWorkbook(grid: IPCRGridData, sheetName?: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName ?? grid.sheetName ?? "IPCR");
  writeGridToSheet(sheet, workbook, grid);
  return workbook;
}

// Flattens an ExcelJS cell value (which can be a plain string/number/Date, or a richer
// {richText}/{formula, result}/{hyperlink, text} object depending on how the cell was
// authored in Excel) down to the plain string|number the grid's own data model expects.
function flattenCellValue(value: ExcelJS.CellValue): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return value;
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map(run => run.text).join("");
    }
    if ("result" in value) return flattenCellValue(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text;
  }
  return String(value);
}

// A cell authored with mixed formatting within its own text (e.g. "I, NAME, TITLE of the
// OFFICE, commit to..." where only NAME/TITLE/OFFICE are bold+underlined) comes back from
// ExcelJS as a {richText: [...]} value rather than a plain string — this extracts those runs
// so readSheet can keep the per-run formatting instead of losing it to the cell's one uniform
// style (which is all `font` above captures for a richText cell: just the base/first run).
function extractRichTextRuns(value: ExcelJS.CellValue): IPCRRichTextRun[] | null {
  if (value && typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return (value.richText as ExcelJS.RichText[]).map(run => ({
      text: run.text,
      bold: run.font?.bold || undefined,
      italic: run.font?.italic || undefined,
      underline: !!run.font?.underline || undefined,
    }));
  }
  return null;
}

// Inverse of writeGridToSheet above — reads one ExcelJS worksheet into the IPCRGridData shape
// the grid/PDF/xlsx-export pipeline already works with. Images embedded in the source .xlsx
// are not imported (the grid's own image overlay, positioned independently of cells, isn't a
// good match for Excel's anchor-based images) — everything else (values, merges, per-cell
// styling, column widths, row heights) is.
// Used by parseIPCRWorkbookFile below.
function readSheet(sheet: ExcelJS.Worksheet): IPCRGridData {
  // Prefer the sheet's ACTUAL used extent over its nominal dimension — Google Sheets exports
  // routinely declare a much larger nominal grid (e.g. 26 columns) than what's really filled
  // in, which was pulling in a wide band of empty trailing columns/rows on import.
  const rowCount = Math.max(sheet.actualRowCount || sheet.rowCount, 1);
  const colCount = Math.max(sheet.actualColumnCount || sheet.columnCount, 1);

  // Merges must be read BEFORE cell values/styles: ExcelJS proxies every non-anchor cell in a
  // merged range through to the anchor for BOTH .value and style reads, so scanning cells
  // first (as this used to) wrote the anchor's text into every column the merge spanned
  // instead of leaving them blank — e.g. a banner merged across A6:Q6 came back as the same
  // wrapped heading repeated in columns A through Q. `covered` tracks every non-anchor cell in
  // a merge so the data/style loop below can skip them.
  const mergeCells: Record<string, [number, number]> = {};
  const covered = new Set<string>();
  (sheet.model.merges ?? []).forEach(range => {
    const [start, end] = range.split(":");
    if (!start || !end) return;
    const startCoords = cellCoords(start);
    const endCoords = cellCoords(end);
    const colspan = Math.abs(endCoords.col - startCoords.col) + 1;
    const rowspan = Math.abs(endCoords.row - startCoords.row) + 1;
    if (colspan <= 1 && rowspan <= 1) return;
    mergeCells[start] = [colspan, rowspan];
    const anchorCol = Math.min(startCoords.col, endCoords.col);
    const anchorRow = Math.min(startCoords.row, endCoords.row);
    for (let r = anchorRow; r < anchorRow + rowspan; r++) {
      for (let c = anchorCol; c < anchorCol + colspan; c++) {
        if (r === anchorRow && c === anchorCol) continue;
        covered.add(cellName(c, r));
      }
    }
  });

  const data: (string | number)[][] = [];
  const style: Record<string, string> = {};
  const richText: Record<string, IPCRRichTextRun[]> = {};
  for (let row = 0; row < rowCount; row++) {
    const line: (string | number)[] = [];
    for (let col = 0; col < colCount; col++) {
      const name = cellName(col, row);
      if (covered.has(name)) { line.push(""); continue; }
      const cell = sheet.getCell(row + 1, col + 1);
      line.push(flattenCellValue(cell.value));
      // Excel/Sheets sometimes encodes a cell as multiple richText runs even when they all
      // render the same way here (e.g. a superscript-only difference this app doesn't model) —
      // runsNeedRichText tells them apart from genuinely mixed formatting. When it's not
      // genuinely mixed, the (shared) run style is folded into the cell's own base style below
      // instead of firing the richText overlay for what is, in effect, a uniformly-styled cell.
      const runs = extractRichTextRuns(cell.value);
      const uniformRun = runs && !runsNeedRichText(runs) ? runs[0] : null;
      if (runs && runsNeedRichText(runs)) richText[name] = runs;
      const font = cell.font;
      const fill = cell.fill;
      const alignment = cell.alignment;
      const border = cell.border;
      const fgColor = fill && fill.type === "pattern" ? (fill as ExcelJS.FillPattern).fgColor?.argb : undefined;
      const styleString = buildCellStyleString({
        bold: font?.bold || uniformRun?.bold,
        italic: font?.italic || uniformRun?.italic,
        underline: !!font?.underline || !!uniformRun?.underline,
        color: argbToHex(font?.color?.argb),
        backgroundColor: argbToHex(fgColor),
        align: alignment?.horizontal,
        valign: alignment?.vertical,
        fontFamily: font?.name,
        fontSize: font?.size,
        borderTop: borderSideToCss(border?.top),
        borderBottom: borderSideToCss(border?.bottom),
        borderLeft: borderSideToCss(border?.left),
        borderRight: borderSideToCss(border?.right),
      });
      if (styleString) style[name] = styleString;
    }
    data.push(line);
  }

  const colWidths: Record<number, number> = {};
  for (let col = 0; col < colCount; col++) {
    const width = sheet.getColumn(col + 1).width;
    if (typeof width === "number") colWidths[col] = Math.round(width * 7);
  }

  const rowHeights: Record<number, number> = {};
  for (let row = 0; row < rowCount; row++) {
    const height = sheet.getRow(row + 1).height;
    if (typeof height === "number") rowHeights[row] = Math.round(height * PIXELS_PER_POINT);
  }

  return { data, style, mergeCells, colWidths, rowHeights, richText, images: [], sheetName: sheet.name };
}

// Reads an admin-authored .xlsx/Google Sheets export — only the FIRST sheet/tab, since
// templates are single-page. Admins with a multi-tab export (e.g. Google Sheets) should export
// or copy just the tab they want first.
export async function parseIPCRWorkbookFile(file: File): Promise<IPCRGridData> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return emptyGrid();
  return readSheet(sheet);
}

export async function downloadIPCRWorkbook(grid: IPCRGridData, filename: string) {
  const workbook = await buildIPCRWorkbook(grid);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
