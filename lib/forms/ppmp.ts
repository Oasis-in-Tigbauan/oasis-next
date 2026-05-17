import { eq, inArray } from "drizzle-orm";
import { DateTime } from "luxon";

import { db } from "@/lib/db";
import {
  lbacItems,
  ppmp,
  ppmpMajorGroup,
  ppmpMinorGroup,
  ppmpProjectGroup,
  saaobEntries,
} from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import * as casts from "@/lib/types/casts";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Discriminates which level of the PPMP hierarchy an item belongs to.
 *
 * @enum {number}
 */
export enum ParentType {
  /** Item is a direct child of a minor group. */
  Minor = 6700,
  /** Item is a direct child of a project group. */
  Project = 6701,
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ItemPayload = {
  generalDescription?: string;
  typeOfProject: string;
  quantityOrSize: string;
  recommendedModeOfProcurement?: string;
  eligibleForPreProcurementConference?: boolean;
  /** UTC+8 ISO date string — converted to UTC before writing to DB. */
  startOfProcurementActivity: string;
  /** UTC+8 ISO date string — converted to UTC before writing to DB. */
  endOfProcurementActivity: string;
  /** UTC+8 ISO date string — converted to UTC before writing to DB. */
  expectedDeliveryPeriod: string;
  /** Optional SAAOB ID. When omitted, the major group's SAAOB is inherited. */
  saaobId?: string;
  estimatedBudget: string;
  attachedSupportingDocuments?: string;
  remarks?: string;
};

export type BaseMajorGroupItem = {
  id: string;
  saaob: {
    id: string;
    name: string;
  };
};

export type MajorGroupItem = {
  children: Array<MinorGroupItem>;
} & BaseMajorGroupItem;

export type BaseMinorGroupItem = {
  id: string;
  lbac: {
    id: string;
    name: string;
  };
};

export type MinorGroupItem = {
  children: Array<ProjectGroupItem | PlanItem>;
} & BaseMinorGroupItem;

export type BaseProjectGroupItem = {
  id: string;
  title: string;
};

export type ProjectGroupItem = {
  children: Array<PlanItem>;
} & BaseProjectGroupItem;

export type PlanItem = {
  id: string;
  generalDescription: Optional<string>;
  typeOfProject: string;
  quantityOrSize: string;
  recommendedModeOfProcurement: Optional<string>;
  eligibleForPreProcurementConference: boolean;
  /** Full month name in UTC+8, e.g. "January". */
  startOfProcurementActivity: string;
  /** Full month name in UTC+8, e.g. "February". */
  endOfProcurementActivity: string;
  /** Full month name in UTC+8, e.g. "March". */
  expectedDeliveryPeriod: string;
  saaob: {
    id: string;
    name: string;
  };
  estimatedBudget: string;
  attachedSupportingDocuments: Optional<string>;
  remarks: Optional<string>;
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Parses a UTC+8 ISO date string and converts it to a UTC {@link Date}.
 *
 * @description
 * Interprets the provided string in the `Asia/Manila` timezone using Luxon
 * and returns the equivalent UTC JS `Date`. Returns `null` when the string is
 * not a valid ISO date.
 *
 * @function _parseManilaDateToUtc
 * @param {string} date - UTC+8 ISO date string to parse.
 * @returns {Date | null} The UTC `Date` object, or `null` when parsing fails.
 */
function _parseManilaDateToUtc(date: string): Date | null {
  const dt = DateTime.fromISO(date, { zone: "Asia/Manila" });
  if (!dt.isValid) return null;
  return dt.toUTC().toJSDate();
}

/**
 * Formats a UTC JS `Date` as the full month name in UTC+8.
 *
 * @description
 * Converts the provided UTC `Date` to the `Asia/Manila` timezone using Luxon
 * and returns the full month name (e.g. `"January"`).
 *
 * @function _formatDateToMonthName
 * @param {Date} date - UTC date to format.
 * @returns {string} Full month name in UTC+8.
 */
function _formatDateToMonthName(date: Date): string {
  return DateTime.fromJSDate(date).setZone("Asia/Manila").toFormat("LLLL");
}

/**
 * Maps a raw `ppmp` DB row into a {@link PlanItem} response shape.
 *
 * @description
 * Formats all three date columns into full month names in UTC+8 and resolves
 * the SAAOB reference from the provided map entry.
 *
 * @function _mapToPlanItem
 * @param {RawPpmpRow} row - Raw item row from the database.
 * @param {{ id: string; name: string }} saaob - Resolved SAAOB reference for this item.
 * @returns {PlanItem} The mapped plan item.
 */
function _mapToPlanItem(
  row: RawPpmpRow,
  saaob: { id: string; name: string },
): PlanItem {
  return {
    id: row.id,
    generalDescription: row.generalDescription ?? null,
    typeOfProject: row.typeOfProject,
    quantityOrSize: row.quantityOrSize,
    recommendedModeOfProcurement: row.recommendedModeOfProcurement ?? null,
    eligibleForPreProcurementConference: row.eligibleForPreProcurementConference,
    startOfProcurementActivity: _formatDateToMonthName(row.startOfProcurementActivity),
    endOfProcurementActivity: _formatDateToMonthName(row.endOfProcurementActivity),
    expectedDeliveryPeriod: _formatDateToMonthName(row.expectedDeliveryPeriod),
    saaob,
    estimatedBudget: row.estimatedBudget,
    attachedSupportingDocuments: row.attachedSupportingDocuments ?? null,
    remarks: row.remarks ?? null,
  };
}

/** Shape of a raw DB row read from the `ppmp` table. */
type RawPpmpRow = {
  id: string;
  generalDescription: string | null;
  typeOfProject: "goods" | "infra" | "cons-serv";
  quantityOrSize: string;
  recommendedModeOfProcurement: string | null;
  eligibleForPreProcurementConference: boolean;
  startOfProcurementActivity: Date;
  endOfProcurementActivity: Date;
  expectedDeliveryPeriod: Date;
  saaobId: string | null;
  estimatedBudget: string;
  attachedSupportingDocuments: string | null;
  remarks: string | null;
  minorGroupId: string | null;
  projectGroupId: string | null;
};

// ---------------------------------------------------------------------------
// Public service methods
// ---------------------------------------------------------------------------

/**
 * Returns the full PPMP tree as a list of major groups with nested children.
 *
 * @description
 * Fetches all major groups (with SAAOB details), minor groups (with LBAC
 * details), project groups, and plan items in parallel. Assembles the results
 * into a nested tree. Plan items that do not carry their own `saaobId` inherit
 * the SAAOB from their ancestor major group by traversing the minor-group →
 * major-group chain in memory.
 *
 * On success, wraps the tree in a {@link Success}. On unexpected failure, wraps
 * the error in a fatal {@link Failure}.
 *
 * @async
 * @function getAll
 * @returns {Promise<Result<MajorGroupItem[]>>} The full PPMP tree on success,
 *                                               or a failure result on error.
 *
 * @remarks
 * - Returns an empty array when no major groups exist.
 * - SAAOB inheritance walks: item → minorGroup → majorGroup.
 * - Items with `projectGroupId` walk an extra hop: item → projectGroup → minorGroup → majorGroup.
 */
export async function getAll(): Promise<Result<MajorGroupItem[]>> {
  try {
    const [majorRows, minorRows, projectRows, itemRows] = await Promise.all([
      db
        .select({
          id: ppmpMajorGroup.id,
          saaobId: saaobEntries.id,
          saaobName: saaobEntries.name,
        })
        .from(ppmpMajorGroup)
        .innerJoin(saaobEntries, eq(saaobEntries.id, ppmpMajorGroup.saaobId)),

      db
        .select({
          id: ppmpMinorGroup.id,
          parentId: ppmpMinorGroup.parentId,
          lbacId: lbacItems.id,
          lbacName: lbacItems.mfoPpa,
        })
        .from(ppmpMinorGroup)
        .innerJoin(lbacItems, eq(lbacItems.id, ppmpMinorGroup.lbacId)),

      db
        .select({
          id: ppmpProjectGroup.id,
          title: ppmpProjectGroup.title,
          parentId: ppmpProjectGroup.parentId,
        })
        .from(ppmpProjectGroup),

      db
        .select({
          id: ppmp.id,
          generalDescription: ppmp.generalDescription,
          typeOfProject: ppmp.typeOfProject,
          quantityOrSize: ppmp.quantityOrSize,
          recommendedModeOfProcurement: ppmp.recommendedModeOfProcurement,
          eligibleForPreProcurementConference: ppmp.eligibleForPreProcurementConference,
          startOfProcurementActivity: ppmp.startOfProcurementActivity,
          endOfProcurementActivity: ppmp.endOfProcurementActivity,
          expectedDeliveryPeriod: ppmp.expectedDeliveryPeriod,
          saaobId: ppmp.saaobId,
          estimatedBudget: ppmp.estimatedBudget,
          attachedSupportingDocuments: ppmp.attachedSupportingDocuments,
          remarks: ppmp.remarks,
          minorGroupId: ppmp.minorGroupId,
          projectGroupId: ppmp.projectGroupId,
        })
        .from(ppmp),
    ]);

    if (majorRows.length === 0) return new Success([]);

    // Build lookup maps
    const majorMap = new Map(majorRows.map(m => [m.id, m]));
    const minorMap = new Map(minorRows.map(m => [m.id, m]));
    const projectMap = new Map(projectRows.map(p => [p.id, p]));

    // Resolve saaob for each item (own saaobId or inherit from major group)
    const itemsWithOwnSaaob = itemRows.filter(i => i.saaobId !== null);
    let saaobOverrideMap: Map<string, { id: string; name: string }>;
    if (itemsWithOwnSaaob.length > 0) {
      // The IDs are already in saaobEntries — majorRows join covers the major-group ones.
      // We need names for item-level overrides too; fetch those now.
      const overrideIds = [...new Set(itemsWithOwnSaaob.map(i => i.saaobId!))];
      const overrideRows = await db
        .select({ id: saaobEntries.id, name: saaobEntries.name })
        .from(saaobEntries)
        .where(inArray(saaobEntries.id, overrideIds));
      saaobOverrideMap = new Map(overrideRows.map(r => [r.id, r]));
    } else {
      saaobOverrideMap = new Map<string, { id: string; name: string }>();
    }

    /**
     * Resolves the effective SAAOB for a plan item by walking the parent chain.
     *
     * @function _resolveSaaob
     * @param {RawPpmpRow} item - The plan item whose SAAOB should be resolved.
     * @returns {{ id: string; name: string } | null} The SAAOB entry, or null if not resolvable.
     */
    function _resolveSaaob(item: RawPpmpRow): { id: string; name: string } | null {
      // Own saaobId takes priority
      if (item.saaobId) {
        const own = saaobOverrideMap.get(item.saaobId);
        if (own) return own;
      }

      // Walk up to minor group → major group
      let minorId: string | null = item.minorGroupId;
      if (!minorId && item.projectGroupId) {
        const pg = projectMap.get(item.projectGroupId);
        if (pg) minorId = pg.parentId;
      }

      if (!minorId) return null;
      const minor = minorMap.get(minorId);
      if (!minor) return null;

      const major = majorMap.get(minor.parentId);
      if (!major) return null;

      return { id: major.saaobId, name: major.saaobName };
    }

    // Group items by their direct parent key
    const itemsByMinor = new Map<string, PlanItem[]>();
    const itemsByProject = new Map<string, PlanItem[]>();

    for (const item of itemRows) {
      const saaob = _resolveSaaob(item as RawPpmpRow);
      if (!saaob) continue; // skip orphaned items with no resolvable saaob

      const planItem = _mapToPlanItem(item as RawPpmpRow, saaob);

      if (item.minorGroupId) {
        const existing = itemsByMinor.get(item.minorGroupId) ?? [];
        existing.push(planItem);
        itemsByMinor.set(item.minorGroupId, existing);
      } else if (item.projectGroupId) {
        const existing = itemsByProject.get(item.projectGroupId) ?? [];
        existing.push(planItem);
        itemsByProject.set(item.projectGroupId, existing);
      }
    }

    // Build project group nodes
    const projectNodesByMinor = new Map<string, ProjectGroupItem[]>();
    for (const pg of projectRows) {
      const node: ProjectGroupItem = {
        id: pg.id,
        title: pg.title,
        children: itemsByProject.get(pg.id) ?? [],
      };
      const existing = projectNodesByMinor.get(pg.parentId) ?? [];
      existing.push(node);
      projectNodesByMinor.set(pg.parentId, existing);
    }

    // Build minor group nodes
    const minorNodesByMajor = new Map<string, MinorGroupItem[]>();
    for (const minor of minorRows) {
      const directItems: Array<ProjectGroupItem | PlanItem> = [
        ...(projectNodesByMinor.get(minor.id) ?? []),
        ...(itemsByMinor.get(minor.id) ?? []),
      ];

      const node: MinorGroupItem = {
        id: minor.id,
        lbac: { id: minor.lbacId, name: minor.lbacName },
        children: directItems,
      };

      const existing = minorNodesByMajor.get(minor.parentId) ?? [];
      existing.push(node);
      minorNodesByMajor.set(minor.parentId, existing);
    }

    // Build major group nodes
    const tree: MajorGroupItem[] = majorRows.map(major => ({
      id: major.id,
      saaob: { id: major.saaobId, name: major.saaobName },
      children: minorNodesByMajor.get(major.id) ?? [],
    }));

    return new Success(tree);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to retrieve PPMP data.", {}, e);
  }
}

/**
 * Creates a new PPMP major group linked to a SAAOB entry.
 *
 * @description
 * Verifies that the referenced SAAOB entry exists, then inserts a new
 * {@link ppmpMajorGroup} row and returns the created item with its SAAOB details.
 *
 * On success, wraps the created major group in a {@link Success}. When the
 * SAAOB entry does not exist, returns a resource-not-found {@link Failure}.
 * On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function createMajorGroup
 * @param {string} saaobId - Identifier of the SAAOB entry to associate.
 * @returns {Promise<Result<BaseMajorGroupItem>>} The created major group on success, or a failure result on error.
 */
export async function createMajorGroup(saaobId: string): Promise<Result<BaseMajorGroupItem>> {
  try {
    const [saaob] = await db
      .select({ id: saaobEntries.id, name: saaobEntries.name })
      .from(saaobEntries)
      .where(eq(saaobEntries.id, saaobId))
      .limit(1);

    if (!saaob) {
      return new Failure(ErrorCodes.ResourceNotFound, "SAAOB entry not found.", { saaobId });
    }

    const [created] = await db
      .insert(ppmpMajorGroup)
      .values({ saaobId: saaob.id })
      .returning({ id: ppmpMajorGroup.id });

    return new Success({ id: created.id, saaob: { id: saaob.id, name: saaob.name } });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create major group.", { saaobId }, e);
  }
}

/**
 * Creates a new PPMP minor group nested under a major group.
 *
 * @description
 * Verifies that both the parent major group and the referenced LBAC item exist,
 * then inserts a new {@link ppmpMinorGroup} row and returns the created item
 * with its LBAC details.
 *
 * On success, wraps the created minor group in a {@link Success}. When either
 * the parent or LBAC item does not exist, returns a resource-not-found
 * {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function createMinorGroup
 * @param {string} parentId - Identifier of the parent {@link ppmpMajorGroup}.
 * @param {string} lbacId - Identifier of the {@link lbacItems} entry to associate.
 * @returns {Promise<Result<BaseMinorGroupItem>>} The created minor group on success, or a failure result on error.
 */
export async function createMinorGroup(parentId: string, lbacId: string): Promise<Result<BaseMinorGroupItem>> {
  try {
    const [[parent], [lbac]] = await Promise.all([
      db
        .select({ id: ppmpMajorGroup.id })
        .from(ppmpMajorGroup)
        .where(eq(ppmpMajorGroup.id, parentId))
        .limit(1),
      db
        .select({ id: lbacItems.id, name: lbacItems.mfoPpa })
        .from(lbacItems)
        .where(eq(lbacItems.id, lbacId))
        .limit(1),
    ]);

    if (!parent) {
      return new Failure(ErrorCodes.ResourceNotFound, "Major group not found.", { parentId });
    }
    if (!lbac) {
      return new Failure(ErrorCodes.ResourceNotFound, "LBAC item not found.", { lbacId });
    }

    const [created] = await db
      .insert(ppmpMinorGroup)
      .values({ parentId: parent.id, lbacId: lbac.id })
      .returning({ id: ppmpMinorGroup.id });

    return new Success({ id: created.id, lbac: { id: lbac.id, name: lbac.name } });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create minor group.", { parentId, lbacId }, e);
  }
}

/**
 * Creates a new PPMP project group nested under a minor group.
 *
 * @description
 * Verifies that the referenced minor group exists, then inserts a new
 * {@link ppmpProjectGroup} row with the supplied title and returns the created item.
 *
 * On success, wraps the created project group in a {@link Success}. When the
 * parent minor group does not exist, returns a resource-not-found {@link Failure}.
 * On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function createProjectGroup
 * @param {string} parentId - Identifier of the parent {@link ppmpMinorGroup}.
 * @param {string} title - Display title for the new project group.
 * @returns {Promise<Result<BaseProjectGroupItem>>} The created project group on success, or a failure result on error.
 */
export async function createProjectGroup(parentId: string, title: string): Promise<Result<BaseProjectGroupItem>> {
  try {
    const [parent] = await db
      .select({ id: ppmpMinorGroup.id })
      .from(ppmpMinorGroup)
      .where(eq(ppmpMinorGroup.id, parentId))
      .limit(1);

    if (!parent) {
      return new Failure(ErrorCodes.ResourceNotFound, "Minor group not found.", { parentId });
    }

    const [created] = await db
      .insert(ppmpProjectGroup)
      .values({ parentId: parent.id, title })
      .returning({ id: ppmpProjectGroup.id, title: ppmpProjectGroup.title });

    return new Success({ id: created.id, title: created.title });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create project group.", { parentId, title }, e);
  }
}

/**
 * Creates a new PPMP plan item under either a minor group or a project group.
 *
 * @description
 * Validates that the specified parent (minor or project group) exists. When
 * `payload.saaobId` is not supplied, the item inherits the SAAOB of its
 * ancestor major group by walking the parent-group chain. All three date fields
 * are parsed from UTC+8 ISO strings and stored as UTC. The inserted item is
 * then returned in full response shape.
 *
 * On success, wraps the created {@link PlanItem} in a {@link Success}. Returns
 * a resource-not-found {@link Failure} when the parent or inherited SAAOB
 * cannot be resolved. Returns a validation {@link Failure} when any date
 * string is malformed. On unexpected failure, wraps the error in a fatal
 * {@link Failure}.
 *
 * @async
 * @function createItem
 * @param {string} parentId - Identifier of the parent minor or project group.
 * @param {ParentType} parentType - Discriminates whether parentId is a minor or project group.
 * @param {ItemPayload} payload - Item data.
 * @returns {Promise<Result<PlanItem>>} The created plan item on success, or a failure result on error.
 *
 * @remarks
 * - When `parentType` is {@link ParentType.Minor}, `minorGroupId` is set and `projectGroupId` is null.
 * - When `parentType` is {@link ParentType.Project}, `projectGroupId` is set and `minorGroupId` is null.
 * - SAAOB inheritance walks: minorGroup → majorGroup; or projectGroup → minorGroup → majorGroup.
 */
export async function createItem(
  parentId: string,
  parentType: ParentType,
  payload: ItemPayload,
): Promise<Result<PlanItem>> {
  try {
    // Validate and resolve parent + saaob
    const resolved = await _resolveParentAndSaaob(parentId, parentType, payload.saaobId);
    if (!resolved.ok) {
      return new Failure(resolved.error.code, resolved.error.message, { parentId, parentType });
    }

    // Parse dates
    const start = _parseManilaDateToUtc(payload.startOfProcurementActivity);
    const end = _parseManilaDateToUtc(payload.endOfProcurementActivity);
    const delivery = _parseManilaDateToUtc(payload.expectedDeliveryPeriod);

    if (!start || !end || !delivery) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "One or more date fields are invalid.",
        { payload },
      );
    }

    const [created] = await db
      .insert(ppmp)
      .values({
        generalDescription: payload.generalDescription ?? null,
        typeOfProject: payload.typeOfProject as "goods" | "infra" | "cons-serv",
        quantityOrSize: payload.quantityOrSize,
        recommendedModeOfProcurement: payload.recommendedModeOfProcurement ?? null,
        eligibleForPreProcurementConference: payload.eligibleForPreProcurementConference ?? false,
        startOfProcurementActivity: start,
        endOfProcurementActivity: end,
        expectedDeliveryPeriod: delivery,
        saaobId: resolved.saaob.id,
        estimatedBudget: casts.castToDecimal(payload.estimatedBudget),
        attachedSupportingDocuments: payload.attachedSupportingDocuments ?? null,
        remarks: payload.remarks ?? null,
        minorGroupId: resolved.minorGroupId,
        projectGroupId: resolved.projectGroupId,
      })
      .returning({
        id: ppmp.id,
        generalDescription: ppmp.generalDescription,
        typeOfProject: ppmp.typeOfProject,
        quantityOrSize: ppmp.quantityOrSize,
        recommendedModeOfProcurement: ppmp.recommendedModeOfProcurement,
        eligibleForPreProcurementConference: ppmp.eligibleForPreProcurementConference,
        startOfProcurementActivity: ppmp.startOfProcurementActivity,
        endOfProcurementActivity: ppmp.endOfProcurementActivity,
        expectedDeliveryPeriod: ppmp.expectedDeliveryPeriod,
        saaobId: ppmp.saaobId,
        estimatedBudget: ppmp.estimatedBudget,
        attachedSupportingDocuments: ppmp.attachedSupportingDocuments,
        remarks: ppmp.remarks,
        minorGroupId: ppmp.minorGroupId,
        projectGroupId: ppmp.projectGroupId,
      });

    return new Success(_mapToPlanItem(created, resolved.saaob));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create item.", { parentId, parentType, payload }, e);
  }
}

