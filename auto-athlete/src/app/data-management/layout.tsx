import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

interface DataManagementLayoutProps {
  children: React.ReactNode;
}

export default function DataManagementLayout({ children }: DataManagementLayoutProps) {
  return (
    <div className="min-h-screen bg-aa-bg noise-overlay">
      <Sidebar />
      <div className="ml-[220px] relative z-10">
        <TopBar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
