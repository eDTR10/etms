// Click-and-drag horizontal scrolling for every `.etm-table-wrap`, so wide tables can be panned without reaching
// for the scroll bar at the bottom. Drags that start on controls, text fields or links are left alone, and a drag
// swallows the click that follows it so rows are not opened by accident.
const INTERACTIVE = "a, button, input, select, textarea, label, [role='button'], [contenteditable='true'], [data-touch-drag]";
const THRESHOLD = 5;

export function installTableDragScroll() {
  let wrap: HTMLElement | null = null;
  let startX = 0;
  let startScroll = 0;
  let dragging = false;

  document.addEventListener("pointerdown", event => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const target = event.target as Element | null;
    const found = target?.closest?.(".etm-table-wrap") as HTMLElement | null;
    // The invisible link stretched over every table cell (it makes the whole row open the task) is not a control
    // the user is aiming at — a drag that starts on it is still a drag of the table.
    const control = target?.closest(INTERACTIVE);
    if (!found || (control && !control.classList.contains("etm-cell-link")) || found.scrollWidth <= found.clientWidth) return;
    wrap = found;
    startX = event.clientX;
    startScroll = found.scrollLeft;
    dragging = false;
  });

  document.addEventListener("pointermove", event => {
    if (!wrap) return;
    const delta = event.clientX - startX;
    if (!dragging && Math.abs(delta) < THRESHOLD) return;
    if (!dragging) { dragging = true; wrap.classList.add("etm-dragging"); }
    wrap.scrollLeft = startScroll - delta;
    event.preventDefault();
  });

  // Dragging from a link would otherwise start the browser's own "drag this link" gesture and cancel ours.
  document.addEventListener("dragstart", event => {
    if (wrap && (event.target as Element | null)?.closest?.(".etm-table-wrap") === wrap) event.preventDefault();
  });

  const end = () => {
    if (!wrap) return;
    wrap.classList.remove("etm-dragging");
    if (dragging) {
      const swallow = (click: Event) => { click.stopPropagation(); click.preventDefault(); };
      document.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener("click", swallow, true), 0);
    }
    wrap = null;
    dragging = false;
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
}