/**
 * Updates an existing PPMP major group's SAAOB association.
 *
 * @description
 * Verifies that both the major group and the new SAAOB entry exist, then
 * applies the update and returns the refreshed item.
 *
 * On success, wraps the updated major group in a {@link Success}. Returns a
 * resource-not-found {@link Failure} when either record is missing. On
 * unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function updateMajorGroup
 * @param {string} id - Identifier of the major group to update.
 * @param {string} saaobId - Identifier of the new SAAOB entry.
 * @returns {Promise<Result<BaseMajorGroupItem>>} The updated major group on success, or a failure result on error.
 */
export async function updateMajorGroup(id: string, saaobId: string): Promise<Result<BaseMajorGroupItem>> {
  try {
    const [[existing], [saaob]] = await Promise.all([
      db
        .select({ id: ppmpMajorGroup.id })
        .from(ppmpMajorGroup)
        .where(eq(ppmpMajorGroup.id, id))
        .limit(1),
      db
        .select({ id: saaobEntries.id, name: saaobEntries.name })
        .from(saaobEntries)
        .where(eq(saaobEntries.id, saaobId))
        .limit(1),
    ]);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Major group not found.", { id });
    }
    if (!saaob) {
      return new Failure(ErrorCodes.ResourceNotFound, "SAAOB entry not found.", { saaobId });
    }

    await db
      .update(ppmpMajorGroup)
      .set({ saaobId: saaob.id })
      .where(eq(ppmpMajorGroup.id, id));

    return new Success({ id, saaob: { id: saaob.id, name: saaob.name } });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update major group.", { id, saaobId }, e);
  }
}

