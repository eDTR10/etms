import { useMemo, useState } from "react";

export function useRowSelection(ids: number[]) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const visibleIds = useMemo(() => new Set(ids), [ids]);
  const selectedVisible = useMemo(() => [...selected].filter(id => visibleIds.has(id)), [selected, visibleIds]);

  const toggle = (id: number) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(current => {
      const allSelected = ids.length > 0 && ids.every(id => current.has(id));
      if (allSelected) {
        const next = new Set(current);
        ids.forEach(id => next.delete(id));
        return next;
      }
      const next = new Set(current);
      ids.forEach(id => next.add(id));
      return next;
    });
  };

  const clear = () => setSelected(new Set());

  const isAllSelected = ids.length > 0 && ids.every(id => selected.has(id));
  const isSomeSelected = selectedVisible.length > 0 && !isAllSelected;

  return {
    selectedIds: selectedVisible,
    count: selectedVisible.length,
    isSelected: (id: number) => selected.has(id),
    isAllSelected,
    isSomeSelected,
    toggle,
    toggleAll,
    clear,
  };
}
