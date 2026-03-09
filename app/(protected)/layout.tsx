import AppSidebar from "@/components/app-sidebar/AppSidebar";
import ProtectedRoute from "@/components/auth/protected";
import ProtectedTopbar from "@/components/layout/ProtectedTopbar";
import ReactQueryProvider from "@/components/providers/ReactQueryProvider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AuthProvider } from "@/context/Authcontext";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin | Project Gameplan",
  description: "Project Gameplan Admin Dashboard",
};

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <ReactQueryProvider>
      <AuthProvider>
        <ProtectedRoute>
          <SidebarProvider>
            <AppSidebar />
            <main className="w-full min-h-svh bg-slate-50">
              <ProtectedTopbar />
              {children}
            </main>
          </SidebarProvider>
        </ProtectedRoute>
      </AuthProvider>
    </ReactQueryProvider>
  );
}
