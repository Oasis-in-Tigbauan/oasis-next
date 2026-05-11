import type { ReactNode } from "react";
import { redirect, RedirectType } from "next/navigation";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permissions from "@/lib/db/permissions";

export default async function LbacOfficeGroupLayout({ children }: { children: ReactNode }) {
  const session = await auth.verify([
    permissions.LBAC_OFFICE_READ,
    permissions.LBAC_OFFICE_WRITE,
  ]);

  // Redirect back to the dashboard if not verified.
  if (session.redirectTo) {
    return redirect(session.redirectTo, RedirectType.replace);
  }

  // Invalid sessions
  if (session.code !== SessionCode.Ok) {
    return redirect("/auth/signin");
  }

  return (<>{children}</>);
}
