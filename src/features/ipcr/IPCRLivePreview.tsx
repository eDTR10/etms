import { useRef } from "react";
import IPCRGrid, { type IPCRGridHandle } from "./IPCRGrid";
import IPCRGridImageOverlay from "./IPCRGridImageOverlay";
import IPCRGridRichTextOverlay from "./IPCRGridRichTextOverlay";
import { fillGrid } from "./ipcrGridUtils";
import type { IPCRField, IPCRFieldValue, IPCRGridData } from "./types";

interface IPCRLivePreviewProps {
  grid: IPCRGridData;
  fields: IPCRField[];
  values: Record<string, IPCRFieldValue>;
  // Bump this from the caller (e.g. a "Refresh preview" button) to force the read-only grid
  // to remount with the latest values — it doesn't react to value changes on its own, the
  // same as the editable grid, so typing doesn't thrash a full spreadsheet re-init per keystroke.
  refreshKey: number | string;
}

export default function IPCRLivePreview({ grid, fields, values, refreshKey }: IPCRLivePreviewProps) {
  const gridRef = useRef<IPCRGridHandle>(null);
  const filled = fillGrid(grid, fields, values);
  return (
    <div className="etm-ipcr-grid-overlay-wrap">
      <IPCRGrid key={refreshKey} ref={gridRef} value={filled} editable={false} />
      <IPCRGridImageOverlay images={grid.images} editable={false} />
      <IPCRGridRichTextOverlay grid={filled} gridRef={gridRef} refreshKey={refreshKey} />
    </div>
  );
}