/**
 * Updates an existing PPMP minor group's LBAC association.
 *
 * @description
 * Verifies that both the minor group and the new LBAC item exist, then
 * applies the update and returns the refreshed item.
 *
 * On success, wraps the updated minor group in a {@link Success}. Returns a
 * resource-not-found {@link Failure} when either record is missing. On
 * unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function updateMinorGroup
 * @param {string} id - Identifier of the minor group to update.
 * @param {string} lbacId - Identifier of the new LBAC item.
 * @returns {Promise<Result<BaseMinorGroupItem>>} The updated minor group on success, or a failure result on error.
 */
export async function updateMinorGroup(id: string, lbacId: string): Promise<Result<BaseMinorGroupItem>> {
  try {
    const [[existing], [lbac]] = await Promise.all([
      db
        .select({ id: ppmpMinorGroup.id })
        .from(ppmpMinorGroup)
        .where(eq(ppmpMinorGroup.id, id))
        .limit(1),
      db
        .select({ id: lbacItems.id, name: lbacItems.mfoPpa })
        .from(lbacItems)
        .where(eq(lbacItems.id, lbacId))
        .limit(1),
    ]);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Minor group not found.", { id });
    }
    if (!lbac) {
      return new Failure(ErrorCodes.ResourceNotFound, "LBAC item not found.", { lbacId });
    }

    await db
      .update(ppmpMinorGroup)
      .set({ lbacId: lbac.id })
      .where(eq(ppmpMinorGroup.id, id));

    return new Success({ id, lbac: { id: lbac.id, name: lbac.name } });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update minor group.", { id, lbacId }, e);
  }
}

