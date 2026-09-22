import IPCRGrid from "./IPCRGrid";
import IPCRGridImageOverlay from "./IPCRGridImageOverlay";
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
  return (
    <div className="etm-ipcr-grid-overlay-wrap">
      <IPCRGrid key={refreshKey} value={fillGrid(grid, fields, values)} editable={false} />
      <IPCRGridImageOverlay images={grid.images} editable={false} />
    </div>
  );
}
