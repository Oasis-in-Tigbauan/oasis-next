import { and, eq, ilike, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DateTime } from "luxon";

import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import { office, officePosition, travelOrders, user } from "@/lib/db/schema";
import { validatorUtilities } from "@/lib/validators";
import { type User } from "@/lib/accounts";

// ---------------------------------------------------------------------------
// Aliases for multi-join queries
// ---------------------------------------------------------------------------

const requestorUser = alias(user, "requestor_user");
const approverUser = alias(user, "approver_user");
const requestorOffice = alias(office, "requestor_office");
const requestorPosition = alias(officePosition, "requestor_position");
const approverPosition = alias(officePosition, "approver_position");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TravelOrderPayload = {
  status: string;
  category: string;
  startDate: string;
  endDate?: string;
  location: string;
  purpose: string;
  subjectToClaims: boolean;
  notes?: string;
};

export type TravelOrderItem = {
  id: string;
  refNumber: number;
  travelOrderStatus: string;
  date: string;
  requestor: BaseUserInfo;
  category: string;
  startDate: string;
  endDate?: string;
  noOfDays: number;
  location: string;
  purpose: string;
  time: string;
  subjectToClaims: boolean;
  notes?: string;
  approvedBy?: {
    id: string;
    name: string;
    position: {
      id: string;
      name: string;
    };
  };
};

export type BaseUserInfo = {
  id: string;
  name: string;
  office: {
    id: string;
    name: string;
  };
  officePosition: {
    id: string;
    name: string;
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts a UTC+8 ISO date string to a UTC JavaScript Date for database storage.
 *
 * @description
 * Parses the given string as an Asia/Manila timestamp and converts it to UTC.
 * Returns null when the input is absent or invalid.
 *
 * @param {string | undefined} value - The UTC+8 date string to convert.
 * @returns {Date | null} The corresponding UTC Date, or null when the input is absent or unparseable.
 */
function _toUtcDate(value: string | undefined): Date | null {
  if (!value) return null;
  const dt = DateTime.fromISO(value, { zone: "Asia/Manila" });
  if (!dt.isValid) return null;
  return dt.toUTC().toJSDate();
}

/**
 * Calculates the inclusive number of days between two dates (in Asia/Manila).
 *
 * @description
 * Strips the time portion from both dates before diffing. A single-day travel (no end date
 * or end equals start) returns 1.
 *
 * @param {Date} startDate - The travel start timestamp (stored as UTC).
 * @param {Date | null} endDate - The travel end timestamp (stored as UTC), or null for single-day.
 * @returns {number} The inclusive day count.
 */
function _calcNoOfDays(startDate: Date, endDate: Date | null): number {
  const start = DateTime.fromJSDate(startDate, { zone: "Asia/Manila" }).startOf("day");
  if (!endDate) return 1;
  const end = DateTime.fromJSDate(endDate, { zone: "Asia/Manila" }).startOf("day");
  return Math.round(end.diff(start, "days").days) + 1;
}

/**
 * Formats a UTC stored timestamp into a UTC+8 date string for API output.
 *
 * @description
 * Converts the given UTC Date to Asia/Manila timezone and returns an ISO 8601 string.
 *
 * @param {Date} date - The UTC Date to format.
 * @returns {string} The ISO string in UTC+8 (Asia/Manila) timezone.
 */
function _toManilaIso(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "UTC" }).setZone("Asia/Manila").toISO()!;
}

/**
 * Formats the time portion of a UTC stored timestamp into a UTC+8 human-readable time string.
 *
 * @description
 * Converts the given UTC Date to Asia/Manila timezone and returns the time as "h:mm a" (e.g. "9:00 AM").
 *
 * @param {Date} date - The UTC Date from which to extract the time.
 * @returns {string} The formatted time string in UTC+8.
 */
function _toManilaTime(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "UTC" }).setZone("Asia/Manila").toFormat("h:mm a");
}

/**
 * Maps a raw database row into a {@link TravelOrderItem} DTO.
 *
 * @description
 * Converts stored UTC timestamps to UTC+8 ISO strings for frontend consumption,
 * computes the inclusive day count, and assembles optional approver information.
 *
 * @param {object} row - A flat row returned by the multi-join getAll query.
 * @returns {TravelOrderItem} The assembled DTO.
 */