/**
 * Updates an existing PPMP project group's title.
 *
 * @description
 * Verifies that the project group exists, then updates its title and returns
 * the refreshed item.
 *
 * On success, wraps the updated project group in a {@link Success}. Returns a
 * resource-not-found {@link Failure} when the record is missing. On unexpected
 * failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function updateProjectGroup
 * @param {string} id - Identifier of the project group to update.
 * @param {string} title - New title for the project group.
 * @returns {Promise<Result<BaseProjectGroupItem>>} The updated project group on success, or a failure result on error.
 */
export async function updateProjectGroup(id: string, title: string): Promise<Result<BaseProjectGroupItem>> {
  try {
    const [existing] = await db
      .select({ id: ppmpProjectGroup.id })
      .from(ppmpProjectGroup)
      .where(eq(ppmpProjectGroup.id, id))
      .limit(1);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Project group not found.", { id });
    }

    await db
      .update(ppmpProjectGroup)
      .set({ title })
      .where(eq(ppmpProjectGroup.id, id));

    return new Success({ id, title });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update project group.", { id, title }, e);
  }
}

/**
 * Partially updates an existing PPMP plan item.
 *
 * @description
 * Verifies that the plan item exists, then builds an update payload from only
 * the fields present in `payload`. Date fields, when provided, are parsed from
 * UTC+8 ISO strings and stored as UTC. When `saaobId` is provided it is
 * validated against `saaobEntries`. The updated row is returned in full
 * response shape with SAAOB inherited from the ancestor major group when the
 * item's own `saaobId` is null after the update.
 *
 * On success, wraps the updated {@link PlanItem} in a {@link Success}. Returns
 * a resource-not-found {@link Failure} when the item or referenced SAAOB is
 * missing. Returns a validation {@link Failure} when a date string is
 * malformed or no updatable fields are supplied. On unexpected failure, wraps
 * the error in a fatal {@link Failure}.
 *
 * @async
 * @function updateItem
 * @param {string} id - Identifier of the plan item to update.
 * @param {Partial<ItemPayload>} payload - Partial update payload.
 * @returns {Promise<Result<PlanItem>>} The updated plan item on success, or a failure result on error.
 *
 * @remarks
 * - At least one field in `payload` must be present.
 * - Date fields must be valid UTC+8 ISO strings when provided.
 */
