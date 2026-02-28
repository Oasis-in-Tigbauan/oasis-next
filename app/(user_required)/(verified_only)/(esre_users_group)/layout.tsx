import type { ReactNode } from "react";
import { redirect, RedirectType } from "next/navigation";

import { session as auth } from "@/lib/auth";
import * as permissions from "@/lib/db/permissions";

export default async function EsreUsersGroupLayout({ children }: { children: ReactNode}) {
  const session = await auth.verify([
    permissions.ESRE_READ,
  ]);

  // Redirect back to the dashboard if not verified.
  if (!session) redirect("/auth/signin");
  if (session.redirectTo) {
    redirect(session.redirectTo, RedirectType.replace);
  }

  return (<>{children}</>);
}
