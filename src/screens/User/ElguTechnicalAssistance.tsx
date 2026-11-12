import SheetTasksPage from "../../features/sheets/SheetTasksPage";

export function AdminElguTechnicalAssistance() {
  return (
    <SheetTasksPage admin cardKey="elgu-ta" title="eLGU Technical Assistance" subtitle="Government Digital Transformation Bureau - eLGU" assistanceGroup="eLGU Technical Assistance" back={{ to: "/etms/admin/elgu", label: "eLGU Project Task" }} />
  );
}

export default function ElguTechnicalAssistance() {
  return (
    <SheetTasksPage cardKey="elgu-ta" title="eLGU Technical Assistance" subtitle="Government Digital Transformation Bureau - eLGU" assistanceGroup="eLGU Technical Assistance" back={{ to: "/etms/elgu", label: "eLGU Project Task" }} />
  );
}