export async function updateItem(id: string, payload: Partial<ItemPayload>): Promise<Result<PlanItem>> {
  try {
    const [existing] = await db
      .select({
        id: ppmp.id,
        saaobId: ppmp.saaobId,
        minorGroupId: ppmp.minorGroupId,
        projectGroupId: ppmp.projectGroupId,
      })
      .from(ppmp)
      .where(eq(ppmp.id, id))
      .limit(1);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Plan item not found.", { id });
    }

    // Build the update fields incrementally
    type UpdateFields = Partial<{
      generalDescription: string | null;
      typeOfProject: "goods" | "infra" | "cons-serv";
      quantityOrSize: string;
      recommendedModeOfProcurement: string | null;
      eligibleForPreProcurementConference: boolean;
      startOfProcurementActivity: Date;
      endOfProcurementActivity: Date;
      expectedDeliveryPeriod: Date;
      saaobId: string;
      estimatedBudget: string;
      attachedSupportingDocuments: string | null;
      remarks: string | null;
    }>;

    const updateFields: UpdateFields = {};

    if ("generalDescription" in payload) {
      updateFields.generalDescription = payload.generalDescription ?? null;
    }
    if (payload.typeOfProject !== undefined) {
      updateFields.typeOfProject = payload.typeOfProject as "goods" | "infra" | "cons-serv";
    }
    if (payload.quantityOrSize !== undefined) {
      updateFields.quantityOrSize = payload.quantityOrSize;
    }
    if ("recommendedModeOfProcurement" in payload) {
      updateFields.recommendedModeOfProcurement = payload.recommendedModeOfProcurement ?? null;
    }
    if (payload.eligibleForPreProcurementConference !== undefined) {
      updateFields.eligibleForPreProcurementConference = payload.eligibleForPreProcurementConference;
    }
    if (payload.startOfProcurementActivity !== undefined) {
      const d = _parseManilaDateToUtc(payload.startOfProcurementActivity);
      if (!d) return new Failure(ErrorCodes.ValidationFailure, "Invalid startOfProcurementActivity.", { id });
      updateFields.startOfProcurementActivity = d;
    }
    if (payload.endOfProcurementActivity !== undefined) {
      const d = _parseManilaDateToUtc(payload.endOfProcurementActivity);
      if (!d) return new Failure(ErrorCodes.ValidationFailure, "Invalid endOfProcurementActivity.", { id });
      updateFields.endOfProcurementActivity = d;
    }
    if (payload.expectedDeliveryPeriod !== undefined) {
      const d = _parseManilaDateToUtc(payload.expectedDeliveryPeriod);
      if (!d) return new Failure(ErrorCodes.ValidationFailure, "Invalid expectedDeliveryPeriod.", { id });
      updateFields.expectedDeliveryPeriod = d;
    }
    if (payload.saaobId !== undefined) {
      updateFields.saaobId = payload.saaobId;
    }
    if (payload.estimatedBudget !== undefined) {
      updateFields.estimatedBudget = casts.castToDecimal(payload.estimatedBudget);
    }
    if ("attachedSupportingDocuments" in payload) {
      updateFields.attachedSupportingDocuments = payload.attachedSupportingDocuments ?? null;
    }
    if ("remarks" in payload) {
      updateFields.remarks = payload.remarks ?? null;
    }

    if (Object.keys(updateFields).length === 0) {
      return new Failure(ErrorCodes.ValidationFailure, "No updatable fields provided.", { id });
    }

    // Validate saaobId override if provided, else use the existing one for display
    let saaobForItem: { id: string; name: string } | null = null;
    const effectiveSaaobId = updateFields.saaobId ?? existing.saaobId;
    const [saaobRow] = await db
      .select({ id: saaobEntries.id, name: saaobEntries.name })
      .from(saaobEntries)
      .where(eq(saaobEntries.id, effectiveSaaobId))
      .limit(1);
    if (!saaobRow) {
      return new Failure(ErrorCodes.ResourceNotFound, "SAAOB entry not found.", { id, saaobId: effectiveSaaobId });
    }
    saaobForItem = saaobRow;

    const [updated] = await db
      .update(ppmp)
      .set(updateFields)
      .where(eq(ppmp.id, id))
      .returning({
        id: ppmp.id,
        generalDescription: ppmp.generalDescription,
        typeOfProject: ppmp.typeOfProject,
        quantityOrSize: ppmp.quantityOrSize,
        recommendedModeOfProcurement: ppmp.recommendedModeOfProcurement,
        eligibleForPreProcurementConference: ppmp.eligibleForPreProcurementConference,
        startOfProcurementActivity: ppmp.startOfProcurementActivity,
        endOfProcurementActivity: ppmp.endOfProcurementActivity,
        expectedDeliveryPeriod: ppmp.expectedDeliveryPeriod,
        saaobId: ppmp.saaobId,
        estimatedBudget: ppmp.estimatedBudget,
        attachedSupportingDocuments: ppmp.attachedSupportingDocuments,
        remarks: ppmp.remarks,
        minorGroupId: ppmp.minorGroupId,
        projectGroupId: ppmp.projectGroupId,
      });

    return new Success(_mapToPlanItem(updated, saaobForItem));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update plan item.", { id, payload }, e);
  }
}

