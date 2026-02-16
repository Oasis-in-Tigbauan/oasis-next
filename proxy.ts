import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { ExceptionResponseComposer } from "@/lib/http/ResponseComposer";
import { StatusCodes } from "@/lib/http/StatusCodes";

export async function proxy(req: NextRequest) {
    const path = req.nextUrl.pathname;
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    // Declare public routes:
    const isPublic =
        // Specific API routes
        path === "/api/enrollment/eligibility" ||
        path === "/api/enrollment/enroll" ||
        path === "/api/auth/sign-in" ||
        path === "/api/auth/sign-out";

    // Not authenticated.
    if (!isPublic && !session) {
        return ExceptionResponseComposer.compose(StatusCodes.Status401Unauthorized, [{ message: "Unauthorized" }])
            .orchestrate();
    }

    // Passed, next.
    return NextResponse.next();
}

export const config = {
    matcher: [
        "/api/:path*",
    ],
};
