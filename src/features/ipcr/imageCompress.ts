// Shrinks an image until it fits a byte limit, entirely in the browser.
//
// Only PNG and JPEG come out of here because those are what the PDF/.xlsx exports can embed
// (WebP would be smaller but would silently drop out of the exported file). Pictures with
// transparency (typical for logos) stay PNG and are made smaller by scaling down; opaque pictures
// become JPEG, which can trade quality for size first and only then scale.

export interface CompressResult {
  blob: Blob;
  originalBytes: number;
  finalBytes: number;
  // Whether the smallest version produced is within the limit.
  fits: boolean;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 1 : 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Longest side to start from — far more than a logo on an A3 form needs, and it spares huge
// camera-size pictures a pointless number of attempts.
const START_MAX_SIDE = 2400;
const MIN_SCALE = 0.2;

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(blob); } catch { /* fall back to <img> below */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("decode"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sizeOf(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  return source instanceof HTMLImageElement ? { width: source.naturalWidth, height: source.naturalHeight } : { width: source.width, height: source.height };
}

function hasTransparency(source: ImageBitmap | HTMLImageElement): boolean {
  const { width, height } = sizeOf(source);
  const scale = Math.min(1, 160 / Math.max(width, height, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return false;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 3; index < data.length; index += 4) if (data[index] < 250) return true;
  return false;
}

export async function compressImage(blob: Blob, maxBytes: number): Promise<CompressResult> {
  const originalBytes = blob.size;
  const source = await decode(blob);
  const { width, height } = sizeOf(source);
  const transparent = hasTransparency(source);
  const startScale = Math.min(1, START_MAX_SIDE / Math.max(width, height, 1));

  let best: Blob = blob;
  const consider = (candidate: Blob | null) => { if (candidate && candidate.size < best.size) best = candidate; return !!candidate && candidate.size <= maxBytes; };

  // Scales to try, largest first; JPEG tries a few qualities at each, PNG has just the one.
  const scales: number[] = [];
  for (let scale = startScale; scale >= MIN_SCALE * startScale; scale *= 0.8) scales.push(scale);
  const qualities = transparent ? [undefined] : [0.9, 0.8, 0.7, 0.6, 0.5];

  attempts:
  for (const scale of scales) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) break;
    if (!transparent) { context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const quality of qualities) {
      if (consider(await toBlob(canvas, transparent ? "image/png" : "image/jpeg", quality))) break attempts;
    }
  }
  if ("close" in source) source.close();

  return { blob: best, originalBytes, finalBytes: best.size, fits: best.size <= maxBytes };
}