/**
 * Moves a minor group to a different major group.
 *
 * @description
 * Verifies that both the minor group and the target major group exist, then
 * updates the minor group's `parentId`.
 *
 * On success, wraps `null` in a {@link Success}. Returns a resource-not-found
 * {@link Failure} when either record is missing. On unexpected failure, wraps
 * the error in a fatal {@link Failure}.
 *
 * @async
 * @function moveMinorGroup
 * @param {string} id - Identifier of the minor group to move.
 * @param {string} majorGroupId - Identifier of the target major group.
 * @returns {Promise<Result<null>>} Null on success, or a failure result on error.
 */
export async function moveMinorGroup(id: string, majorGroupId: string): Promise<Result<null>> {
  try {
    const [[minor], [major]] = await Promise.all([
      db.select({ id: ppmpMinorGroup.id }).from(ppmpMinorGroup).where(eq(ppmpMinorGroup.id, id)).limit(1),
      db.select({ id: ppmpMajorGroup.id }).from(ppmpMajorGroup).where(eq(ppmpMajorGroup.id, majorGroupId)).limit(1),
    ]);

    if (!minor) return new Failure(ErrorCodes.ResourceNotFound, "Minor group not found.", { id });
    if (!major) return new Failure(ErrorCodes.ResourceNotFound, "Major group not found.", { majorGroupId });

    await db.update(ppmpMinorGroup).set({ parentId: major.id }).where(eq(ppmpMinorGroup.id, id));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to move minor group.", { id, majorGroupId }, e);
  }
}

/**
 * Moves a project group to a different minor group.
 *
 * @description
 * Verifies that both the project group and the target minor group exist, then
 * updates the project group's `parentId`.
 *
 * On success, wraps `null` in a {@link Success}. Returns a resource-not-found
 * {@link Failure} when either record is missing. On unexpected failure, wraps
 * the error in a fatal {@link Failure}.
 *
 * @async
 * @function moveProjectGroup
 * @param {string} id - Identifier of the project group to move.
 * @param {string} minorGroupId - Identifier of the target minor group.
 * @returns {Promise<Result<null>>} Null on success, or a failure result on error.
 */
export async function moveProjectGroup(id: string, minorGroupId: string): Promise<Result<null>> {
  try {
    const [[project], [minor]] = await Promise.all([
      db.select({ id: ppmpProjectGroup.id }).from(ppmpProjectGroup).where(eq(ppmpProjectGroup.id, id)).limit(1),
      db.select({ id: ppmpMinorGroup.id }).from(ppmpMinorGroup).where(eq(ppmpMinorGroup.id, minorGroupId)).limit(1),
    ]);

    if (!project) return new Failure(ErrorCodes.ResourceNotFound, "Project group not found.", { id });
    if (!minor) return new Failure(ErrorCodes.ResourceNotFound, "Minor group not found.", { minorGroupId });

    await db.update(ppmpProjectGroup).set({ parentId: minor.id }).where(eq(ppmpProjectGroup.id, id));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to move project group.", { id, minorGroupId }, e);
  }
}

/**
 * Moves a plan item to a different parent (minor group or project group).
 *
 * @description
 * Verifies that both the item and the target parent exist, then updates the
 * item's `minorGroupId`/`projectGroupId` columns so that exactly one is set.
 *
 * On success, wraps `null` in a {@link Success}. Returns a resource-not-found
 * {@link Failure} when either record is missing. On unexpected failure, wraps
 * the error in a fatal {@link Failure}.
 *
 * @async
 * @function moveItem
 * @param {string} id - Identifier of the plan item to move.
 * @param {ParentType} parentType - Discriminates whether targetId is a minor or project group.
 * @param {string} targetId - Identifier of the target minor or project group.
 * @returns {Promise<Result<null>>} Null on success, or a failure result on error.
 */
