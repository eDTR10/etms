import Swal from "sweetalert2";
import { setMutationSignal } from "../../plugin/mutationSignal";

export class CancelledError extends Error {
  constructor() {
    super("Action cancelled.");
    this.name = "CancelledError";
  }
}

// Blocks the page (no outside click/Escape) while a write is in flight. The Cancel button
// aborts the request; if the server had already finished it, the change still stands.
export async function withBlockingLoader<T>(title: string, action: () => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let cancelled = false;
  setMutationSignal(controller.signal);
  void Swal.fire({
    title,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: "Cancel",
    didOpen: () => {
      Swal.showLoading();
      // Open Radix dialogs disable pointer events outside themselves and treat outside
      // pointer/focus events as "dismiss", which would make Cancel unclickable or close the
      // task panel underneath — so keep this dialog's events to itself.
      const container = Swal.getContainer();
      if (container) {
        container.style.pointerEvents = "auto";
        for (const type of ["pointerdown", "mousedown", "focusin"]) container.addEventListener(type, event => event.stopPropagation());
      }
    },
  }).then(result => {
    if (result.dismiss === Swal.DismissReason.cancel) {
      cancelled = true;
      controller.abort();
    }
  });
  try {
    return await action();
  } catch (error) {
    if (cancelled) throw new CancelledError();
    throw error;
  } finally {
    setMutationSignal(null);
    if (!cancelled) Swal.close();
  }
}
