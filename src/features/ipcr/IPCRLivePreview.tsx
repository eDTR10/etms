import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getIPCRPdfBlob } from "./ipcrPdfExport";
import { fillGrid } from "./ipcrGridUtils";
import type { IPCRField, IPCRFieldValue, IPCRGridData, IPCROrientation, IPCRPaperSize } from "./types";

interface IPCRLivePreviewProps {
  grid: IPCRGridData;
  fields: IPCRField[];
  values: Record<string, IPCRFieldValue>;
  paperSize?: IPCRPaperSize;
  orientation?: IPCROrientation;
  // Bump this from the caller (e.g. a "Refresh preview" button) to regenerate the PDF with the
  // latest values — it doesn't react to value changes on its own, so typing doesn't rebuild a
  // full PDF per keystroke.
  refreshKey: number | string;
}

// Renders the actual PDF that "Download PDF" produces (same pdfmake pipeline), so the preview
// can never drift from the exported file the way an HTML approximation of the grid could.
export default function IPCRLivePreview({ grid, fields, values, paperSize = "a3", orientation = "landscape", refreshKey }: IPCRLivePreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const latest = useRef({ grid, fields, values, paperSize, orientation });
  latest.current = { grid, fields, values, paperSize, orientation };

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setError("");
    const current = latest.current;
    getIPCRPdfBlob(fillGrid(current.grid, current.fields, current.values), current.paperSize, current.orientation)
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setError("Couldn't generate the PDF preview."); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [refreshKey]);

  if (error) return <p className="etm-field-error" role="alert">{error}</p>;
  if (!url) return <div className="etm-ipcr-pdf-preview loading"><Loader2 size={22} className="etm-form-spinner" /></div>;
  return <iframe className="etm-ipcr-pdf-preview" src={`${url}#toolbar=1&navpanes=0`} title="IPCR PDF preview" />;
}
