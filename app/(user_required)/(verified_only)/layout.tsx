import type { ReactNode } from "react";
import { redirect, RedirectType } from "next/navigation";

import { session as auth, SessionCode } from "@/lib/auth";

import AppSidebar from "@/components/app-sidebar";
import AppTopbar from "@/components/app-topbar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

export default async function VerifiedLayout({ children }: { children: ReactNode}) {
  const session = await auth.verify();

  if (session.redirectTo) {
    return redirect(session.redirectTo, RedirectType.replace);
  }

  // Invalid sessions
  if (session.code !== SessionCode.Ok) {
    return redirect("/auth/signin");
  }

  return (
    <SidebarProvider>
      <AppSidebar user={session.user!} />
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <AppTopbar />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
