import { session as auth } from "@/lib/auth";
import { redirect, RedirectType } from "next/navigation";

export default async function CheckPage() {
  const session = await auth.verify();

  // No session found. Redirect to sign-in.
  if (!session) redirect("/auth/signin");

  if (session.redirectTo) {
    redirect(session.redirectTo, RedirectType.replace);
  }

  redirect("/dashboard");
}
