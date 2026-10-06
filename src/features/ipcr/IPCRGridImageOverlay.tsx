import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { IPCRGridImage } from "./types";

interface IPCRGridImageOverlayProps {
  images: IPCRGridImage[];
  editable: boolean;
  onChange?: (images: IPCRGridImage[]) => void;
}

export default function IPCRGridImageOverlay({ images, editable, onChange }: IPCRGridImageOverlayProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });
  // The move listener below is attached once per gesture, so it reads the latest values through refs.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function startDrag(event: React.PointerEvent<HTMLDivElement>, image: IPCRGridImage) {
    if (!editable || !onChange) return;
    event.preventDefault();
    const host = overlayRef.current?.getBoundingClientRect();
    dragOffset.current = { x: event.clientX - (host?.left ?? 0) - image.x, y: event.clientY - (host?.top ?? 0) - image.y };
    setDraggingId(image.id);
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>, image: IPCRGridImage) {
    if (!editable || !onChange) return;
    event.preventDefault();
    event.stopPropagation();
    resizeStart.current = { x: event.clientX, y: event.clientY, width: image.width, height: image.height };
    setResizingId(image.id);
  }

  // Follow the pointer across the WHOLE window for the length of a drag/resize. Listening on the
  // image box itself lost the gesture whenever the pointer moved faster than the box could follow
  // (or left it), which is why a resize kept stopping partway.
  useEffect(() => {
    const activeId = draggingId ?? resizingId;
    if (!activeId) return;
    const resizing = resizingId !== null;
    const onMove = (event: PointerEvent) => {
      const change = onChangeRef.current;
      const host = overlayRef.current?.getBoundingClientRect();
      if (!change || !host) return;
      const update = (patch: (image: IPCRGridImage) => IPCRGridImage) => change(imagesRef.current.map(image => image.id === activeId ? patch(image) : image));
      if (resizing) {
        const width = Math.max(24, resizeStart.current.width + (event.clientX - resizeStart.current.x));
        const height = Math.max(24, resizeStart.current.height + (event.clientY - resizeStart.current.y));
        update(image => ({ ...image, width, height }));
      } else {
        const x = Math.max(0, event.clientX - host.left - dragOffset.current.x);
        const y = Math.max(0, event.clientY - host.top - dragOffset.current.y);
        update(image => ({ ...image, x, y }));
      }
    };
    const end = () => { setDraggingId(null); setResizingId(null); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [draggingId, resizingId]);

  return (
    <div ref={overlayRef} className="etm-ipcr-image-overlay">
      {images.map(image => (
        <div
          key={image.id}
          className={`etm-ipcr-image-item ${editable ? "editable" : ""}`}
          style={{ left: image.x, top: image.y, width: image.width, height: image.height, touchAction: editable ? "none" : undefined }}
          onPointerDown={event => startDrag(event, image)}
        >
          <img src={image.dataUrl} alt="" draggable={false} />
          {editable && onChange && (
            <>
              <button
                type="button"
                className="etm-ipcr-image-remove"
                aria-label="Remove image"
                onPointerDown={event => event.stopPropagation()}
                onClick={() => onChange(images.filter(item => item.id !== image.id))}
              >
                <Trash2 size={12} />
              </button>
              <div className="etm-ipcr-image-resize-handle" style={{ touchAction: "none" }} onPointerDown={event => startResize(event, image)} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
