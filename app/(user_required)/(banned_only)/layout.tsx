import type { ReactNode } from "react";
import { redirect, RedirectType } from "next/navigation";

import { session as auth, SessionCode } from "@/lib/auth";

export default async function BannedUsersGroupLayout({ children }: { children: ReactNode}) {
  const session = await auth.verify();

  // No valid session → sign in
  if (session.code === SessionCode.SessionInvalid) {
    return redirect("/auth/signin");
  }

  // Non-banned users don't belong here
  if (!session.user?.banned) {
    return redirect("/auth/check", RedirectType.replace);
  }

  return (<>{children}</>);
}
