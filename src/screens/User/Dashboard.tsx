import { useEffect, useState } from "react";
import { FileText, Clock, CheckCircle2, UserCircle } from "lucide-react";
import UserLayout from "./UserLayout";
import { StatCardsSkeleton, ActivitySkeleton } from "../../components/ui/skeleton";
import { useAuth } from "../Auth/AuthContext";

const stats = [
  { title: "My Documents",  value: "24",  icon: <FileText className="w-5 h-5" /> },
  { title: "Pending",       value: "3",   icon: <Clock className="w-5 h-5" /> },
  { title: "Approved",      value: "19",  icon: <CheckCircle2 className="w-5 h-5" /> },
  { title: "Profile Status",value: "Complete", icon: <UserCircle className="w-5 h-5" /> },
];

const recentActivity = [
  { action: "Submitted \"Leave Request Form\"", time: "20 min ago" },
  { action: "Document \"ID Application\" approved", time: "2 hr ago" },
  { action: "Updated profile information", time: "1 day ago" },
  { action: "Uploaded \"Certificate of Employment\"", time: "3 days ago" },
];

const Dashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  // Simulate initial data fetch — replace with real API call
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <UserLayout title="Dashboard" subtitle={`Welcome back, ${user?.first_name ?? "there"} 👋`}>

      {/* Welcome Banner */}
      <div className="rounded-2xl bg-primary/10 border border-primary/20 px-6 py-5 mb-6 flex items-center justify-between sm:flex-col sm:items-start sm:gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Good day, {user?.first_name ?? "there"}!
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Here&apos;s a quick look at your documents and activity.
          </p>
        </div>
        <span className="text-3xl sm:hidden">👋</span>
      </div>

      {/* Stat Cards */}
      {loading ? (
        <StatCardsSkeleton />
      ) : (
        <div className="grid grid-cols-4 gap-4 mb-6 lg:grid-cols-2 sm:grid-cols-1">
          {stats.map((stat) => (
            <div key={stat.title} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{stat.title}</p>
                <span className="p-2 rounded-lg bg-primary/10 text-primary">{stat.icon}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">My Recent Activity</h3>
        {loading ? (
          <ActivitySkeleton rows={4} />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {recentActivity.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div className="w-8 h-8 shrink-0 rounded-full bg-accent flex items-center justify-center text-muted-foreground">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{item.action}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{item.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </UserLayout>
  );
};

export default Dashboard;