function _mapRow(row: {
  id: string;
  refNumber: number;
  travelOrderStatus: string;
  category: string;
  startDate: Date;
  endDate: Date | null;
  location: string;
  purpose: string;
  subjectToClaims: boolean;
  notes: string | null;
  createdAt: Date;
  requestorId: string | null;
  requestorName: string | null;
  requestorOfficeId: string | null;
  requestorOfficeName: string | null;
  requestorPositionId: string | null;
  requestorPositionName: string | null;
  approverId: string | null;
  approverName: string | null;
  approverPositionId: string | null;
  approverPositionName: string | null;
}): TravelOrderItem {
  const noOfDays = _calcNoOfDays(row.startDate, row.endDate);

  const item: TravelOrderItem = {
    id: row.id,
    refNumber: row.refNumber,
    travelOrderStatus: row.travelOrderStatus,
    date: _toManilaIso(row.createdAt),
    category: row.category,
    startDate: _toManilaIso(row.startDate),
    endDate: row.endDate ? _toManilaIso(row.endDate) : undefined,
    noOfDays,
    location: row.location,
    purpose: row.purpose,
    time: _toManilaTime(row.startDate),
    subjectToClaims: row.subjectToClaims,
    notes: row.notes ?? undefined,
    requestor: {
      id: row.requestorId ?? "",
      name: row.requestorName ?? "",
      office: {
        id: row.requestorOfficeId ?? "",
        name: row.requestorOfficeName ?? "",
      },
      officePosition: {
        id: row.requestorPositionId ?? "",
        name: row.requestorPositionName ?? "",
      },
    },
  };

  if (row.approverId && row.approverName && row.approverPositionId && row.approverPositionName) {
    item.approvedBy = {
      id: row.approverId,
      name: row.approverName,
      position: {
        id: row.approverPositionId,
        name: row.approverPositionName,
      },
    };
  }

  return item;
}

// ---------------------------------------------------------------------------
// Service Functions
// ---------------------------------------------------------------------------

/**
 * Fetches all travel orders with their requestor and approver details.
 *
 * @description
 * Returns all rows from `travel_orders` joined with the requestor user, requestor office,
 * requestor position, and (optionally) approver user and approver position. Results are ordered
 * by reference number ascending.
 *
 * On success, wraps the list in a {@link Success}. On unexpected failure, wraps the error in
 * a fatal {@link Failure}.
 *
 * @async
 * @function getAll
 * @returns {Promise<Result<TravelOrderItem[]>>} All travel orders on success, or a failure result on error.
 *
 * @remarks
 * - Returns an empty array when no records exist.
 */
export async function getAll(): Promise<Result<TravelOrderItem[]>> {
  try {
    const rows = await db
      .select({
        id: travelOrders.id,
        refNumber: travelOrders.refNumber,
        travelOrderStatus: travelOrders.travelOrderStatus,
        category: travelOrders.category,
        startDate: travelOrders.startDate,
        endDate: travelOrders.endDate,
        location: travelOrders.location,
        purpose: travelOrders.purpose,
        subjectToClaims: travelOrders.subjectToClaims,
        notes: travelOrders.notes,
        createdAt: travelOrders.createdAt,
        requestorId: requestorUser.id,
        requestorName: requestorUser.name,
        requestorOfficeId: requestorOffice.id,
        requestorOfficeName: requestorOffice.name,
        requestorPositionId: requestorPosition.id,
        requestorPositionName: requestorPosition.name,
        approverId: approverUser.id,
        approverName: approverUser.name,
        approverPositionId: approverPosition.id,
        approverPositionName: approverPosition.name,
      })
      .from(travelOrders)
      .leftJoin(requestorUser, eq(requestorUser.id, travelOrders.requestorId))
      .leftJoin(requestorOffice, eq(requestorOffice.id, travelOrders.requestorOfficeId))
      .leftJoin(requestorPosition, eq(requestorPosition.id, travelOrders.requestorPositionId))
      .leftJoin(approverUser, eq(approverUser.id, travelOrders.approverId))
      .leftJoin(approverPosition, eq(approverPosition.id, travelOrders.approverPositionId))
      .orderBy(travelOrders.refNumber);

    return new Success(rows.map(_mapRow));
  }
  catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to retrieve travel orders.", {}, e);
  }
}

/**
 * Fetches one travel order with requestor and approver details.
 *
 * @description
 * Reads the full joined travel-order record by ID and maps the stored UTC
 * timestamps to UTC+8 presentation values. Returns a not-found failure when
 * the travel order does not exist.
 *
 * @async
 * @function getById
 * @param {string} id - The UUID of the travel order to fetch.
 * @returns {Promise<Result<TravelOrderItem>>} Travel order on success, or failure.
 * @remarks This function does not perform permission checks; callers must verify access first.
 */
