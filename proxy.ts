import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";

export async function proxy(req: NextRequest) {
    const path = req.nextUrl.pathname;
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    // Declare public routes:
    const isPublic =
        // Exact match for /enrollment
        path === "/enrollment" ||
        // All auth routes (/auth/sign-in, /auth/sign-up, etc.)
        path === "/auth/signin" ||
        // Specific API routes
        path === "/api/enrollment/eligibility" ||
        path === "/api/enrollment/enroll";

    // Redirect to log in if not authenticated.
    if (!isPublic && !session) {
        return NextResponse.redirect(new URL("/auth/signin", req.url));
    }

    if (session && !session.user.emailVerified) {
        // Allowed paths for unverified users
        if (!isPublic && path !== "/enrollment/pending") {
            return NextResponse.redirect(new URL("/enrollment/pending", req.url));
        }
    }

    // Passed, next.
    return NextResponse.next();
}

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        // Always run for API routes
        "/(api|trpc)(.*)",
    ],
};
