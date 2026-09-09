import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useTasks } from "./taskContext";

export default function TaskFeedback() {
  const { loading, error, refresh } = useTasks();
  if (loading) return <div className="etm-loading" role="status"><Loader2 className="etm-spin" size={23} /> Loading your workspace…</div>;
  if (error) return <div className="etm-error" role="alert"><AlertCircle size={22} /><div><strong>Unable to load your workspace</strong><p>{error}</p></div><button className="etm-button" onClick={() => void refresh()}><RefreshCw size={16} /> Retry</button></div>;
  return null;
}
