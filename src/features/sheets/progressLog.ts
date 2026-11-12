// A "progress log" cell of a sheet holds many updates in one text, each starting on its own line with its date:
//
//   11/05/2026 - CRRU routed to the Chiefs cc: ORD/OARD
//   TOD Chief - Hi Mam ...
//   11-09-2026 - DICT R 10 - Hi Ma'am ...
//
//   PO Nacilla - Good evening sir ...
//
// splitProgressLog() cuts it into one text per dated update (the date stays at the start of each one). Lines and paragraphs
// without a date belong to the update above them. When the text has no dated line at all, it stays as ONE text.
const DATED_LINE = /^[ \t]*[[(]?\d{1,2}[/-]\d{1,2}[/-]\d{4}/;

export function splitProgressLog(log: string): string[] {
  const text = log.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const lines = text.split("\n");
  const updates: string[][] = [];
  lines.forEach(line => {
    if (DATED_LINE.test(line) || updates.length === 0) updates.push([line]);
    else updates[updates.length - 1].push(line);
  });
  // Text before the first dated line is kept as an update of its own, unless nothing in the text is dated.
  return updates.map(update => update.join("\n").trim()).filter(Boolean);
}
