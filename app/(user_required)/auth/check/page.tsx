import { session as auth } from "@/lib/auth";
import { redirect, RedirectType } from "next/navigation";

export default async function CheckPage() {
  const session = await auth.verify();
  if (session.redirectTo) {
    redirect(session.redirectTo, RedirectType.replace);
  }

  redirect("/dashboard");
}
