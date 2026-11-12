import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import type { SheetTable } from "./sheetService";

// "latest" is the newest-first order (by the sheet's date column when it has one, else by row), "row" the sheet's own order.
export type SheetSort = { key: "latest" | "row" | number; dir: "asc" | "desc" };

const PAGE_SIZES = [25, 50, 100];
const isLink = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());
const isNumbering = (label: string) => { const lowered = label.trim().toLowerCase().replace(/\.$/, ""); return ["no", "#", "id"].includes(lowered) || lowered.endsWith(" id"); };
const isDateLike = (value: string) => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value.trim()) || /^\d{1,2}:\d{2}(:\d{2})?\s?(am|pm)?$/i.test(value.trim()) || /^[A-Za-z]{3,9}\.? \d{1,2},? \d{4}$/.test(value.trim());

// The page numbers to show: the first, the last, and the ones around the current page, with gaps as null.
function pageWindow(current: number, total: number): (number | null)[] {
  const wanted = new Set([1, total, current - 1, current, current + 1].filter(page => page >= 1 && page <= total));
  const pages = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) out.push(null);
    out.push(page);
  });
  return out;
}

interface SheetTableViewProps {
  table: SheetTable;
  // The rows to show, already searched, filtered and sorted.
  rows: SheetTable["rows"];
  sort: SheetSort;
  onSort: (key: number) => void;
  // The column the newest-first order follows (where each row was logged), if the sheet has one.
  latestColumn: number | null;
  // A button at the left of every row (e.g. "Create task").
  action?: { label: string; render: (row: SheetTable["rows"][number], cells: SheetTable["rows"][number]["cells"]) => React.ReactNode };
}

// Reads a sheet's rows as a clean, paged table: long text wraps, short columns stay on one line, links become small
// buttons and ticked boxes become a check mark. Click a column title to sort by it.
export default function SheetTableView({ table, rows, sort, onSort, latestColumn, action }: SheetTableViewProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  // A different set of rows (another tab, a search, a filter, a sort) starts again from the first page.
  useEffect(() => { setPage(1); }, [rows, pageSize]);
  const current = Math.min(page, pages);

  // A width for each column from what it holds (so a title like "Province" is not squeezed into three lines).
  const widths = useMemo(() => table.headers.map((header, position) => {
    const sample = table.rows.slice(0, 150).map(row => row.cells[position] ?? "").filter(Boolean);
    if (sample.length && sample.every(cell => isLink(cell) || cell === "TRUE" || cell === "FALSE")) return 96;
    const longest = sample.reduce((max, cell) => Math.max(max, Math.min(cell.length, 60)), header.label.length > 14 ? 14 : header.label.length);
    return Math.max(isNumbering(header.label) ? 56 : 88, Math.min(340, Math.round(longest * 7.4) + 28));
  }), [table]);

  const start = (current - 1) * pageSize;
  const visible = rows.slice(start, start + pageSize);
  const sortIcon = (key: "row" | number) => !(sort.key === key || (sort.key === "latest" && (latestColumn === null ? key === "row" : key === latestColumn))) ? <ArrowUpDown size={12} className="etm-sheet-sort idle" /> : sort.dir === "asc" ? <ArrowUp size={12} className="etm-sheet-sort" /> : <ArrowDown size={12} className="etm-sheet-sort" />;

  return (
    <div className="etm-sheet-card">
      <div className="etm-sheet-scroll">
        <table className={`etm-sheet-table ${action ? "has-action" : ""}`}>
          <thead>
            <tr>
              {action && <th className="etm-sheet-action">{action.label}</th>}
              <th className="etm-sheet-rownum" aria-sort={sort.key === "row" || (sort.key === "latest" && latestColumn === null) ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" className="etm-sheet-sortbtn" onClick={() => onSort(-1)} title="Sort by the order in the sheet">Row {sortIcon("row")}</button>
              </th>
              {table.headers.map((header, position) => (
                <th key={header.index} style={{ minWidth: widths[position] }} aria-sort={sort.key === position || (sort.key === "latest" && latestColumn === position) ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="etm-sheet-sortbtn" onClick={() => onSort(position)} title={`Sort by ${header.label}`}>{header.label} {sortIcon(position)}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(row => (
              <tr key={row.row}>
                {action && <td className="etm-sheet-action">{action.render(row, row.cells)}</td>}
                <td className="etm-sheet-rownum">{row.row}</td>
                {row.cells.map((cell, position) => {
                  const text = cell.trim();
                  let content: React.ReactNode = text;
                  if (!text || text.toUpperCase() === "FALSE") content = <span className="etm-sheet-empty">—</span>;
                  else if (text.toUpperCase() === "TRUE") content = <span className="etm-sheet-check"><Check size={13} /></span>;
                  else if (isLink(text)) content = <a className="etm-sheet-link" href={text} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open</a>;
                  return <td key={position} className={isDateLike(text) || isNumbering(table.headers[position].label) ? "nowrap" : undefined}>{content}</td>;
                })}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={table.headers.length + (action ? 2 : 1)} className="etm-sheet-none">Nothing found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="etm-sheet-pager">
        <span className="etm-sheet-pager-info">{rows.length ? `Showing ${start + 1}–${Math.min(start + pageSize, rows.length)} of ${rows.length}` : "0 rows"}</span>
        <div className="etm-sheet-pager-controls">
          <label className="etm-sheet-pager-size">Rows per page
            <select className="etm-select" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
              {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          {pages > 1 && (
            <nav className="etm-sheet-pages" aria-label="Pages">
              <button type="button" className="etm-sheet-page" onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Previous page"><ChevronLeft size={15} /></button>
              {pageWindow(current, pages).map((item, index) => item === null
                ? <span key={`gap-${index}`} className="etm-sheet-gap">…</span>
                : <button type="button" key={item} className={`etm-sheet-page ${item === current ? "on" : ""}`} onClick={() => setPage(item)} aria-current={item === current ? "page" : undefined}>{item}</button>)}
              <button type="button" className="etm-sheet-page" onClick={() => setPage(current + 1)} disabled={current === pages} aria-label="Next page"><ChevronRight size={15} /></button>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
