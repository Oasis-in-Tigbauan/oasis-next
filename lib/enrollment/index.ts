"use server";

import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import * as Sentry from "@sentry/nextjs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Failure, failureCodes, Success } from "@/lib/one-of";
import { invitations, office, officePosition } from "@/lib/db/schema";

export async function enroll(payload: EnrollmentRequirements) {
    // Apply the enrollment data
    try {
        // Check the eligibility first
        const [invitation] = await db
            .select({
                id: invitations.id,
                token: invitations.token,
                validUntil: invitations.validUntil,
                consumed: invitations.consumed,
                officeId: office.id,
                officeName: office.name,
            })
            .from(invitations)
            .where(eq(invitations.token, payload.token))
            .limit(1)
            .leftJoin(office, eq(office.id, invitations.officeId));
        if (!invitation) {
            return new Failure(failureCodes.Invalid, "Invalid token.");
        }

        const now = DateTime.utc().toJSDate();
        if (invitation.validUntil < now) {
            return new Failure(failureCodes.Invalid, "Token has expired.");
        }

        if (invitation.consumed) {
            return new Failure(failureCodes.Invalid, "Token has already been consumed.");
        }

        // Get the position
        const [position] = await db
            .select({ id: officePosition.id })
            .from(officePosition)
            .where(and(eq(officePosition.id, payload.positionId), eq(officePosition.officeId, invitation.officeId!)))
            .limit(1);
        if (!position) {
            return new Failure(failureCodes.Invalid, "Invalid position.");
        }

        await auth.api.signUpEmail({
            body: {
                name: payload.fullName,
                email: payload.email,
                password: payload.password,
                officeId: invitation.officeId!,
                officePositionId: position.id,
            },
        });

        // After enrollment, we need to consume the token.
        await db.update(invitations).set({ consumed: true }).where(eq(invitations.id, invitation.id));

        return new Success({ ok: true });
    } catch (e) {
        Sentry.captureException(e);
        return new Failure(failureCodes.Fatal, "An unexpected error occurred.");
    }
}

type EnrollmentRequirements = {
    fullName: string;
    email: string;
    password: string;
    positionId: string;
    token: string;
}
