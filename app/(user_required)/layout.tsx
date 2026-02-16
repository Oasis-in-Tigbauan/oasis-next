import { headers } from "next/headers";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export default async function AuthenticatedLayout({ children }: { children: ReactNode}) {
    const session = await auth.api.getSession({
        headers:  await headers(),
    });

    // No account found.
    if (!session) return redirect("/auth/signin");

    return (
        <>{children}</>
    );
}