export async function moveItem(id: string, parentType: ParentType, targetId: string): Promise<Result<null>> {
  try {
    const [item] = await db
      .select({ id: ppmp.id })
      .from(ppmp)
      .where(eq(ppmp.id, id))
      .limit(1);

    if (!item) return new Failure(ErrorCodes.ResourceNotFound, "Plan item not found.", { id });

    if (parentType === ParentType.Minor) {
      const [target] = await db
        .select({ id: ppmpMinorGroup.id })
        .from(ppmpMinorGroup)
        .where(eq(ppmpMinorGroup.id, targetId))
        .limit(1);
      if (!target) return new Failure(ErrorCodes.ResourceNotFound, "Minor group not found.", { targetId });

      await db
        .update(ppmp)
        .set({ minorGroupId: target.id, projectGroupId: null })
        .where(eq(ppmp.id, id));
    } else {
      const [target] = await db
        .select({ id: ppmpProjectGroup.id })
        .from(ppmpProjectGroup)
        .where(eq(ppmpProjectGroup.id, targetId))
        .limit(1);
      if (!target) return new Failure(ErrorCodes.ResourceNotFound, "Project group not found.", { targetId });

      await db
        .update(ppmp)
        .set({ projectGroupId: target.id, minorGroupId: null })
        .where(eq(ppmp.id, id));
    }

    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to move plan item.", { id, parentType, targetId }, e);
  }
}

/**
 * Deletes a PPMP major group by identifier.
 *
 * @description
 * Verifies that the major group exists and has no child minor groups. If
 * children exist, a validation {@link Failure} is returned to prevent
 * accidental data loss. Otherwise the row is deleted.
 *
 * On success, wraps `null` in a {@link Success}. Returns a resource-not-found
 * {@link Failure} when the group is missing. Returns a validation {@link Failure}
 * when the group still has children. On unexpected failure, wraps the error in
 * a fatal {@link Failure}.
 *
 * @async
 * @function deleteMajorGroup
 * @param {string} id - Identifier of the major group to delete.
 * @returns {Promise<Result<null>>} Null on success, or a failure result on error.
 */
export async function deleteMajorGroup(id: string): Promise<Result<null>> {
  try {
    const [existing] = await db
      .select({ id: ppmpMajorGroup.id })
      .from(ppmpMajorGroup)
      .where(eq(ppmpMajorGroup.id, id))
      .limit(1);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Major group not found.", { id });
    }

    const [child] = await db
      .select({ id: ppmpMinorGroup.id })
      .from(ppmpMinorGroup)
      .where(eq(ppmpMinorGroup.parentId, id))
      .limit(1);

    if (child) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Cannot delete: major group still has minor groups.",
        { id },
      );
    }

    await db.delete(ppmpMajorGroup).where(eq(ppmpMajorGroup.id, id));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete major group.", { id }, e);
  }
}

/**
 * Deletes a PPMP minor group by identifier.
 *
 * @description
 * Verifies that the minor group exists and has no child project groups or plan
 * items. If any children exist, a validation {@link Failure} is returned.
 * Otherwise the row is deleted.
 *
 * On success, wraps `null` in a {@link Success}. Returns a resource-not-found
 * {@link Failure} when the group is missing. Returns a validation {@link Failure}
 * when the group still has children. On unexpected failure, wraps the error in
 * a fatal {@link Failure}.
 *
 * @async
 * @function deleteMinorGroup
 * @param {string} id - Identifier of the minor group to delete.
 * @returns {Promise<Result<null>>} Null on success, or a failure result on error.
 */
export async function deleteMinorGroup(id: string): Promise<Result<null>> {
  try {
    const [existing] = await db
      .select({ id: ppmpMinorGroup.id })
      .from(ppmpMinorGroup)
      .where(eq(ppmpMinorGroup.id, id))
      .limit(1);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Minor group not found.", { id });
    }

    const [[childProject], [childItem]] = await Promise.all([
      db
        .select({ id: ppmpProjectGroup.id })
        .from(ppmpProjectGroup)
        .where(eq(ppmpProjectGroup.parentId, id))
        .limit(1),
      db
        .select({ id: ppmp.id })
        .from(ppmp)
        .where(eq(ppmp.minorGroupId, id))
        .limit(1),
    ]);

    if (childProject || childItem) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Cannot delete: minor group still has project groups or plan items.",
        { id },
      );
    }

    await db.delete(ppmpMinorGroup).where(eq(ppmpMinorGroup.id, id));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete minor group.", { id }, e);
  }
}

/**
 * Deletes a PPMP project group by identifier.
 *
 * @description
 * Verifies that the project group exists and has no child plan items. If any
 * items exist, a validation {@link Failure} is returned. Otherwise the row is
 * deleted.
 *
 * On success, wraps `null` in a {@link Success}. Returns a resource-not-found
 * {@link Failure} when the group is missing. Returns a validation {@link Failure}
 * when the group still has children. On unexpected failure, wraps the error in
 * a fatal {@link Failure}.
 *
 * @async
 * @function deleteProjectGroup
 * @param {string} id - Identifier of the project group to delete.
 * @returns {Promise<Result<null>>} Null on success, or a failure result on error.
 */
export async function deleteProjectGroup(id: string): Promise<Result<null>> {
  try {
    const [existing] = await db
      .select({ id: ppmpProjectGroup.id })
      .from(ppmpProjectGroup)
      .where(eq(ppmpProjectGroup.id, id))
      .limit(1);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Project group not found.", { id });
    }

    const [child] = await db
      .select({ id: ppmp.id })
      .from(ppmp)
      .where(eq(ppmp.projectGroupId, id))
      .limit(1);

    if (child) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Cannot delete: project group still has plan items.",
        { id },
      );
    }

    await db.delete(ppmpProjectGroup).where(eq(ppmpProjectGroup.id, id));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete project group.", { id }, e);
  }
}

