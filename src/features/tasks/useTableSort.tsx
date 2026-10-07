import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronsUpDown, ArrowUp, ArrowDown } from "lucide-react";

export type SortValue = string | number | null | undefined;
type Direction = "asc" | "desc";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function isBlank(value: SortValue): value is null | undefined | "" {
  return value === null || value === undefined || value === "";
}

// Click a column once for ascending (A→Z, lowest→highest, oldest→newest), again for
// descending, a third time to go back to the table's original order. Blank cells always
// sink to the bottom so they don't crowd the top of an ascending sort.
export function useTableSort<T, K extends string>(rows: T[], accessors: Record<K, (row: T) => SortValue>) {
  const [sort, setSort] = useState<{ key: K; dir: Direction } | null>(null);
  const accessorsRef = useRef(accessors);
  accessorsRef.current = accessors;

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const get = accessorsRef.current[sort.key];
    const factor = sort.dir === "asc" ? 1 : -1;
    return rows
      .map((row, index) => ({ row, index, value: get(row) }))
      .sort((left, right) => {
        const leftBlank = isBlank(left.value);
        const rightBlank = isBlank(right.value);
        if (leftBlank || rightBlank) return leftBlank && rightBlank ? left.index - right.index : leftBlank ? 1 : -1;
        const a = left.value as string | number;
        const b = right.value as string | number;
        const order = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
        return order * factor || left.index - right.index;
      })
      .map(entry => entry.row);
  }, [rows, sort]);

  const toggle = (key: K) => setSort(current => {
    if (!current || current.key !== key) return { key, dir: "asc" };
    return current.dir === "asc" ? { key, dir: "desc" } : null;
  });

  return { sorted, sort, toggle };
}

interface SortThProps<K extends string> {
  sortKey: K;
  sort: { key: K; dir: Direction } | null;
  onSort: (key: K) => void;
  className?: string;
  // Rendered before the label, e.g. a "select all" checkbox that must stay clickable on its own.
  leading?: ReactNode;
  children: ReactNode;
}

export function SortTh<K extends string>({ sortKey, sort, onSort, className, leading, children }: SortThProps<K>) {
  const active = sort?.key === sortKey ? sort.dir : null;
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ChevronsUpDown;
  const button = (
    <button
      type="button"
      className={`etm-sort-button ${active ? "active" : ""}`}
      onClick={() => onSort(sortKey)}
      title={active === "asc" ? "Sorted ascending — click for descending" : active === "desc" ? "Sorted descending — click to clear" : "Click to sort"}
    >
      {children}<Icon size={13} aria-hidden="true" />
    </button>
  );
  return (
    <th scope="col" className={className} aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}>
      {leading ? <div className="etm-task-title-heading">{leading}{button}</div> : button}
    </th>
  );
}
