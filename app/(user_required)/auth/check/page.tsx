import { headers } from "next/headers";
import type { Metadata } from "next";

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Please wait...",
};

export default async function CheckPage() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    // No session found. Redirect to sign-in.
    if (!session) redirect("/auth/sign-in");

    // Email is not verified. Redirect to pending enrollment.
    if (!session.user.emailVerified) redirect("/enrollment/pending");

    redirect("/dashboard");
}
