import { useState } from "react";
import { Camera, Save, Lock } from "lucide-react";
import UserLayout from "./UserLayout";
import { ProfileSkeleton } from "../../components/ui/skeleton";
import { useAuth } from "../Auth/AuthContext";

const Profile = () => {
  const { user, isLoading } = useAuth();
  const [saved, setSaved] = useState(false);
  const [tab, setTab]     = useState<"info" | "password">("info");

  // ProtectedRoute only renders this once isLoading is false, so `user` is
  // already populated on first render — safe to seed state from it directly
  // instead of syncing via an effect.
  const [info, setInfo] = useState({
    firstName: user?.first_name ?? "",
    lastName:  user?.last_name ?? "",
    email:     user?.email ?? "",
    position:  user?.position ?? "",
  });

  const [passwords, setPasswords] = useState({
    current:  "",
    newPass:  "",
    confirm:  "",
  });

  const handleSave = () => {
    setSaved(true);
    // TODO: send to API
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <UserLayout title="Profile" subtitle="Manage your account">

      <div className="max-w-2xl flex flex-col gap-6">

        {isLoading ? (
          <div className="bg-card border border-border rounded-xl p-6">
            <ProfileSkeleton />
          </div>
        ) : (
          <>
            {/* ── Avatar section ─────────────────────────────────────── */}
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-5 sm:flex-col sm:items-start">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold uppercase">
                    {info.firstName.slice(0, 1)}{info.lastName.slice(0, 1)}
                  </div>
                  <button className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors">
                    <Camera className="w-3.5 h-3.5 text-foreground" />
                  </button>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {info.firstName} {info.lastName}
                  </h2>
                  <p className="text-sm text-muted-foreground">{info.email}</p>
                  {info.position && (
                    <p className="text-xs text-muted-foreground mt-0.5">{info.position}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Tabs ───────────────────────────────────────────────── */}
            <div className="flex gap-1 border-b border-border">
              {(["info", "password"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                    tab === t
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "info" ? "Personal Info" : "Change Password"}
                </button>
              ))}
            </div>

            {/* ── Personal Info form ─────────────────────────────────── */}
            {tab === "info" && (
              <section className="bg-card border border-border rounded-xl p-6">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
                  {[
                    { key: "firstName", label: "First Name", placeholder: "Juan" },
                    { key: "lastName",  label: "Last Name",  placeholder: "Dela Cruz" },
                    { key: "email",     label: "Email",      placeholder: "you@example.com" },
                    { key: "position",  label: "Position",   placeholder: "Staff" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">{label}</label>
                      <input
                        type="text"
                        value={info[key as keyof typeof info]}
                        onChange={(e) => setInfo({ ...info, [key]: e.target.value })}
                        placeholder={placeholder}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Change Password form ───────────────────────────────── */}
            {tab === "password" && (
              <section className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-2 mb-5 text-muted-foreground">
                  <Lock className="w-4 h-4" />
                  <p className="text-xs">Use a strong password of at least 8 characters.</p>
                </div>
                <div className="flex flex-col gap-4">
                  {[
                    { key: "current",  label: "Current Password",  placeholder: "Enter current password" },
                    { key: "newPass",  label: "New Password",       placeholder: "Enter new password" },
                    { key: "confirm",  label: "Confirm Password",   placeholder: "Repeat new password" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">{label}</label>
                      <input
                        type="password"
                        value={passwords[key as keyof typeof passwords]}
                        onChange={(e) => setPasswords({ ...passwords, [key]: e.target.value })}
                        placeholder={placeholder}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Save */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-5 py-2.5 rounded-lg hover:opacity-90 transition"
              >
                <Save className="w-4 h-4" />
                {saved ? "Saved!" : "Save Changes"}
              </button>
            </div>
          </>
        )}
      </div>
    </UserLayout>
  );
};

export default Profile;