export async function getById(id: string): Promise<Result<TravelOrderItem>> {
  try {
    const row = await _fetchById(id);
    if (!row) {
      return new Failure(ErrorCodes.ResourceNotFound, "Travel order not found.", { id });
    }

    return new Success(_mapRow(row));
  }
  catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to retrieve travel order.", { id }, e);
  }
}

/**
 * Creates a new travel order for the given user.
 *
 * @description
 * Validates that the start date can be parsed and, when provided, that the end date is not
 * before the start date. Snapshots the requestor's office and position at the time of creation.
 * Converts the UTC+8 dates to UTC before persisting.
 *
 * On success, wraps the created travel order in a {@link Success}. On validation failure, returns
 * a {@link Failure} describing the problem. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function createTravelOrder
 * @param {TravelOrderPayload} payload - The travel order details to create.
 * @param {User} user - The user acting as the requestor (may be a delegated user when travel.write is present).
 * @returns {Promise<Result<TravelOrderItem>>} The created travel order on success, or a failure result on error.
 *
 * @remarks
 * - `startDate` and `endDate` are expected as UTC+8 ISO strings and converted to UTC for storage.
 * - The requestor's current office and position are snapshotted at creation time.
 */
export async function createTravelOrder(payload: TravelOrderPayload, user: User): Promise<Result<TravelOrderItem>> {
  try {
    const startUtc = _toUtcDate(payload.startDate);
    if (!startUtc) {
      return new Failure(ErrorCodes.ValidationFailure, "Invalid start date.", { payload });
    }

    const endUtc = payload.endDate ? _toUtcDate(payload.endDate) : null;
    if (payload.endDate && !endUtc) {
      return new Failure(ErrorCodes.ValidationFailure, "Invalid end date.", { payload });
    }

    if (endUtc && endUtc < startUtc) {
      return new Failure(ErrorCodes.ValidationFailure, "End date must not be before start date.", { payload });
    }

    const officeId = user.office.id;
    const positionId = user.office.role.id;

    if (!validatorUtilities.isExisty(officeId)) {
      return new Failure(ErrorCodes.ValidationFailure, "Requestor must be assigned to an office.", { userId: user.id });
    }

    if (!validatorUtilities.isExisty(positionId)) {
      return new Failure(ErrorCodes.ValidationFailure, "Requestor must have a position.", { userId: user.id });
    }

    const [inserted] = await db
      .insert(travelOrders)
      .values({
        travelOrderStatus: payload.status as "co-hr" | "filed" | "missing" | "cancelled",
        category: payload.category as "official" | "personal",
        startDate: startUtc,
        endDate: endUtc ?? undefined,
        location: payload.location,
        purpose: payload.purpose,
        subjectToClaims: payload.subjectToClaims,
        notes: payload.notes ?? null,
        requestorId: user.id,
        requestorOfficeId: officeId,
        requestorPositionId: positionId,
      })
      .returning({ id: travelOrders.id });

    if (!inserted) {
      return new Failure(ErrorCodes.Fatal, "Failed to insert travel order.", { payload });
    }

    const result = await _fetchById(inserted.id);
    if (!result) {
      return new Failure(ErrorCodes.ResourceNotFound, "Travel order not found after creation.", { id: inserted.id });
    }

    return new Success(_mapRow(result));
  }
  catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to create travel order.", { payload, userId: user.id }, e);
  }
}

/**
 * Updates an existing travel order by ID.
 *
 * @description
 * Only the fields present in the partial payload are updated. The requestor cannot be changed
 * after creation. Validates start/end dates when provided, ensuring the end date does not precede
 * the start date.
 *
 * On success, wraps the updated travel order in a {@link Success}. On validation or not-found failure,
 * returns an appropriate {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function updateTravelOrder
 * @param {string} id - The UUID of the travel order to update.
 * @param {Partial<TravelOrderPayload>} payload - The fields to update.
 * @param {User} user - The user performing the update (used for context in failure messages).
 * @returns {Promise<Result<TravelOrderItem>>} The updated travel order on success, or a failure result on error.
 *
 * @remarks
 * - Requestor identity (requestorId, requestorOfficeId, requestorPositionId) cannot be modified.
 * - When only one of startDate/endDate is provided, the other is fetched from the current record
 *   before running the date-order check.
 */
