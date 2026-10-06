import ExcelJS from "exceljs";
import { argbToHex, borderSideToCss, buildCellStyleString, cellCoords, cellName, cssBorderToExcelSide, hexToArgb, parseCellStyle, runsNeedRichText } from "./ipcrGridUtils";
import { emptyGrid, type IPCRGridData, type IPCRImageAnchor, type IPCRRichTextRun } from "./types";

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

  // The printed/on-screen grid in Excel is not part of the design.
  sheet.views = [{ showGridLines: false }];

  // Which merged block (and anchor) each cell belongs to, for the border handling below.
  const mergeBlockOf = new Map<string, { anchor: string; col: number; row: number; colspan: number; rowspan: number }>();
  Object.entries(grid.mergeCells).forEach(([anchor, [colspan, rowspan]]) => {
    if (colspan <= 1 && rowspan <= 1) return;
    const { col, row } = cellCoords(anchor);
    for (let r = row; r < row + rowspan; r++) for (let c = col; c < col + colspan; c++) mergeBlockOf.set(cellName(c, r), { anchor, col, row, colspan, rowspan });
  });

  // Only borders that were actually drawn (in the Borders toolbar, or carried in from an .xlsx / Google
  // Sheets paste) are written — no default gridline, so the exported sheet has no grid either.
  // On screen each cell is a separate box, so a line between two cells can live on either cell (the
  // other's facing edge is blanked "transparent"); Excel has one line per edge, so read it from
  // whichever side actually has it. A merged block's outline comes from its top-left cell.
  const explicit = (css?: string) => css && !css.includes("transparent") ? css : undefined;
  const styleAt = (col: number, row: number) => {
    if (col < 0 || row < 0) return undefined;
    const name = cellName(col, row);
    return parseCellStyle(grid.style[mergeBlockOf.get(name)?.anchor ?? name]);
  };
  const bordersFor = (colIndex: number, rowIndex: number): Partial<ExcelJS.Borders> => {
    const block = mergeBlockOf.get(cellName(colIndex, rowIndex));
    const source = styleAt(colIndex, rowIndex);
    const border: Partial<ExcelJS.Borders> = {};
    const draw = (side: "top" | "bottom" | "left" | "right", css: string | undefined) => {
      const excelSide = cssBorderToExcelSide(css);
      if (excelSide) border[side] = excelSide;
    };
    if (!block || rowIndex === block.row) draw("top", explicit(source?.borderTop) ?? explicit(styleAt(colIndex, rowIndex - 1)?.borderBottom));
    if (!block || rowIndex === block.row + block.rowspan - 1) draw("bottom", explicit(source?.borderBottom) ?? explicit(styleAt(colIndex, rowIndex + 1)?.borderTop));
    if (!block || colIndex === block.col) draw("left", explicit(source?.borderLeft) ?? explicit(styleAt(colIndex - 1, rowIndex)?.borderRight));
    if (!block || colIndex === block.col + block.colspan - 1) draw("right", explicit(source?.borderRight) ?? explicit(styleAt(colIndex + 1, rowIndex)?.borderLeft));
    return border;
  };

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
      cell.border = bordersFor(colIndex, rowIndex);
    });
  });

  Object.entries(grid.mergeCells).forEach(([anchor, [colspan, rowspan]]) => {
    if (colspan <= 1 && rowspan <= 1) return;
    const { col, row } = cellCoords(anchor);
    sheet.mergeCells(row + 1, col + 1, row + rowspan, col + colspan);
  });
  // Merging copies the anchor's style over the cells it covers, which wipes the block's outline on them.
  mergeBlockOf.forEach((_block, name) => {
    const { col, row } = cellCoords(name);
    sheet.getCell(row + 1, col + 1).border = bordersFor(col, row);
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
  // NOT actualRowCount/actualColumnCount: those are *counts* of rows/columns that hold a value,
  // so a sheet with blank rows in it (e.g. blank spacer rows above the title) reports fewer rows
  // than its last used row number — which cut the bottom of the sheet off on import. Instead,
  // find the furthest row/column that really has content: a value, a border, or a fill.
  let lastRow = 0;
  let lastCol = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const fill = cell.fill;
      const border = cell.border;
      const hasValue = cell.value !== null && cell.value !== undefined && cell.value !== "";
      const hasBorder = !!(border && (border.top || border.bottom || border.left || border.right));
      const hasFill = !!(fill && fill.type === "pattern" && (fill as ExcelJS.FillPattern).fgColor?.argb);
      if (!hasValue && !hasBorder && !hasFill) return;
      lastRow = Math.max(lastRow, rowNumber);
      lastCol = Math.max(lastCol, colNumber);
    });
  });
  (sheet.model.merges ?? []).forEach(range => {
    const end = range.split(":")[1];
    if (!end) return;
    const { col, row } = cellCoords(end);
    lastRow = Math.max(lastRow, row + 1);
    lastCol = Math.max(lastCol, col + 1);
  });
  const rowCount = Math.max(lastRow, 1);
  const colCount = Math.max(lastCol, 1);

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
export interface IPCRImportedGrid extends IPCRGridData {
  imageAnchors: IPCRImageAnchor[];
}

