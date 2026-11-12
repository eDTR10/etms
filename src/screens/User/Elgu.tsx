import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, GraduationCap, LifeBuoy, Network, RefreshCw, type LucideIcon } from "lucide-react";
import UserLayout from "./UserLayout";
import AdminLayout from "../Admin/AdminLayout";
import { sheetService, type ProjectCard } from "../../features/sheets/sheetService";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";
import "../../features/sheets/sheets.css";

interface CardDef { key: string; title: string; description: string; Icon: LucideIcon; to?: string }

// Only Technical Assistance is open for now; the other two are placeholders.
const CARDS: CardDef[] = [
  { key: "elgu-ta", title: "eLGU Technical Assistance", description: "Every technical assistance given to the LGUs, month by month, straight from the sheet.", Icon: LifeBuoy, to: "/technical-assistance" },
  { key: "elgu-training", title: "eLGU Training", description: "Trainings conducted for the LGUs.", Icon: GraduationCap },
  { key: "elgu-refresher", title: "eLGU Refresher Training", description: "Refresher trainings for LGUs already live.", Icon: RefreshCw },
];

export function AdminElgu() { return <Elgu admin />; }

export default function Elgu({ admin = false }: { admin?: boolean }) {
  const Layout = admin ? AdminLayout : UserLayout;
  const base = admin ? "/etms/admin/elgu" : "/etms/elgu";
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [cards, setCards] = useState<ProjectCard[]>([]);
  useEffect(() => {
    sheetService.projectCards().then(result => { setAllowed(result.pages.includes("elgu")); setCards(result.cards); }).catch(() => setAllowed(false));
  }, []);

  return (
    <Layout title="eLGU Project Task" subtitle="Government Digital Transformation Bureau - eLGU">
      {allowed === false ? <p className="etm-report-error">This page is for the eLGU project.</p> : (
        <>
          <div className="etm-elgu-intro">
            <span className="etm-elgu-intro-badge"><Network size={22} /></span>
            <div>
              <h2>What would you like to open?</h2>
              <p>Choose a part of the eLGU project to see its records.</p>
            </div>
          </div>
          <div className="etm-elgu-grid">
            {CARDS.map(({ key, title, description, Icon, to }) => {
              const linked = !!cards.find(card => card.key === key)?.target;
              const body = (
                <>
                  <div className="etm-elgu-card-top">
                    <span className="etm-elgu-card-icon"><Icon size={22} /></span>
                    {to
                      ? <span className={`etm-elgu-pill ${linked ? "linked" : "setup"}`}><i />{linked ? "Sheet linked" : "Add sheet link"}</span>
                      : <span className="etm-elgu-pill soon"><Clock size={12} />Coming soon</span>}
                  </div>
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                  <div className="etm-elgu-card-foot">
                    <span>{to ? "Open" : "Not available yet"}</span>
                    {to && <ArrowRight size={17} />}
                  </div>
                </>
              );
              return to
                ? <Link key={key} to={`${base}${to}`} className="etm-elgu-card open">{body}</Link>
                : <div key={key} className="etm-elgu-card soon" aria-disabled="true">{body}</div>;
            })}
          </div>
        </>
      )}
    </Layout>
  );
}