export async function updateTravelOrder(id: string, payload: Partial<TravelOrderPayload>, user: User): Promise<Result<TravelOrderItem>> {
  try {
    if (!validatorUtilities.isExisty(id)) {
      return new Failure(ErrorCodes.ValidationFailure, "Travel order ID is required.", { id });
    }

    const existing = await _fetchById(id);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Travel order not found.", { id });
    }

    const updateValues: Partial<{
      travelOrderStatus: "co-hr" | "filed" | "missing" | "cancelled";
      category: "official" | "personal";
      startDate: Date;
      endDate: Date | null;
      location: string;
      purpose: string;
      subjectToClaims: boolean;
      notes: string | null;
    }> = {};

    if (payload.status !== undefined) {
      updateValues.travelOrderStatus = payload.status as "co-hr" | "filed" | "missing" | "cancelled";
    }
    if (payload.category !== undefined) {
      updateValues.category = payload.category as "official" | "personal";
    }
    if (payload.location !== undefined) {
      updateValues.location = payload.location;
    }
    if (payload.purpose !== undefined) {
      updateValues.purpose = payload.purpose;
    }
    if (payload.subjectToClaims !== undefined) {
      updateValues.subjectToClaims = payload.subjectToClaims;
    }
    if (payload.notes !== undefined) {
      updateValues.notes = payload.notes ?? null;
    }

    // Resolve start/end dates for the update and cross-field validation.
    const resolvedStart = payload.startDate ? _toUtcDate(payload.startDate) : existing.startDate;
    const resolvedEnd = payload.endDate !== undefined
      ? _toUtcDate(payload.endDate)
      : existing.endDate;

    if (payload.startDate !== undefined) {
      if (!resolvedStart) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid start date.", { payload });
      }
      updateValues.startDate = resolvedStart;
    }

    if (payload.endDate !== undefined) {
      if (payload.endDate && !resolvedEnd) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid end date.", { payload });
      }
      updateValues.endDate = resolvedEnd;
    }

    if (resolvedStart && resolvedEnd && resolvedEnd < resolvedStart) {
      return new Failure(ErrorCodes.ValidationFailure, "End date must not be before start date.", { payload });
    }

    if (Object.keys(updateValues).length === 0) {
      return new Success(_mapRow(existing));
    }

    await db
      .update(travelOrders)
      .set(updateValues)
      .where(eq(travelOrders.id, id));

    const updated = await _fetchById(id);
    if (!updated) {
      return new Failure(ErrorCodes.ResourceNotFound, "Travel order not found after update.", { id });
    }

    return new Success(_mapRow(updated));
  }
  catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to update travel order.", { id, payload, userId: user.id }, e);
  }
}

/**
 * Deletes a travel order by ID.
 *
 * @description
 * Permanently removes the travel order record. Returns a not-found failure when the ID does not
 * match any existing record.
 *
 * On success, wraps null in a {@link Success}. On not-found or unexpected failure, returns the
 * appropriate {@link Failure}.
 *
 * @async
 * @function deleteTravelOrder
 * @param {string} id - The UUID of the travel order to delete.
 * @returns {Promise<Result<null>>} Null on success, or a failure result on error.
 */
export async function deleteTravelOrder(id: string): Promise<Result<null>> {
  try {
    if (!validatorUtilities.isExisty(id)) {
      return new Failure(ErrorCodes.ValidationFailure, "Travel order ID is required.", { id });
    }

    const [deleted] = await db
      .delete(travelOrders)
      .where(eq(travelOrders.id, id))
      .returning({ id: travelOrders.id });

    if (!deleted) {
      return new Failure(ErrorCodes.ResourceNotFound, "Travel order not found.", { id });
    }

    return new Success(null);
  }
  catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to delete travel order.", { id }, e);
  }
}

/**
 * Records the approval of a travel order by setting the approver's identity.
 *
 * @description
 * Sets `approverId` to the approving user's ID and `approverPositionId` to the approving user's
 * current position. Returns a not-found failure when the travel order does not exist.
 *
 * On success, wraps the updated travel order in a {@link Success}. On not-found or unexpected
 * failure, returns the appropriate {@link Failure}.
 *
 * @async
 * @function approveTravelOrder
 * @param {string} id - The UUID of the travel order to approve.
 * @param {User} user - The approving user; their current position is recorded as the approver position.
 * @returns {Promise<Result<TravelOrderItem>>} The approved travel order on success, or a failure result on error.
 *
 * @remarks
 * - The approver's position is derived from `user.office.role.id` at the time of approval.
 */
