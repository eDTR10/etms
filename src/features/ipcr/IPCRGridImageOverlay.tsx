import { useRef, useState } from "react";
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
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

  function startDrag(event: React.PointerEvent<HTMLDivElement>, image: IPCRGridImage) {
    if (!editable || !onChange) return;
    event.preventDefault();
    const host = event.currentTarget.parentElement?.getBoundingClientRect();
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

  function onDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!onChange) return;
    const host = event.currentTarget.getBoundingClientRect();
    if (draggingId) {
      const x = Math.max(0, event.clientX - host.left - dragOffset.current.x);
      const y = Math.max(0, event.clientY - host.top - dragOffset.current.y);
      onChange(images.map(image => image.id === draggingId ? { ...image, x, y } : image));
    } else if (resizingId) {
      const width = Math.max(24, resizeStart.current.width + (event.clientX - resizeStart.current.x));
      const height = Math.max(24, resizeStart.current.height + (event.clientY - resizeStart.current.y));
      onChange(images.map(image => image.id === resizingId ? { ...image, width, height } : image));
    }
  }

  function endDrag() {
    setDraggingId(null);
    setResizingId(null);
  }

  return (
    <div
      className="etm-ipcr-image-overlay"
      onPointerMove={editable && (draggingId || resizingId) ? onDrag : undefined}
      onPointerUp={editable ? endDrag : undefined}
      onPointerLeave={editable ? endDrag : undefined}
    >
      {images.map(image => (
        <div
          key={image.id}
          className={`etm-ipcr-image-item ${editable ? "editable" : ""}`}
          style={{ left: image.x, top: image.y, width: image.width, height: image.height }}
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
              <div className="etm-ipcr-image-resize-handle" onPointerDown={event => startResize(event, image)} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
