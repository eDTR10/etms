import { FileSpreadsheet } from "lucide-react";

// Flip to false to turn the IPCR generator (and its admin template builder) back on: the
// sidebar entries and the page contents both key off this one flag.
export const IPCR_COMING_SOON = true;

export const IPCR_ROUTES = ["/etms/ipcr", "/etms/admin/ipcr-templates"];

export function isIPCRComingSoon(to: string): boolean {
  return IPCR_COMING_SOON && IPCR_ROUTES.includes(to);
}

export default function IPCRComingSoon() {
  return (
    <div className="etm-panel" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "56px 24px", textAlign: "center" }}>
      <span className="etm-kpi-icon" style={{ width: 56, height: 56, borderRadius: 16 }}><FileSpreadsheet size={26} /></span>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--etm-ink)" }}>Coming soon</h2>
      <p style={{ margin: 0, maxWidth: 420, color: "var(--etm-muted)", fontSize: 14, lineHeight: 1.6 }}>
        The IPCR generator is still being built. Once it's ready you'll be able to turn your grouped activities into a ready-to-file IPCR right here.
      </p>
    </div>
  );
}
