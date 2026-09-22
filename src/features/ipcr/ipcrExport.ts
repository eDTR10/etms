import ExcelJS from "exceljs";
import { adjectivalRating, type IPCRSubmission, type IPCRSubmissionRow } from "./types";

const COLS = 8; // Output | Indicator | Accomplishments | Q | E | T | A | Remarks
const FILL = {
  program: "FFFDF2D9",
  kra: "FFD9EAD3",
  headerBand: "FFDBE5F1",
  ratingBox: "FF000000",
};
const KRA_TEXT = "FFB3251F";

function ratingsOf(row: IPCRSubmissionRow) {
  return [row.rating_q, row.rating_e, row.rating_t, row.rating_a].filter((value): value is number => value != null);
}
function rowAverage(row: IPCRSubmissionRow): number | null {
  const values = ratingsOf(row);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function underlinedSentence(parts: { text: string; underline?: boolean }[]): ExcelJS.CellRichTextValue {
  return { richText: parts.map(part => ({ text: part.text, font: part.underline ? { underline: true } : undefined })) };
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export async function buildIPCRWorkbook(submission: IPCRSubmission): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("IPCR");
  sheet.columns = [
    { width: 26 }, { width: 30 }, { width: 34 },
    { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 },
    { width: 26 },
  ];

  let r = 1;
  sheet.mergeCells(r, 1, r, COLS);
  sheet.getCell(r, 1).value = "INDIVIDUAL PERFORMANCE COMMITMENT AND REVIEW (IPCR) FORM";
  sheet.getCell(r, 1).font = { bold: true, size: 15 };
  sheet.getCell(r, 1).alignment = { horizontal: "center" };
  r += 2;

  sheet.mergeCells(r, 1, r, COLS);
  sheet.getCell(r, 1).value = underlinedSentence([
    { text: "I, " }, { text: submission.employee_name || "____________", underline: true },
    { text: ", " }, { text: submission.employee_position || "____________", underline: true },
    { text: " of " }, { text: submission.employee_office || "____________", underline: true },
    { text: ", commit to deliver and agree to be rated on the attainment of the following targets in accordance with the indicated measures for the period of " },
    { text: submission.period_label || "____________", underline: true }, { text: "." },
  ]);
  sheet.getCell(r, 1).alignment = { horizontal: "center", wrapText: true };
  sheet.getRow(r).height = 28;
  r += 2;

  sheet.mergeCells(r, COLS - 1, r, COLS);
  sheet.getCell(r, COLS - 1).value = submission.employee_name;
  sheet.getCell(r, COLS - 1).font = { bold: true };
  sheet.getCell(r, COLS - 1).alignment = { horizontal: "center" };
  r += 1;
  sheet.mergeCells(r, COLS - 1, r, COLS);
  sheet.getCell(r, COLS - 1).value = submission.employee_position;
  sheet.getCell(r, COLS - 1).font = { italic: true };
  sheet.getCell(r, COLS - 1).alignment = { horizontal: "center" };
  r += 1;
  sheet.mergeCells(r, COLS - 1, r, COLS);
  sheet.getCell(r, COLS - 1).value = formatDate(submission.commitment_date);
  sheet.getCell(r, COLS - 1).alignment = { horizontal: "center" };
  r += 2;

  const signRow = r;
  sheet.mergeCells(signRow, 1, signRow, 3);
  sheet.getCell(signRow, 1).value = "PAP Commitments & Success Indicators Reviewed by:";
  sheet.getCell(signRow, 1).font = { bold: true };
  sheet.mergeCells(signRow, 5, signRow, 6);
  sheet.getCell(signRow, 5).value = "PAP Commitments & Success Indicators Approved by:";
  sheet.getCell(signRow, 5).font = { bold: true };
  r += 3;
  sheet.mergeCells(r, 1, r, 3);
  sheet.getCell(r, 1).value = submission.reviewed_by_name;
  sheet.getCell(r, 1).font = { bold: true };
  sheet.getCell(r, 1).alignment = { horizontal: "center" };
  sheet.mergeCells(r, 5, r, 6);
  sheet.getCell(r, 5).value = submission.approved_by_name;
  sheet.getCell(r, 5).font = { bold: true };
  sheet.getCell(r, 5).alignment = { horizontal: "center" };
  r += 1;
  sheet.mergeCells(r, 1, r, 3);
  sheet.getCell(r, 1).value = submission.reviewed_by_title;
  sheet.getCell(r, 1).font = { italic: true };
  sheet.getCell(r, 1).alignment = { horizontal: "center" };
  sheet.mergeCells(r, 5, r, 6);
  sheet.getCell(r, 5).value = submission.approved_by_title;
  sheet.getCell(r, 5).font = { italic: true };
  sheet.getCell(r, 5).alignment = { horizontal: "center" };
  r += 2;

  const headerRow = r;
  const headers = ["KRA / Output", "Success Indicator (Measures and Targets)", "Actual Accomplishments", "Q", "E", "T", "A", "Remarks"];
  headers.forEach((text, index) => {
    const cell = sheet.getCell(headerRow, index + 1);
    cell.value = text;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL.headerBand } };
  });
  r += 1;

  const ratingTotals: number[] = [];
  for (const row of submission.rows) {
    if (row.kind !== "data") {
      sheet.mergeCells(r, 1, r, COLS);
      const cell = sheet.getCell(r, 1);
      cell.value = row.text ?? "";
      cell.font = { bold: true, color: row.kind === "kra" ? { argb: KRA_TEXT } : undefined };
      if (row.kind === "program" || row.kind === "kra") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.kind === "program" ? FILL.program : FILL.kra } };
      }
      r += 1;
      continue;
    }
    const average = rowAverage(row);
    if (average !== null) ratingTotals.push(average);
    sheet.getCell(r, 1).value = row.output ?? "";
    sheet.getCell(r, 2).value = row.indicator ?? "";
    sheet.getCell(r, 3).value = row.actual_accomplishments ?? "";
    sheet.getCell(r, 4).value = row.rating_q ?? "";
    sheet.getCell(r, 5).value = row.rating_e ?? "";
    sheet.getCell(r, 6).value = row.rating_t ?? "";
    sheet.getCell(r, 7).value = row.rating_a ?? "";
    sheet.getCell(r, 8).value = row.remarks ?? "";
    for (let c = 1; c <= COLS; c++) sheet.getCell(r, c).alignment = { wrapText: true, vertical: "top", horizontal: c >= 4 && c <= 7 ? "center" : "left" };
    r += 1;
  }

  sheet.mergeCells(r, 1, r, 3);
  sheet.getCell(r, 1).value = "FINAL RATING";
  sheet.getCell(r, 1).font = { bold: true };
  sheet.getCell(r, 1).alignment = { horizontal: "center" };
  sheet.mergeCells(r, 4, r, 7);
  sheet.getCell(r, 4).value = submission.final_rating ?? "";
  sheet.getCell(r, 4).font = { bold: true };
  sheet.getCell(r, 4).alignment = { horizontal: "center" };
  sheet.getCell(r, 8).value = adjectivalRating(submission.final_rating);
  sheet.getCell(r, 8).font = { bold: true, italic: true };
  r += 2;

  sheet.mergeCells(r, 1, r, COLS);
  sheet.getCell(r, 1).value = "PART 3. OFFICE DEVELOPMENT PLAN";
  sheet.getCell(r, 1).font = { bold: true };
  sheet.getCell(r, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL.headerBand } };
  r += 1;

  sheet.mergeCells(r, 1, r, 4);
  sheet.getCell(r, 1).value = "Areas of Strength";
  sheet.getCell(r, 1).font = { bold: true };
  sheet.mergeCells(r, 5, r, 8);
  sheet.getCell(r, 5).value = "Proposed Interventions to Reinforce Strengths";
  sheet.getCell(r, 5).font = { bold: true };
  r += 1;
  const strengthLines = Math.max(submission.areas_of_strength.length, submission.strength_interventions.length, 1);
  for (let i = 0; i < strengthLines; i++) {
    sheet.mergeCells(r, 1, r, 4);
    sheet.getCell(r, 1).value = submission.areas_of_strength[i] ? `• ${submission.areas_of_strength[i]}` : "";
    sheet.mergeCells(r, 5, r, 8);
    sheet.getCell(r, 5).value = submission.strength_interventions[i] ? `• ${submission.strength_interventions[i]}` : "";
    r += 1;
  }

  sheet.mergeCells(r, 1, r, 4);
  sheet.getCell(r, 1).value = "Areas for Development";
  sheet.getCell(r, 1).font = { bold: true };
  sheet.mergeCells(r, 5, r, 8);
  sheet.getCell(r, 5).value = "Proposed Interventions for Development";
  sheet.getCell(r, 5).font = { bold: true };
  r += 1;
  const devLines = Math.max(submission.areas_for_development.length, submission.development_interventions.length, 1);
  for (let i = 0; i < devLines; i++) {
    sheet.mergeCells(r, 1, r, 4);
    sheet.getCell(r, 1).value = submission.areas_for_development[i] ? `• ${submission.areas_for_development[i]}` : "";
    sheet.mergeCells(r, 5, r, 8);
    sheet.getCell(r, 5).value = submission.development_interventions[i] ? `• ${submission.development_interventions[i]}` : "";
    r += 1;
  }
  r += 1;

  const signoff: [string, string, string, string | null][] = [
    ["Discussed with", submission.employee_name, submission.employee_position, submission.discussed_at],
    ["Assessed by", submission.reviewed_by_name, submission.reviewed_by_title, submission.assessed_at],
    ["Final Rating by", submission.approved_by_name, submission.approved_by_title, submission.final_rating_at],
  ];
  const spans = [[1, 3], [4, 5], [6, 8]] as const;
  signoff.forEach(([label], index) => {
    const [start, end] = spans[index];
    sheet.mergeCells(r, start, r, end);
    sheet.getCell(r, start).value = label;
    sheet.getCell(r, start).font = { bold: true };
    sheet.getCell(r, start).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL.headerBand } };
  });
  r += 1;
  signoff.forEach(([, name], index) => {
    const [start, end] = spans[index];
    sheet.mergeCells(r, start, r, end);
    const cell = sheet.getCell(r, start);
    cell.value = name;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center" };
  });
  r += 1;
  signoff.forEach(([, , title], index) => {
    const [start, end] = spans[index];
    sheet.mergeCells(r, start, r, end);
    const cell = sheet.getCell(r, start);
    cell.value = title;
    cell.font = { italic: true };
    cell.alignment = { horizontal: "center" };
  });
  r += 1;
  signoff.forEach(([, , , date], index) => {
    const [start, end] = spans[index];
    sheet.mergeCells(r, start, r, end);
    const cell = sheet.getCell(r, start);
    cell.value = formatDate(date);
    cell.alignment = { horizontal: "center" };
  });

  for (let row = 1; row < r; row++) {
    for (let col = 1; col <= COLS; col++) {
      const cell = sheet.getCell(row, col);
      if (cell.isMerged && cell.master !== cell) continue;
      const hasBorderWorthyContent = row >= headerRow;
      if (hasBorderWorthyContent) cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    }
  }

  return workbook;
}

export async function downloadIPCRWorkbook(submission: IPCRSubmission, filename: string) {
  const workbook = await buildIPCRWorkbook(submission);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
