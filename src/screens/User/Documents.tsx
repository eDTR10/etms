import { useEffect, useState } from "react";
import { Search, Plus, FileText, MoreHorizontal } from "lucide-react";
import UserLayout from "./UserLayout";
import { TableSkeleton } from "../../components/ui/skeleton";

interface Document {
  id: number;
  title: string;
  type: string;
  status: "Published" | "Draft" | "Archived";
  date: string;
}

// Mock data — replace with real API call scoped to the current user
const MOCK_DOCS: Document[] = [
  { id: 1, title: "Leave Request Form",          type: "PDF",  status: "Published", date: "Jul 10, 2026" },
  { id: 2, title: "ID Application",               type: "PDF",  status: "Published", date: "Jul 15, 2026" },
  { id: 3, title: "Certificate of Employment",    type: "DOCX", status: "Draft",     date: "Jul 17, 2026" },
];

const statusColor: Record<Document["status"], string> = {
  Published: "bg-green-500/10 text-green-600 dark:text-green-400",
  Draft:     "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  Archived:  "bg-muted text-muted-foreground",
};

const typeIcon: Record<string, string> = { PDF: "🔴", DOCX: "🔵", XLSX: "🟢" };

const Documents = () => {
  const [loading, setLoading]     = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [search, setSearch]       = useState("");
  const [filter, setFilter]       = useState<"All" | Document["status"]>("All");

  useEffect(() => {
    const t = setTimeout(() => {
      setDocuments(MOCK_DOCS);
      setLoading(false);
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  const filtered = documents.filter((d) => {
    const matchSearch = d.title.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "All" || d.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <UserLayout title="My Documents" subtitle="Documents you've submitted or uploaded">

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 sm:flex-col sm:items-stretch">
        <div className="relative flex-1 max-w-xs sm:max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search my documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
        {/* Filter pills */}
        <div className="flex gap-1.5">
          {(["All", "Published", "Draft", "Archived"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition ml-auto sm:ml-0">
          <Plus className="w-4 h-4" />
          Upload
        </button>
      </div>

      {/* Table / Skeleton */}
      {loading ? (
        <TableSkeleton rows={3} />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[2fr_1fr_auto] gap-4 px-5 py-3 border-b border-border bg-muted/40">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Document</p>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</p>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</p>
          </div>

          {filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">No documents found.</div>
          ) : (
            filtered.map((doc) => (
              <div
                key={doc.id}
                className="grid grid-cols-[2fr_1fr_auto] gap-4 px-5 py-3.5 border-b border-border last:border-0 items-center hover:bg-accent/40 transition-colors"
              >
                {/* Document info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-accent flex items-center justify-center text-sm">
                    {typeIcon[doc.type] ?? <FileText className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">{doc.type} · {doc.date}</p>
                  </div>
                </div>

                {/* Status badge */}
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium w-fit ${statusColor[doc.status]}`}>
                  {doc.status}
                </span>

                {/* Actions */}
                <button className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && (
        <p className="text-xs text-muted-foreground mt-3">
          Showing {filtered.length} of {documents.length} documents
        </p>
      )}
    </UserLayout>
  );
};

export default Documents;
