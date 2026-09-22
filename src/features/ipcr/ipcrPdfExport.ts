import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { Content, TableCell } from "pdfmake/interfaces";
import { adjectivalRating, type IPCRSubmission, type IPCRSubmissionRow } from "./types";

(pdfMake as unknown as { vfs: typeof pdfFonts }).vfs = pdfFonts;

const FILL = { program: "#fdf2d9", kra: "#d9ead3", band: "#dbe5f1" };

function ratingsOf(row: IPCRSubmissionRow) {
  return [row.rating_q, row.rating_e, row.rating_t, row.rating_a].filter((value): value is number => value != null);
}
function rowAverage(row: IPCRSubmissionRow): number | null {
  const values = ratingsOf(row);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
function banner(text: string, fillColor?: string, textColor?: string): TableCell[] {
  return [{ text, colSpan: 8, bold: true, fillColor, color: textColor, margin: [4, 3, 4, 3] }, {}, {}, {}, {}, {}, {}, {}];
}

export function buildIPCRPdfDocDefinition(submission: IPCRSubmission) {
  const body: TableCell[][] = [
    [
      { text: "KRA / Output", bold: true, fillColor: FILL.band },
      { text: "Success Indicator (Measures and Targets)", bold: true, fillColor: FILL.band },
      { text: "Actual Accomplishments", bold: true, fillColor: FILL.band },
      { text: "Q", bold: true, fillColor: FILL.band },
      { text: "E", bold: true, fillColor: FILL.band },
      { text: "T", bold: true, fillColor: FILL.band },
      { text: "A", bold: true, fillColor: FILL.band },
      { text: "Remarks", bold: true, fillColor: FILL.band },
    ],
  ];

  const ratingTotals: number[] = [];
  for (const row of submission.rows) {
    if (row.kind !== "data") {
      body.push(banner(row.text ?? "", row.kind === "program" ? FILL.program : row.kind === "kra" ? FILL.kra : undefined, row.kind === "kra" ? "#b3251f" : undefined));
      continue;
    }
    const average = rowAverage(row);
    if (average !== null) ratingTotals.push(average);
    body.push([
      { text: row.output ?? "", fontSize: 8 },
      { text: row.indicator ?? "", fontSize: 8 },
      { text: row.actual_accomplishments ?? "", fontSize: 8 },
      { text: row.rating_q?.toString() ?? "", alignment: "center", fontSize: 8 },
      { text: row.rating_e?.toString() ?? "", alignment: "center", fontSize: 8 },
      { text: row.rating_t?.toString() ?? "", alignment: "center", fontSize: 8 },
      { text: row.rating_a?.toString() ?? "", alignment: "center", fontSize: 8 },
      { text: row.remarks ?? "", fontSize: 8 },
    ]);
  }
  body.push([
    { text: "FINAL RATING", colSpan: 3, bold: true, alignment: "center" }, {}, {},
    { text: submission.final_rating?.toString() ?? "", colSpan: 4, bold: true, alignment: "center" }, {}, {}, {},
    { text: adjectivalRating(submission.final_rating), bold: true, italics: true },
  ]);

  const content: Content[] = [
    { text: "INDIVIDUAL PERFORMANCE COMMITMENT AND REVIEW (IPCR) FORM", style: "title", alignment: "center", margin: [0, 0, 0, 10] },
    {
      text: [
        "I, ", { text: submission.employee_name || "____________", decoration: "underline" },
        ", ", { text: submission.employee_position || "____________", decoration: "underline" },
        " of ", { text: submission.employee_office || "____________", decoration: "underline" },
        ", commit to deliver and agree to be rated on the attainment of the following targets in accordance with the indicated measures for the period of ",
        { text: submission.period_label || "____________", decoration: "underline" }, ".",
      ],
      alignment: "center",
      margin: [0, 0, 0, 14],
    },
    {
      columns: [
        { width: "*", text: "" },
        { width: "auto", stack: [
          { text: submission.employee_name, bold: true, alignment: "center" },
          { text: submission.employee_position, italics: true, alignment: "center" },
          { text: formatDate(submission.commitment_date), alignment: "center" },
        ] },
      ],
      margin: [0, 0, 0, 14],
    },
    {
      columns: [
        { width: "*", stack: [
          { text: "PAP Commitments & Success Indicators Reviewed by:", bold: true, fontSize: 9 },
          { text: submission.reviewed_by_name, bold: true, alignment: "center", margin: [0, 16, 0, 0] },
          { text: submission.reviewed_by_title, italics: true, alignment: "center" },
        ] },
        { width: "*", stack: [
          { text: "PAP Commitments & Success Indicators Approved by:", bold: true, fontSize: 9 },
          { text: submission.approved_by_name, bold: true, alignment: "center", margin: [0, 16, 0, 0] },
          { text: submission.approved_by_title, italics: true, alignment: "center" },
        ] },
      ],
      margin: [0, 0, 0, 14],
    },
    {
      table: { headerRows: 1, widths: [70, 90, 100, 16, 16, 16, 16, 70], body },
      layout: { defaultBorder: true, hLineColor: () => "#7c7c7c", vLineColor: () => "#7c7c7c" },
      margin: [0, 0, 0, 14],
    },
    { text: "PART 3. OFFICE DEVELOPMENT PLAN", bold: true, fillColor: FILL.band, margin: [0, 0, 0, 4] },
    {
      columns: [
        { width: "*", stack: [
          { text: "Areas of Strength", bold: true },
          ...(submission.areas_of_strength.length ? submission.areas_of_strength.map(item => ({ text: `• ${item}`, fontSize: 9 })) : [{ text: "—", fontSize: 9 }]),
        ] },
        { width: "*", stack: [
          { text: "Proposed Interventions to Reinforce Strengths", bold: true },
          ...(submission.strength_interventions.length ? submission.strength_interventions.map(item => ({ text: `• ${item}`, fontSize: 9 })) : [{ text: "—", fontSize: 9 }]),
        ] },
      ],
      columnGap: 16,
      margin: [0, 0, 0, 10],
    },
    {
      columns: [
        { width: "*", stack: [
          { text: "Areas for Development", bold: true },
          ...(submission.areas_for_development.length ? submission.areas_for_development.map(item => ({ text: `• ${item}`, fontSize: 9 })) : [{ text: "—", fontSize: 9 }]),
        ] },
        { width: "*", stack: [
          { text: "Proposed Interventions for Development", bold: true },
          ...(submission.development_interventions.length ? submission.development_interventions.map(item => ({ text: `• ${item}`, fontSize: 9 })) : [{ text: "—", fontSize: 9 }]),
        ] },
      ],
      columnGap: 16,
      margin: [0, 0, 0, 16],
    },
    {
      columns: [
        { width: "*", stack: [
          { text: "Discussed with", bold: true, fillColor: FILL.band, alignment: "center", fontSize: 9 },
          { text: submission.employee_name, bold: true, alignment: "center", margin: [0, 14, 0, 0] },
          { text: submission.employee_position, italics: true, alignment: "center" },
          { text: formatDate(submission.discussed_at), alignment: "center" },
        ] },
        { width: "*", stack: [
          { text: "Assessed by", bold: true, fillColor: FILL.band, alignment: "center", fontSize: 9 },
          { text: submission.reviewed_by_name, bold: true, alignment: "center", margin: [0, 14, 0, 0] },
          { text: submission.reviewed_by_title, italics: true, alignment: "center" },
          { text: formatDate(submission.assessed_at), alignment: "center" },
        ] },
        { width: "*", stack: [
          { text: "Final Rating by", bold: true, fillColor: FILL.band, alignment: "center", fontSize: 9 },
          { text: submission.approved_by_name, bold: true, alignment: "center", margin: [0, 14, 0, 0] },
          { text: submission.approved_by_title, italics: true, alignment: "center" },
          { text: formatDate(submission.final_rating_at), alignment: "center" },
        ] },
      ],
      columnGap: 12,
    },
  ];

  return {
    pageSize: "A4" as const,
    pageOrientation: "landscape" as const,
    pageMargins: [30, 30, 30, 30] as [number, number, number, number],
    content,
    styles: { title: { fontSize: 16, bold: true } },
    defaultStyle: { fontSize: 9 },
  };
}

export function downloadIPCRPdf(submission: IPCRSubmission, filename: string) {
  pdfMake.createPdf(buildIPCRPdfDocDefinition(submission)).download(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