/**
 * Deletes a PPMP plan item by identifier.
 *
 * @description
 * Verifies that the plan item exists, then deletes it.
 *
 * On success, wraps `null` in a {@link Success}. Returns a resource-not-found
 * {@link Failure} when the item is missing. On unexpected failure, wraps the
 * error in a fatal {@link Failure}.
 *
 * @async
 * @function deleteItem
 * @param {string} id - Identifier of the plan item to delete.
 * @returns {Promise<Result<null>>} Null on success, or a failure result on error.
 */
export async function deleteItem(id: string): Promise<Result<null>> {
  try {
    const [existing] = await db
      .select({ id: ppmp.id })
      .from(ppmp)
      .where(eq(ppmp.id, id))
      .limit(1);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Plan item not found.", { id });
    }

    await db.delete(ppmp).where(eq(ppmp.id, id));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete plan item.", { id }, e);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Result shape from {@link _resolveParentAndSaaob}. */
type ResolveParentResult =
  | {
    ok: true;
    minorGroupId: string | null;
    projectGroupId: string | null;
    saaob: { id: string; name: string };
  }
  | { ok: false; error: { code: ErrorCodes; message: string } };

/**
 * Resolves the parent FK columns and effective SAAOB for a new plan item.
 *
 * @description
 * Validates that the specified parent group exists (minor or project). When
 * `saaobId` is provided, it is validated against `saaobEntries`. Otherwise
 * the SAAOB is inherited by walking up to the ancestor major group.
 *
 * @async
 * @function _resolveParentAndSaaob
 * @param {string} parentId - Identifier of the parent group.
 * @param {ParentType} parentType - Whether the parent is a minor or project group.
 * @param {string | undefined} saaobId - Optional explicit SAAOB override.
 * @returns {Promise<ResolveParentResult>} Resolved parent FKs and SAAOB, or an error descriptor.
 */
async function _resolveParentAndSaaob(
  parentId: string,
  parentType: ParentType,
  saaobId?: string,
): Promise<ResolveParentResult> {
  let minorGroupId: string | null = null;
  let projectGroupId: string | null = null;
  let resolvedMinorId: string | null = null;

  if (parentType === ParentType.Minor) {
    const [minor] = await db
      .select({ id: ppmpMinorGroup.id, parentId: ppmpMinorGroup.parentId })
      .from(ppmpMinorGroup)
      .where(eq(ppmpMinorGroup.id, parentId))
      .limit(1);
    if (!minor) {
      return { ok: false, error: { code: ErrorCodes.ResourceNotFound, message: "Minor group not found." } };
    }
    minorGroupId = minor.id;
    resolvedMinorId = minor.id;
  } else {
    const [project] = await db
      .select({ id: ppmpProjectGroup.id, parentId: ppmpProjectGroup.parentId })
      .from(ppmpProjectGroup)
      .where(eq(ppmpProjectGroup.id, parentId))
      .limit(1);
    if (!project) {
      return { ok: false, error: { code: ErrorCodes.ResourceNotFound, message: "Project group not found." } };
    }
    projectGroupId = project.id;
    resolvedMinorId = project.parentId;
  }

  // Resolve saaob
  if (saaobId) {
    const [saaob] = await db
      .select({ id: saaobEntries.id, name: saaobEntries.name })
      .from(saaobEntries)
      .where(eq(saaobEntries.id, saaobId))
      .limit(1);
    if (!saaob) {
      return { ok: false, error: { code: ErrorCodes.ResourceNotFound, message: "SAAOB entry not found." } };
    }
    return { ok: true, minorGroupId, projectGroupId, saaob };
  }

  // Inherit from major group
  const saaob = await _inheritSaaobFromMajor(
    minorGroupId ?? resolvedMinorId,
    projectGroupId,
  );
  if (!saaob) {
    return {
      ok: false,
      error: { code: ErrorCodes.ResourceNotFound, message: "Cannot resolve inherited SAAOB from major group." },
    };
  }

  return { ok: true, minorGroupId, projectGroupId, saaob };
}

/**
 * Looks up the SAAOB entry inherited from the ancestor major group.
 *
 * @description
 * Walks from the minor group (or the minor group referenced by the project
 * group) up to the major group and returns its SAAOB name and ID. Returns
 * `null` when the chain cannot be fully resolved.
 *
 * @async
 * @function _inheritSaaobFromMajor
 * @param {string | null} minorGroupId - Direct minor group ID, or null when the item belongs to a project group.
 * @param {string | null} projectGroupId - Project group ID used to resolve the minor group when minorGroupId is null.
 * @returns {Promise<{ id: string; name: string } | null>} The inherited SAAOB entry, or null.
 */
async function _inheritSaaobFromMajor(
  minorGroupId: string | null,
  projectGroupId: string | null,
): Promise<{ id: string; name: string } | null> {
  let resolvedMinorId = minorGroupId;

  if (!resolvedMinorId && projectGroupId) {
    const [pg] = await db
      .select({ parentId: ppmpProjectGroup.parentId })
      .from(ppmpProjectGroup)
      .where(eq(ppmpProjectGroup.id, projectGroupId))
      .limit(1);
    if (!pg) return null;
    resolvedMinorId = pg.parentId;
  }

  if (!resolvedMinorId) return null;

  const [minor] = await db
    .select({ parentId: ppmpMinorGroup.parentId })
    .from(ppmpMinorGroup)
    .where(eq(ppmpMinorGroup.id, resolvedMinorId))
    .limit(1);
  if (!minor) return null;

  const [major] = await db
    .select({ saaobId: ppmpMajorGroup.saaobId })
    .from(ppmpMajorGroup)
    .where(eq(ppmpMajorGroup.id, minor.parentId))
    .limit(1);
  if (!major) return null;

  const [saaob] = await db
    .select({ id: saaobEntries.id, name: saaobEntries.name })
    .from(saaobEntries)
    .where(eq(saaobEntries.id, major.saaobId))
    .limit(1);

  return saaob ?? null;
}
