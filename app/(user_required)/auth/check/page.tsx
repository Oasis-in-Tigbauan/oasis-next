import { session as auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CheckPage() {
  const session = await auth.verify();

  // No session found. Redirect to sign-in.
  if (!session) redirect("/auth/sign-in");

  // Email is not verified. Redirect to pending enrollment.
  if (!session.user.activated) redirect("/enrollment/pending");

  redirect("/dashboard");
}
