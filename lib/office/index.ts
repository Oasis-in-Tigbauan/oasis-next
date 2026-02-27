import { eq, not } from "drizzle-orm";

import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import { office } from "@/lib/db/schema";

/**
 * Retrieves the list of offices that can be assigned to users (i.e., selectable for enrollment/administration),
 * excluding the administrators office.
 *
 * @returns A `Result` containing an array of assignable offices on success, or a fatal `Failure` if the lookup fails unexpectedly.
 *
 * @remarks
 * - The administrators office is intentionally excluded to prevent assigning users to that office via normal flows.
 * - The returned office objects contain only basic identifying fields suitable for selection UIs.
 */
export async function getAssignableOffices(): Promise<Result<Array<Office>>> {
  try {
    const offices = await db
      .select({
        id: office.id,
        name: office.name,
      })
      .from(office)
      .where(not(eq(office.name, "Cardinal Administrators")));

    return new Success(offices);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to get assignable offices.", {}, e);
  }
}

type Office = {
  id: string;
  name: string;
}
