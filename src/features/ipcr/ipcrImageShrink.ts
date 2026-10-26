import type { IPCRGridData } from "./types";

// The server stores a template in one database row and refuses anything past a limit (1 MB on some hosts), and pictures
// pasted into a sheet are usually what makes a template that big — they are kept as full-size files. A picture is only
// shown a few hundred pixels wide, so it can be re-drawn smaller without a visible difference.

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("a picture could not be read"));
    image.src = dataUrl;
  });
}

// Draws the picture at `scale` times the size it is shown at (so 2 = sharp on a high-density screen).
async function redraw(dataUrl: string, shownWidth: number, shownHeight: number, scale: number, asJpeg: boolean): Promise<string> {
  const image = await loadImage(dataUrl);
  const width = Math.max(1, Math.min(image.naturalWidth, Math.round(shownWidth * scale)));
  const height = Math.max(1, Math.min(image.naturalHeight, Math.round(shownHeight * scale)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  // A picture saved as JPEG has no see-through parts, so they become the white of the paper.
  if (asJpeg) { context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); }
  context.drawImage(image, 0, 0, width, height);
  return asJpeg ? canvas.toDataURL("image/jpeg", 0.85) : canvas.toDataURL("image/png");
}

const sizeOf = (grid: IPCRGridData, rest: unknown) => JSON.stringify({ grid, rest }).length;

/**
 * Makes the template's pictures smaller until everything fits in `limitBytes`, trying the gentlest change first (same
 * format, smaller pixels), then JPEG. Returns the grid unchanged when it already fits or has no pictures to shrink.
 */
export async function shrinkGridImages(grid: IPCRGridData, rest: unknown, limitBytes: number): Promise<IPCRGridData> {
  if (!grid.images?.length || sizeOf(grid, rest) <= limitBytes) return grid;
  const steps: { scale: number; jpeg: boolean }[] = [
    { scale: 2, jpeg: false }, { scale: 1.5, jpeg: false }, { scale: 1, jpeg: false },
    { scale: 2, jpeg: true }, { scale: 1.5, jpeg: true }, { scale: 1, jpeg: true }, { scale: 0.75, jpeg: true },
  ];
  let best = grid;
  for (const step of steps) {
    try {
      const images = await Promise.all(grid.images.map(async image => ({ ...image, dataUrl: await redraw(image.dataUrl, image.width, image.height, step.scale, step.jpeg) })));
      best = { ...grid, images };
    } catch {
      return best;
    }
    if (sizeOf(best, rest) <= limitBytes) return best;
  }
  return best;
}