const EMU_PER_PIXEL = 9525;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}

// Reads the pictures placed over the sheet (logos, seals, ...). Excel anchors each one to a cell
// plus an offset inside it; its size is either explicit (ext) or the span between two anchors.
function readSheetImages(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, grid: IPCRGridData): IPCRImageAnchor[] {
  const DEFAULT_COL_WIDTH = 64;
  const DEFAULT_ROW_HEIGHT = 20;
  const colWidth = (col: number) => grid.colWidths[col] ?? DEFAULT_COL_WIDTH;
  const rowHeight = (row: number) => grid.rowHeights?.[row] ?? DEFAULT_ROW_HEIGHT;
  const anchors: IPCRImageAnchor[] = [];

  sheet.getImages().forEach((image, index) => {
    const media = workbook.getImage(Number(image.imageId)) as { buffer?: ArrayBuffer | Uint8Array; extension?: string } | undefined;
    if (!media?.buffer) return;
    const bytes = media.buffer instanceof Uint8Array ? media.buffer : new Uint8Array(media.buffer);
    const extension = (media.extension ?? "png").toLowerCase();
    const mime = extension === "jpg" || extension === "jpeg" ? "jpeg" : extension === "gif" ? "gif" : "png";

    const tl = image.range.tl as unknown as { nativeCol: number; nativeColOff: number; nativeRow: number; nativeRowOff: number };
    const br = image.range.br as unknown as typeof tl | undefined;
    const ext = (image.range as unknown as { ext?: { width: number; height: number } }).ext;
    let width = ext?.width ?? 0;
    let height = ext?.height ?? 0;
    if ((!width || !height) && br) {
      width = -tl.nativeColOff / EMU_PER_PIXEL + br.nativeColOff / EMU_PER_PIXEL;
      for (let col = tl.nativeCol; col < br.nativeCol; col++) width += colWidth(col);
      height = -tl.nativeRowOff / EMU_PER_PIXEL + br.nativeRowOff / EMU_PER_PIXEL;
      for (let row = tl.nativeRow; row < br.nativeRow; row++) height += rowHeight(row);
    }
    if (!width || !height) return;
    anchors.push({
      id: `img-import-${Date.now()}-${index}`,
      dataUrl: `data:image/${mime};base64,${bytesToBase64(bytes)}`,
      col: tl.nativeCol, row: tl.nativeRow,
      dx: tl.nativeColOff / EMU_PER_PIXEL, dy: tl.nativeRowOff / EMU_PER_PIXEL,
      width: Math.max(8, Math.round(width)), height: Math.max(8, Math.round(height)),
      bytes: bytes.length,
    });
  });
  return anchors;
}

export async function parseIPCRWorkbookFile(file: File): Promise<IPCRImportedGrid> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { ...emptyGrid(), imageAnchors: [] };
  const grid = readSheet(sheet);
  let images: IPCRImageAnchor[] = [];
  // A picture the reader can't make sense of must never cost the user the whole import.
  try { images = readSheetImages(workbook, sheet, grid); } catch { /* import without pictures */ }
  return { ...grid, imageAnchors: images };
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
