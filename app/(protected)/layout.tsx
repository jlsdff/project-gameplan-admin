import AppSidebar from "@/components/app-sidebar/AppSidebar";
import ProtectedRoute from "@/components/auth/protected";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
    <AuthProvider>
      <ProtectedRoute>
        <SidebarProvider>
          <AppSidebar />
          <main className="w-full">
            <SidebarTrigger />
            {children}
          </main>
        </SidebarProvider>
      </ProtectedRoute>
    </AuthProvider>
  );
}
