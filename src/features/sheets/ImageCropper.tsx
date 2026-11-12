import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Crop, X } from "lucide-react";

interface ImageCropperProps {
  image: Blob;
  onDone: (file: File) => void;
  onCancel: () => void;
}

interface Box { x: number; y: number; w: number; h: number }

// A small snipping tool: drag a box over the picture to keep only that part (or keep it all).
export default function ImageCropper({ image, onDone, onCancel }: ImageCropperProps) {
  // Made and released inside one effect, so it also survives React running effects twice in development.
  const [url, setUrl] = useState("");
  useEffect(() => {
    const made = URL.createObjectURL(image);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [image]);
  const imgRef = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const point = (event: React.PointerEvent) => {
    const rect = imgRef.current!.getBoundingClientRect();
    return { x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width), y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height) };
  };
  const down = (event: React.PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    start.current = point(event);
    setBox(null);
  };
  const move = (event: React.PointerEvent) => {
    if (!start.current) return;
    const now = point(event);
    setBox({ x: Math.min(start.current.x, now.x), y: Math.min(start.current.y, now.y), w: Math.abs(now.x - start.current.x), h: Math.abs(now.y - start.current.y) });
  };
  const up = () => { start.current = null; setBox(current => (current && current.w > 8 && current.h > 8 ? current : null)); };

  function finish(useBox: boolean) {
    const img = imgRef.current;
    if (!img) return;
    const scale = img.naturalWidth / img.clientWidth;
    const area = useBox && box ? { x: box.x * scale, y: box.y * scale, w: box.w * scale, h: box.h * scale } : { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(area.w));
    canvas.height = Math.max(1, Math.round(area.h));
    canvas.getContext("2d")?.drawImage(img, area.x, area.y, area.w, area.h, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (blob) onDone(new File([blob], `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`, { type: "image/png" }));
    }, "image/png");
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Crop the screenshot" style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(2, 6, 14, .92)", display: "grid", gridTemplateRows: "auto 1fr", padding: 16, gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, color: "#fff" }}>
        <Crop size={18} />
        <strong style={{ flex: 1, minWidth: 200 }}>Drag over the part you want to keep</strong>
        <button type="button" className="etm-button ghost" onClick={onCancel}><X size={15} /> Cancel</button>
        <button type="button" className="etm-button ghost" onClick={() => finish(false)}>Use the whole image</button>
        <button type="button" className="etm-button" onClick={() => finish(true)} disabled={!box}><Check size={15} /> Use selection</button>
      </div>
      <div style={{ display: "grid", placeItems: "center", overflow: "auto", minHeight: 0 }}>
        <div style={{ position: "relative", lineHeight: 0, cursor: "crosshair", touchAction: "none", userSelect: "none" }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
          {url && <img ref={imgRef} src={url} alt="Screenshot" draggable={false} style={{ maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 100px)", display: "block" }} />}
          {box && (
            <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, border: "2px solid #17b3ac", boxShadow: "0 0 0 9999px rgba(0, 0, 0, .55)", pointerEvents: "none" }} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
