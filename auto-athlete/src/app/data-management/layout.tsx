import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import ChatProvider from "@/components/ChatProvider";
import TopBar from "@/components/TopBar";

interface DataManagementLayoutProps {
  children: React.ReactNode;
}

export default function DataManagementLayout({ children }: DataManagementLayoutProps) {
  return (
    <ChatProvider>
      <div className="min-h-screen bg-aa-bg noise-overlay">
        <Sidebar />
        <div className="ml-[220px] relative z-10">
          <TopBar />
          <main className="p-6">{children}</main>
        </div>
        <ChatPanel />
      </div>
    </ChatProvider>
  );
}
