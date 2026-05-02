import type { ReactNode } from "react";
import { redirect, RedirectType } from "next/navigation";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permissions from "@/lib/db/permissions";

export default async function AccountApprovalUsersGroupLayout({ children }: { children: ReactNode }) {
  const session = await auth.verify([
    permissions.OBR_DISBURSEMENT_CREATE,
    permissions.OBR_APPROVER_BASIC_HIGH_WRITE,
  ], "or");

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
