import type { ReactNode } from "react";
import { redirect, RedirectType } from "next/navigation";

import { session as auth } from "@/lib/auth";

export default async function BannedUsersGroupLayout({ children }: { children: ReactNode}) {
  const session = await auth.verify();

  // Redirect back to the dashboard if not verified.
  if (!session) redirect("/auth/signin");

  if (!session.user.banned) {
    redirect("/auth/check", RedirectType.replace);
  }

  return (<>{children}</>);
}
