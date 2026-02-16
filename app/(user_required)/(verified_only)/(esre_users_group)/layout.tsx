import { headers } from "next/headers";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import * as permissions from "@/lib/db/permissions";
import { requirePermissionByUser } from "@/lib/accounts";

export default async function EsreUsersGroupLayout({ children }: { children: ReactNode}) {
    const session = await auth.api.getSession({
        headers:  await headers(),
    });

    // Require esre.read permission.
    const validate = await requirePermissionByUser(session?.user?.id ?? "", [
        permissions.ESRE_READ,
    ]);

    // Redirect back to the dashboard if not verified.
    if (!validate) redirect("/dashboard");

    return (<>{children}</>);
}
