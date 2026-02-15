"use server";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { Failure, failureCodes, Success } from "@/lib/one-of";
import { officePosition } from "@/lib/db/schema";
import { singles } from "@/lib/validators";

export async function getAssignablePositionsByOfficeId(officeId: string) {
    // Validate Entry
    const validation = await singles.isNonEmptyString(officeId)
        && await singles.isUuid(officeId);
    if (!validation.ok) {
        return new Failure(failureCodes.Invalid, validation.error!);
    }

    // Find the positions by office
    const result = await db
        .select({
            id: officePosition.id,
            name: officePosition.name,
        })
        .from(officePosition)
        .where(eq(officePosition.officeId, officeId));
    return new Success(result);
}
