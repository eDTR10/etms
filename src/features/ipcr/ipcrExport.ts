import ExcelJS from "exceljs";
import { cellCoords, cellName, hexToArgb, parseCellStyle } from "./ipcrGridUtils";
import type { IPCRGridData } from "./types";

export async function buildIPCRWorkbook(grid: IPCRGridData, sheetName = "IPCR"): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  const colCount = grid.data[0]?.length ?? 0;
  for (let col = 0; col < colCount; col++) {
    sheet.getColumn(col + 1).width = (grid.colWidths[col] ?? 100) / 7;
  }

  grid.data.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const cell = sheet.getCell(rowIndex + 1, colIndex + 1);
      cell.value = value === "" ? null : value;
      const parsed = parseCellStyle(grid.style[cellName(colIndex, rowIndex)]);
      cell.font = {
        bold: parsed.bold || undefined,
        italic: parsed.italic || undefined,
        underline: parsed.underline || undefined,
        color: parsed.color ? { argb: hexToArgb(parsed.color) ?? undefined } : undefined,
      };
      if (parsed.backgroundColor) {
        const argb = hexToArgb(parsed.backgroundColor);
        if (argb) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      }
      cell.alignment = { horizontal: parsed.align, vertical: parsed.valign ?? "top", wrapText: true };
      cell.border = { top: { style: "thin", color: { argb: "FFB0B0B0" } }, bottom: { style: "thin", color: { argb: "FFB0B0B0" } }, left: { style: "thin", color: { argb: "FFB0B0B0" } }, right: { style: "thin", color: { argb: "FFB0B0B0" } } };
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

  return workbook;
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