export async function approveTravelOrder(id: string, user: User): Promise<Result<TravelOrderItem>> {
  try {
    if (!validatorUtilities.isExisty(id)) {
      return new Failure(ErrorCodes.ValidationFailure, "Travel order ID is required.", { id });
    }

    const existing = await _fetchById(id);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Travel order not found.", { id });
    }

    await db
      .update(travelOrders)
      .set({
        approverId: user.id,
        approverPositionId: user.office.role.id,
      })
      .where(eq(travelOrders.id, id));

    const updated = await _fetchById(id);
    if (!updated) {
      return new Failure(ErrorCodes.ResourceNotFound, "Travel order not found after approval.", { id });
    }

    return new Success(_mapRow(updated));
  }
  catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to approve travel order.", { id, userId: user.id }, e);
  }
}

/**
 * Searches for active, non-banned users whose name or email matches the query.
 *
 * @description
 * Performs a case-insensitive partial match (`ilike`) against both `user.name` and `user.email`.
 * Only users that are email-verified, not banned, and not shadow-banned are returned.
 * Results are limited to 20 rows and include the user's office and position details.
 *
 * On success, wraps the list in a {@link Success}. On unexpected failure, wraps the error in a
 * fatal {@link Failure}.
 *
 * @async
 * @function searchUsers
 * @param {string} query - The search string to match against user names and emails.
 * @returns {Promise<Result<BaseUserInfo[]>>} Matching users on success, or a failure result on error.
 *
 * @remarks
 * - Returns an empty array when the query is blank.
 * - Results are limited to 20 users.
 */
export async function searchUsers(query: string): Promise<Result<BaseUserInfo[]>> {
  try {
    const trimmed = query.trim();
    if (!trimmed) return new Success([]);

    const wildcard = `%${trimmed}%`;

    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        officeId: office.id,
        officeName: office.name,
        positionId: officePosition.id,
        positionName: officePosition.name,
      })
      .from(user)
      .where(
        and(
          eq(user.emailVerified, true),
          eq(user.banned, false),
          eq(user.shadowBanned, false),
          or(
            ilike(user.name, wildcard),
            ilike(user.email, wildcard),
          ),
        ),
      )
      .leftJoin(officePosition, eq(officePosition.id, user.officePositionId))
      .leftJoin(office, eq(office.id, user.officeId))
      .limit(20);

    return new Success(
      rows.map(r => ({
        id: r.id,
        name: r.name,
        office: {
          id: r.officeId ?? "",
          name: r.officeName ?? "",
        },
        officePosition: {
          id: r.positionId ?? "",
          name: r.positionName ?? "",
        },
      })),
    );
  }
  catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to search users.", { query }, e);
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Fetches a single travel order row with all joined fields by ID.
 *
 * @description
 * Used internally after insert/update/approve operations to re-read the full record
 * with all joined columns needed for the {@link TravelOrderItem} DTO.
 *
 * @param {string} id - The UUID of the travel order to fetch.
 * @returns {Promise<object | null>} The raw joined row, or null when not found.
 */
async function _fetchById(id: string) {
  const [row] = await db
    .select({
      id: travelOrders.id,
      refNumber: travelOrders.refNumber,
      travelOrderStatus: travelOrders.travelOrderStatus,
      category: travelOrders.category,
      startDate: travelOrders.startDate,
      endDate: travelOrders.endDate,
      location: travelOrders.location,
      purpose: travelOrders.purpose,
      subjectToClaims: travelOrders.subjectToClaims,
      notes: travelOrders.notes,
      createdAt: travelOrders.createdAt,
      requestorId: requestorUser.id,
      requestorName: requestorUser.name,
      requestorOfficeId: requestorOffice.id,
      requestorOfficeName: requestorOffice.name,
      requestorPositionId: requestorPosition.id,
      requestorPositionName: requestorPosition.name,
      approverId: approverUser.id,
      approverName: approverUser.name,
      approverPositionId: approverPosition.id,
      approverPositionName: approverPosition.name,
    })
    .from(travelOrders)
    .leftJoin(requestorUser, eq(requestorUser.id, travelOrders.requestorId))
    .leftJoin(requestorOffice, eq(requestorOffice.id, travelOrders.requestorOfficeId))
    .leftJoin(requestorPosition, eq(requestorPosition.id, travelOrders.requestorPositionId))
    .leftJoin(approverUser, eq(approverUser.id, travelOrders.approverId))
    .leftJoin(approverPosition, eq(approverPosition.id, travelOrders.approverPositionId))
    .where(eq(travelOrders.id, id))
    .limit(1);

  return row ?? null;
}
