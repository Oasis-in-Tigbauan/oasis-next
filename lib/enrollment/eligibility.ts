"use server";

import { DateTime } from "luxon";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { invitations, office, officePosition } from "@/lib/db/schema";
import { singles } from "@/lib/validators";
import { Failure, failureCodes, Success } from "@/lib/one-of";

export async function getEligibility(token: string) {
    const validation = await singles.isNonEmptyString(token);
    if (!validation.ok) {
        return new Failure(failureCodes.Invalid, validation.error!);
    }

    // Detect the token from the database
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
        .where(eq(invitations.token, token))
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

    const assignablePositions = await db
        .select({ id: officePosition.id, name: officePosition.name })
        .from(officePosition)
        .where(eq(officePosition.officeId, invitation.officeId!));

    return new Success({
        id: invitation.id,
        token: invitation.token,
        officeId: invitation.officeId,
        officeName: invitation.officeName,
        assignablePositions,
    });
}
