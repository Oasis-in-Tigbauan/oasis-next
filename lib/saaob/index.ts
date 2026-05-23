import { and, asc, eq, ilike, inArray, lt } from "drizzle-orm";
import { DateTime } from "luxon";
import { Decimal } from "decimal.js";

import * as templateBucket from "@/lib/buckets/templates";
import type { TemplateBucketItem } from "@/lib/buckets/templates";
import { SAAOB_EXPORT_COLUMNS, type SaaobExportColumnKey } from "@/lib/saaob/client";
import * as casts from "@/lib/types/casts";
import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import {
  esre,
  expenseClasses,
  lbacItems,
  office,
  obrMainAipReferences,
  obrMainData,
  saaobEntries,
  saaobEntryGroup,
  saaobSummaryOfAccounts,
  saaobSummaryOfAccountsGroup,
  saaobSummaryOfAccountsLinkedGroups,
  supplemental,
} from "@/lib/db/schema";
import { type User } from "@/lib/accounts";

export const SAAOB_MAIN_DATA_TEMPLATE_IDENTIFIER = "saaob.main-data";
export const SAAOB_OFFICE_DATA_TEMPLATE_IDENTIFIER = "saaob.office-data";

/** ExcelTS numeric number format for monetary amounts. */
const _NUM_FMT_AMOUNT = "#,##0.00";
/** ExcelTS number format for percentages stored as 0-100. */
const _NUM_FMT_PCT = "0.00";

/** Thin border applied to all data cells. */
const _THIN_BORDER = {
  top: { style: "thin" as const },
  left: { style: "thin" as const },
  bottom: { style: "thin" as const },
  right: { style: "thin" as const },
};

/** Blue accent color used for non-root group rows (ARGB). */
const _BLUE_COLOR = { argb: "FF2F75B6" };

/** Light-blue fill used for root group rows. */
const _ROOT_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFD9E1F2" } };
/** Light-gray fill for column header row. */
const _HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFE2EFDA" } };

/**
 * In ExcelJS/ExcelTS, cells that belong to a merged range but are NOT the
 * top-left master cell have `cell.type === 8` (ValueType.Merge). Copying
 * their value to the destination would duplicate the master's text in every
 * column of the range. Skip them so only the master cell is written.
 */
const _MERGE_CELL_TYPE = 1; // ValueType.Merge in ExcelTS (enums.js: ValueType[ValueType["Merge"] = 1])

/**
 * Returns all SAAOB entry groups and entries as a nested tree structure with
 * full computed financial fields for every entry.
 *
 * @description
 * Fetches all groups and all entries, batch-computes financial fields for every
 * entry (supplemental, OBR, ESRE, LBAC), then assembles the result as a
 * recursive tree ordered by group creation date ascending.
 *
 * On success wraps the tree in a {@link Success}. On unexpected failure wraps
 * the error in a fatal {@link Failure}.
 *
 * @async
 * @function getAll
 * @returns {Promise<Result<SaaobElements>>} The full SAAOB tree.
 */
export async function getAll(year?: number, month?: number): Promise<Result<SaaobElements>> {
  try {
    const [groups, entryRows] = await Promise.all([_fetchAllGroups(), _fetchAllEntries()]);
    const computedEntries = await _fetchAndComputeEntries(entryRows, year, month);
    const entriesByGroup = _buildEntriesByGroupMap(entryRows, computedEntries);
    return new Success(_buildTree(groups, entriesByGroup));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to retrieve SAAOB entries.", {}, e);
  }
}

/**
 * Creates a new SAAOB entry group.
 *
 * @description
 * Optionally accepts a `parentId` to nest the group under an existing group.
 * When `parentId` is provided the parent must exist; otherwise a
 * {@link Failure} with code {@link ErrorCodes.ResourceNotFound} is returned.
 * Optionally accepts `officeId` to assign the group to a specific office.
 *
 * @async
 * @function createGroup
 * @param {string} name - Display name for the new group.
 * @param {User} _user - The authenticated user (reserved for future auditing).
 * @param {string} [parentId] - ID of the parent group, or omitted for a root group.
 * @param {string | null} [officeId] - Optional office assignment for this group.
 * @returns {Promise<Result<SaaobGroup>>} The created group with an empty children array.
 */
export async function createGroup(
  name: string,
  _user: User,
  parentId?: string,
  officeId?: string | null,
): Promise<Result<SaaobGroup>> {
  try {
    if (parentId) {
      const [parent] = await db
        .select({ id: saaobEntryGroup.id })
        .from(saaobEntryGroup)
        .where(eq(saaobEntryGroup.id, parentId))
        .limit(1);
      if (!parent) {
        return new Failure(ErrorCodes.ResourceNotFound, "Parent group does not exist.", { parentId });
      }
    }

    if (officeId !== undefined && officeId !== null) {
      const [officeExists] = await db
        .select({ id: office.id })
        .from(office)
        .where(eq(office.id, officeId))
        .limit(1);
      if (!officeExists) {
        return new Failure(ErrorCodes.ValidationFailure, "Assigned office does not exist.", { officeId });
      }
    }

    const [created] = await db
      .insert(saaobEntryGroup)
      .values({ name, parentId: parentId ?? null, officeId: officeId ?? null })
      .returning({ id: saaobEntryGroup.id, name: saaobEntryGroup.name, officeId: saaobEntryGroup.officeId });

    return new Success({
      id: created.id,
      name: created.name,
      officeId: created.officeId ?? undefined,
      total: _computeSummaryItemAggregate([]),
      children: [],
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create SAAOB group.", { name, parentId, officeId }, e);
  }
}

/**
 * Creates a new SAAOB entry in the specified group.
 *
 * @description
 * Verifies the parent group exists. Resolves the expense code either from the
 * explicitly supplied `payload.expenseCodeId` (verified to exist) or by
 * performing a case-insensitive name lookup against `expenseClasses.accountName`.
 * The `accountCode` value is copied from the matched expense class.
 *
 * On success wraps the fully computed {@link SaaobEntry} in a {@link Success}.
 *
 * @async
 * @function createEntry
 * @param {string} parentId - ID of the group to place the entry in.
 * @param {User} user - The authenticated user creating the entry.
 * @param {SaaobCreateEntryPayload} payload - Entry data.
 * @returns {Promise<Result<SaaobEntry>>} The created and fully computed entry.
 */
export async function createEntry(
  parentId: string,
  user: User,
  payload: SaaobCreateEntryPayload,
): Promise<Result<SaaobEntry>> {
  try {
    const [parent] = await db
      .select({ id: saaobEntryGroup.id })
      .from(saaobEntryGroup)
      .where(eq(saaobEntryGroup.id, parentId))
      .limit(1);
    if (!parent) {
      return new Failure(ErrorCodes.ResourceNotFound, "Parent group does not exist.", { parentId });
    }

    let resolvedExpenseCodeId: string | null = null;
    let resolvedAccountCode: string | null = null;

    if (payload.expenseCodeId) {
      const [expClass] = await db
        .select({ id: expenseClasses.id, accountCode: expenseClasses.accountCode })
        .from(expenseClasses)
        .where(eq(expenseClasses.id, payload.expenseCodeId))
        .limit(1);
      if (!expClass) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified expense code does not exist.", {
          expenseCodeId: payload.expenseCodeId,
        });
      }
      resolvedExpenseCodeId = expClass.id;
      resolvedAccountCode = expClass.accountCode ?? null;
    } else {
      const [expClass] = await db
        .select({ id: expenseClasses.id, accountCode: expenseClasses.accountCode })
        .from(expenseClasses)
        .where(ilike(expenseClasses.accountName, payload.name))
        .limit(1);
      if (expClass) {
        resolvedExpenseCodeId = expClass.id;
        resolvedAccountCode = expClass.accountCode ?? null;
      }
    }

    const [created] = await db
      .insert(saaobEntries)
      .values({
        name: payload.name,
        annualBudget: casts.castToDecimal(payload.annualBudget),
        remarks: payload.remarks ?? null,
        parentId,
        expenseCodeId: resolvedExpenseCodeId,
        accountCode: resolvedAccountCode,
        authorId: user.id,
        allotmentShouldCopyFromAppropriation: payload.allotmentShouldCopyFromAppropriation ?? false,
      })
      .returning({ id: saaobEntries.id });

    const entryRows = await _fetchAllEntries([parentId]).then(rows => rows.filter(r => r.id === created.id));
    const [computed] = await _fetchAndComputeEntries(entryRows);
    if (!computed) {
      return new Failure(ErrorCodes.Fatal, "Unable to retrieve created SAAOB entry.", { entryId: created.id });
    }
    return new Success(computed);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create SAAOB entry.", { parentId }, e);
  }
}

/**
 * Moves a SAAOB entry group to a different parent, or to root level.
 *
 * @description
 * Returns a {@link Failure} with {@link ErrorCodes.ResourceNotFound} if the
 * group does not exist. Returns a {@link Failure} with
 * {@link ErrorCodes.ValidationFailure} if `target` is provided but does not
 * exist, or if moving would create a cycle (target is a descendant of the
 * group being moved).
 *
 * @async
 * @function moveGroup
 * @param {string} id - ID of the group to move.
 * @param {string | null} target - ID of the new parent group, or `null` to move to root.
 * @returns {Promise<Result<null>>} Null on success.
 */
export async function moveGroup(id: string, target: string | null): Promise<Result<null>> {
  try {
    const allGroups = await _fetchAllGroups();

    const existing = allGroups.find(g => g.id === id);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Group not found.", { id });
    }

    if (target !== null) {
      const targetGroup = allGroups.find(g => g.id === target);
      if (!targetGroup) {
        return new Failure(ErrorCodes.ValidationFailure, "Target group does not exist.", { target });
      }
      const descendants = _collectDescendantGroupIds(id, allGroups);
      if (descendants.includes(target)) {
        return new Failure(ErrorCodes.ValidationFailure, "Cannot move a group into one of its own descendants.", {
          id,
          target,
        });
      }
    }

    await db.update(saaobEntryGroup).set({ parentId: target }).where(eq(saaobEntryGroup.id, id));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to move SAAOB group.", { id, target }, e);
  }
}

/**
 * Moves a SAAOB entry to a different group.
 *
 * @description
 * Returns a {@link Failure} with {@link ErrorCodes.ResourceNotFound} if the
 * entry or the target group does not exist.
 *
 * @async
 * @function moveEntry
 * @param {string} id - ID of the entry to move.
 * @param {string} target - ID of the destination group.
 * @returns {Promise<Result<null>>} Null on success.
 */
export async function moveEntry(id: string, target: string): Promise<Result<null>> {
  try {
    const [entry] = await db
      .select({ id: saaobEntries.id })
      .from(saaobEntries)
      .where(eq(saaobEntries.id, id))
      .limit(1);
    if (!entry) {
      return new Failure(ErrorCodes.ResourceNotFound, "SAAOB entry not found.", { id });
    }

    const [targetGroup] = await db
      .select({ id: saaobEntryGroup.id })
      .from(saaobEntryGroup)
      .where(eq(saaobEntryGroup.id, target))
      .limit(1);
    if (!targetGroup) {
      return new Failure(ErrorCodes.ValidationFailure, "Target group does not exist.", { target });
    }

    await db.update(saaobEntries).set({ parentId: target }).where(eq(saaobEntries.id, id));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to move SAAOB entry.", { id, target }, e);
  }
}

/**
 * Updates the name of an existing SAAOB entry group.
 *
 * @description
 * Returns a {@link Failure} with {@link ErrorCodes.ResourceNotFound} if the
 * group does not exist. When no fields are changed the existing values are
 * returned unchanged.
 *
 * @async
 * @function updateGroup
 * @param {string} id - ID of the group to update.
 * @param {string} [name] - New name for the group.
 * @param {string | null} [officeId] - Office assignment for the group (`null` clears assignment).
 * @returns {Promise<Result<BaseSaaobGroup>>} The updated group.
 */
export async function updateGroup(
  id: string,
  name?: string,
  officeId?: string | null,
): Promise<Result<BaseSaaobGroup>> {
  try {
    const [existing] = await db
      .select({ id: saaobEntryGroup.id, name: saaobEntryGroup.name, officeId: saaobEntryGroup.officeId })
      .from(saaobEntryGroup)
      .where(eq(saaobEntryGroup.id, id))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Group not found.", { id });
    }

    if (officeId !== undefined && officeId !== null) {
      const [officeExists] = await db
        .select({ id: office.id })
        .from(office)
        .where(eq(office.id, officeId))
        .limit(1);
      if (!officeExists) {
        return new Failure(ErrorCodes.ValidationFailure, "Assigned office does not exist.", { officeId });
      }
    }

    const updateValues: Partial<Pick<typeof saaobEntryGroup.$inferInsert, "name" | "officeId">> = {};
    if (name !== undefined) {
      updateValues.name = name;
    }

    if (officeId !== undefined) {
      updateValues.officeId = officeId;
    }

    if (Object.keys(updateValues).length > 0) {
      await db.update(saaobEntryGroup).set(updateValues).where(eq(saaobEntryGroup.id, id));
    }

    const resolvedName = name ?? existing.name;
    const resolvedOfficeId = officeId === undefined ? existing.officeId : officeId;

    return new Success({
      id,
      name: resolvedName,
      officeId: resolvedOfficeId ?? undefined,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update SAAOB group.", { id, officeId }, e);
  }
}

/**
 * Applies a partial update to an existing SAAOB entry.
 *
 * @description
 * Returns a {@link Failure} with {@link ErrorCodes.ResourceNotFound} if the
 * entry does not exist. When `expenseCodeId` is provided it is validated and
 * used directly. When only `name` is changed (without `expenseCodeId`) the
 * service re-resolves the expense class by case-insensitive name lookup.
 *
 * @async
 * @function updateEntry
 * @param {string} id - ID of the entry to update.
 * @param {SaaobUpdateEntryPayload} payload - Fields to update (all optional).
 * @returns {Promise<Result<SaaobEntry>>} The updated and fully computed entry.
 */
export async function updateEntry(id: string, payload: SaaobUpdateEntryPayload): Promise<Result<SaaobEntry>> {
  try {
    const [existing] = await db
      .select({
        id: saaobEntries.id,
        name: saaobEntries.name,
        parentId: saaobEntries.parentId,
      })
      .from(saaobEntries)
      .where(eq(saaobEntries.id, id))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "SAAOB entry not found.", { id });
    }

    const updateValues: Record<string, unknown> = {};

    if (payload.name !== undefined) updateValues.name = payload.name;
    if (payload.annualBudget !== undefined) updateValues.annualBudget = casts.castToDecimal(payload.annualBudget);
    if (payload.remarks !== undefined) updateValues.remarks = payload.remarks;
    if (payload.allotmentShouldCopyFromAppropriation !== undefined) updateValues.allotmentShouldCopyFromAppropriation = payload.allotmentShouldCopyFromAppropriation;

    const nameForLookup = payload.name ?? existing.name;

    if (payload.expenseCodeId !== undefined) {
      const [expClass] = await db
        .select({ id: expenseClasses.id, accountCode: expenseClasses.accountCode })
        .from(expenseClasses)
        .where(eq(expenseClasses.id, payload.expenseCodeId))
        .limit(1);
      if (!expClass) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified expense code does not exist.", {
          expenseCodeId: payload.expenseCodeId,
        });
      }
      updateValues.expenseCodeId = expClass.id;
      updateValues.accountCode = expClass.accountCode ?? null;
    } else if (payload.name !== undefined) {
      const [expClass] = await db
        .select({ id: expenseClasses.id, accountCode: expenseClasses.accountCode })
        .from(expenseClasses)
        .where(ilike(expenseClasses.accountName, nameForLookup))
        .limit(1);
      if (expClass) {
        updateValues.expenseCodeId = expClass.id;
        updateValues.accountCode = expClass.accountCode ?? null;
      }
    }

    if (Object.keys(updateValues).length > 0) {
      await db.update(saaobEntries).set(updateValues).where(eq(saaobEntries.id, id));
    }

    const entryRows = await _fetchAllEntries([existing.parentId]).then(rows => rows.filter(r => r.id === id));
    const [computed] = await _fetchAndComputeEntries(entryRows);
    if (!computed) {
      return new Failure(ErrorCodes.Fatal, "Unable to retrieve updated SAAOB entry.", { id });
    }
    return new Success(computed);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update SAAOB entry.", { id }, e);
  }
}

/**
 * Deletes a SAAOB entry group and all of its descendant groups.
 *
 * @description
 * Returns a {@link Failure} with {@link ErrorCodes.ResourceNotFound} if the
 * group does not exist. Returns a {@link Failure} with
 * {@link ErrorCodes.ValidationFailure} if any SAAOB entries exist within the
 * group or any of its descendants — remove all entries first.
 *
 * Descendant groups are deleted deepest-first inside a transaction to avoid
 * foreign-key constraint violations.
 *
 * @async
 * @function deleteGroup
 * @param {string} id - ID of the group to delete.
 * @returns {Promise<Result<null>>} Null on success.
 */
export async function deleteGroup(id: string): Promise<Result<null>> {
  try {
    const allGroups = await _fetchAllGroups();
    const existing = allGroups.find(g => g.id === id);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Group not found.", { id });
    }

    const descendants = _collectDescendantGroupIds(id, allGroups);
    const allGroupIds = [id, ...descendants];

    const entriesInGroup = await db
      .select({ id: saaobEntries.id })
      .from(saaobEntries)
      .where(inArray(saaobEntries.parentId, allGroupIds))
      .limit(1);

    if (entriesInGroup.length > 0) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Cannot delete a group that still contains entries. Remove all entries first.",
        { id },
      );
    }

    const depthMap = new Map<string, number>();
    const computeDepth = (gId: string, depth: number) => {
      depthMap.set(gId, depth);
      for (const child of allGroups.filter(g => g.parentId === gId)) {
        computeDepth(child.id, depth + 1);
      }
    };
    computeDepth(id, 0);

    const sortedIds = [...allGroupIds].sort((a, b) => (depthMap.get(b) ?? 0) - (depthMap.get(a) ?? 0));

    await db.transaction(async tx => {
      for (const gId of sortedIds) {
        await tx.delete(saaobEntryGroup).where(eq(saaobEntryGroup.id, gId));
      }
    });

    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete SAAOB group.", { id }, e);
  }
}

/**
 * Deletes a SAAOB entry.
 *
 * @description
 * Returns a {@link Failure} with {@link ErrorCodes.ResourceNotFound} if the
 * entry does not exist.
 *
 * @async
 * @function deleteEntry
 * @param {string} id - ID of the entry to delete.
 * @returns {Promise<Result<null>>} Null on success.
 */
export async function deleteEntry(id: string): Promise<Result<null>> {
  try {
    const [entry] = await db
      .select({ id: saaobEntries.id })
      .from(saaobEntries)
      .where(eq(saaobEntries.id, id))
      .limit(1);
    if (!entry) {
      return new Failure(ErrorCodes.ResourceNotFound, "SAAOB entry not found.", { id });
    }

    await db.delete(saaobEntries).where(eq(saaobEntries.id, id));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete SAAOB entry.", { id }, e);
  }
}

/**
 * Returns all SAAOB groups and entries that belong to the specified office,
 * as a nested tree rooted at groups explicitly tagged with the given `officeId`.
 *
 * @description
 * Fetches all groups in memory, then identifies root groups whose `officeId`
 * matches the argument. Descendant groups (regardless of their own `officeId`)
 * are included. Only entries within the matched groups are fetched and computed.
 *
 * Returns an empty array when no groups are tagged for the office.
 *
 * @async
 * @function getAllByOffice
 * @param {string} officeId - The office ID to filter by.
 * @returns {Promise<Result<SaaobElements>>} The office-specific SAAOB tree.
 */
export async function getAllByOffice(officeId: string): Promise<Result<SaaobElements>> {
  try {
    const allGroups = await _fetchAllGroups();

    const officeRoots = allGroups.filter(g => g.officeId === officeId);
    if (officeRoots.length === 0) return new Success([]);

    const relevantGroupIds = new Set<string>(officeRoots.map(g => g.id));
    for (const root of officeRoots) {
      for (const desc of _collectDescendantGroupIds(root.id, allGroups)) {
        relevantGroupIds.add(desc);
      }
    }

    const filteredGroups = allGroups.filter(g => relevantGroupIds.has(g.id));
    const entryRows = await _fetchAllEntries([...relevantGroupIds]);
    const computedEntries = await _fetchAndComputeEntries(entryRows);
    const entriesByGroup = _buildEntriesByGroupMap(entryRows, computedEntries);

    return new Success(_buildTree(filteredGroups, entriesByGroup, new Set(officeRoots.map(g => g.id))));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to retrieve office SAAOB entries.", { officeId }, e);
  }
}

/**
 * Searches SAAOB groups and entries by name, returning a pruned recursive tree.
 *
 * @description
 * Performs a case-insensitive partial-match search against both group names and
 * entry names. The result is assembled as a pruned version of the full tree:
 *
 * - **Matched entry**: the entry's full ancestor-group path is preserved as
 *   "path" nodes, but only the matching entry is shown under its immediate
 *   parent — sibling entries are excluded.
 * - **Matched group**: the group's full ancestor-group path is preserved as
 *   "path" nodes, and the matched group itself is fully expanded (all
 *   descendants — sub-groups and entries — are included recursively).
 *
 * Only entries that will appear in the result have their financial fields
 * computed, avoiding unnecessary DB work.
 *
 * @async
 * @function searchItems
 * @param {string} query - Case-insensitive search term (partial match).
 * @returns {Promise<Result<SaaobSearchResult>>} Pruned tree of matching results.
 */
export async function searchItems(query: string): Promise<Result<SaaobSearchResult>> {
  try {
    const [allGroups, allEntries] = await Promise.all([_fetchAllGroups(), _fetchAllEntries()]);

    const lowerQuery = query.toLowerCase();
    const matchedGroupIds = new Set(allGroups.filter(g => g.name.toLowerCase().includes(lowerQuery)).map(g => g.id));
    const matchedEntryIds = new Set(allEntries.filter(e => e.name.toLowerCase().includes(lowerQuery)).map(e => e.id));

    if (matchedGroupIds.size === 0 && matchedEntryIds.size === 0) return new Success([]);

    const parentMap = new Map(allGroups.map(g => [g.id, g.parentId]));

    const getAncestorChain = (groupId: string): string[] => {
      const chain: string[] = [];
      let current = parentMap.get(groupId) ?? null;
      while (current) {
        chain.push(current);
        current = parentMap.get(current) ?? null;
      }
      return chain;
    };

    const expandedGroupIds = new Set<string>();
    const pathGroupIds = new Set<string>();

    for (const gId of matchedGroupIds) {
      expandedGroupIds.add(gId);
      for (const desc of _collectDescendantGroupIds(gId, allGroups)) {
        expandedGroupIds.add(desc);
      }
      for (const anc of getAncestorChain(gId)) {
        if (!expandedGroupIds.has(anc)) pathGroupIds.add(anc);
      }
    }

    for (const eId of matchedEntryIds) {
      const entryRow = allEntries.find(e => e.id === eId);
      if (!entryRow) continue;
      const parentGroupId = entryRow.parentId;
      if (!expandedGroupIds.has(parentGroupId)) pathGroupIds.add(parentGroupId);
      for (const anc of getAncestorChain(parentGroupId)) {
        if (!expandedGroupIds.has(anc)) pathGroupIds.add(anc);
      }
    }

    const includedEntryRows = allEntries.filter(
      e => matchedEntryIds.has(e.id) || expandedGroupIds.has(e.parentId),
    );

    const computedEntries = await _fetchAndComputeEntries(includedEntryRows);
    const computedEntryMap = new Map(computedEntries.map(e => [e.id, e]));

    const childGroupsByParent = new Map<string, SaaobGroupRow[]>();
    for (const g of allGroups) {
      if (g.parentId) {
        const arr = childGroupsByParent.get(g.parentId) ?? [];
        arr.push(g);
        childGroupsByParent.set(g.parentId, arr);
      }
    }

    const buildPrunedGroup = (group: SaaobGroupRow): SaaobGroup => {
      const directChildGroups = childGroupsByParent.get(group.id) ?? [];
      const directChildEntries = allEntries.filter(e => e.parentId === group.id);

      let builtChildren: Array<SaaobGroup | SaaobEntry>;

      if (expandedGroupIds.has(group.id)) {
        builtChildren = [
          ...directChildGroups.map(cg => buildPrunedGroup(cg)),
          ...directChildEntries.map(e => computedEntryMap.get(e.id)).filter((e): e is SaaobEntry => e !== undefined),
        ];
      } else {
        const relevantChildGroups = directChildGroups.filter(
          cg => pathGroupIds.has(cg.id) || expandedGroupIds.has(cg.id),
        );
        const relevantEntries = directChildEntries
          .filter(e => matchedEntryIds.has(e.id))
          .map(e => computedEntryMap.get(e.id))
          .filter((e): e is SaaobEntry => e !== undefined);
        builtChildren = [...relevantChildGroups.map(cg => buildPrunedGroup(cg)), ...relevantEntries];
      }

      return {
        id: group.id,
        name: group.name,
        officeId: group.officeId ?? undefined,
        total: _computeSummaryItemAggregate(_collectEntriesFromSaaobChildren(builtChildren)),
        children: builtChildren,
      };
    };

    const rootGroupsToInclude = allGroups.filter(
      g => g.parentId === null && (pathGroupIds.has(g.id) || expandedGroupIds.has(g.id)),
    );

    return new Success(rootGroupsToInclude.map(rg => buildPrunedGroup(rg)));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to search SAAOB items.", { query }, e);
  }
}

export async function getAllSummary(year?: number, month?: number): Promise<Result<SaaobSummaryElements>> {
  try {
    const [summaryGroups, summaryItems, linkedGroupLinks] = await Promise.all([
      db.select({
        id: saaobSummaryOfAccountsGroup.id,
        name: saaobSummaryOfAccountsGroup.name,
        parentId: saaobSummaryOfAccountsGroup.parentId,
        createdAt: saaobSummaryOfAccountsGroup.createdAt,
      }).from(saaobSummaryOfAccountsGroup).orderBy(asc(saaobSummaryOfAccountsGroup.createdAt)),
      db.select({
        id: saaobSummaryOfAccounts.id,
        name: saaobSummaryOfAccounts.name,
        parentId: saaobSummaryOfAccounts.parentId,
      }).from(saaobSummaryOfAccounts).orderBy(asc(saaobSummaryOfAccounts.createdAt)),
      db.select({
        entryId: saaobSummaryOfAccountsLinkedGroups.entryId,
        groupRefId: saaobSummaryOfAccountsLinkedGroups.groupRefId,
      }).from(saaobSummaryOfAccountsLinkedGroups),
    ]);

    const linkedGroupsByItem = new Map<string, string[]>();
    for (const link of linkedGroupLinks) {
      const arr = linkedGroupsByItem.get(link.entryId) ?? [];
      arr.push(link.groupRefId);
      linkedGroupsByItem.set(link.entryId, arr);
    }

    const allSaaobGroups = await _fetchAllGroups();
    const allNeededGroupIds = new Set<string>();
    for (const [, groupIds] of linkedGroupsByItem) {
      for (const gId of groupIds) {
        allNeededGroupIds.add(gId);
        for (const desc of _collectDescendantGroupIds(gId, allSaaobGroups)) {
          allNeededGroupIds.add(desc);
        }
      }
    }

    const entryRows = allNeededGroupIds.size > 0 ? await _fetchAllEntries([...allNeededGroupIds]) : [];
    const computedEntries = await _fetchAndComputeEntries(entryRows, year, month);
    const entriesByGroup = _buildEntriesByGroupMap(entryRows, computedEntries);

    const itemsByParentGroup = new Map<string, SaaobSummaryItem[]>();
    for (const item of summaryItems) {
      const linkedGroupIds = linkedGroupsByItem.get(item.id) ?? [];
      const entries = _collectEntriesForGroups(linkedGroupIds, allSaaobGroups, entriesByGroup);
      const aggregate = _computeSummaryItemAggregate(entries);
      const computedItem: SaaobSummaryItem = { id: item.id, name: item.name, linkedGroupIds, ...aggregate };
      const arr = itemsByParentGroup.get(item.parentId) ?? [];
      arr.push(computedItem);
      itemsByParentGroup.set(item.parentId, arr);
    }

    return new Success(_buildSummaryTree(summaryGroups, itemsByParentGroup));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to retrieve Summary of Accounts.", {}, e);
  }
}

export async function createSummaryGroup(
  name: string,
  parentId?: string,
): Promise<Result<BaseSaaobSummaryGroup>> {
  try {
    if (parentId) {
      const [parent] = await db
        .select({ id: saaobSummaryOfAccountsGroup.id })
        .from(saaobSummaryOfAccountsGroup)
        .where(eq(saaobSummaryOfAccountsGroup.id, parentId))
        .limit(1);
      if (!parent) {
        return new Failure(ErrorCodes.ResourceNotFound, "Parent group does not exist.", { parentId });
      }
    }

    const [created] = await db
      .insert(saaobSummaryOfAccountsGroup)
      .values({ name, parentId: parentId ?? null })
      .returning({ id: saaobSummaryOfAccountsGroup.id, name: saaobSummaryOfAccountsGroup.name });

    return new Success({ id: created.id, name: created.name });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create Summary of Accounts group.", { name }, e);
  }
}

export async function updateSummaryGroup(
  id: string,
  name: string,
): Promise<Result<BaseSaaobSummaryGroup>> {
  try {
    const [existing] = await db
      .select({ id: saaobSummaryOfAccountsGroup.id })
      .from(saaobSummaryOfAccountsGroup)
      .where(eq(saaobSummaryOfAccountsGroup.id, id))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Summary group not found.", { id });
    }

    await db.update(saaobSummaryOfAccountsGroup).set({ name }).where(eq(saaobSummaryOfAccountsGroup.id, id));
    return new Success({ id, name });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update Summary of Accounts group.", { id }, e);
  }
}

export async function deleteSummaryGroup(id: string): Promise<Result<null>> {
  try {
    const allSummaryGroups = await db
      .select({ id: saaobSummaryOfAccountsGroup.id, parentId: saaobSummaryOfAccountsGroup.parentId })
      .from(saaobSummaryOfAccountsGroup);

    const existing = allSummaryGroups.find(g => g.id === id);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Summary group not found.", { id });
    }

    const descendants = _collectDescendantSummaryGroupIds(id, allSummaryGroups);
    const allGroupIds = [id, ...descendants];

    const [itemInGroup] = await db
      .select({ id: saaobSummaryOfAccounts.id })
      .from(saaobSummaryOfAccounts)
      .where(inArray(saaobSummaryOfAccounts.parentId, allGroupIds))
      .limit(1);

    if (itemInGroup) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Cannot delete a group that still contains items. Remove all items first.",
        { id },
      );
    }

    const depthMap = new Map<string, number>();
    const computeDepth = (gId: string, depth: number) => {
      depthMap.set(gId, depth);
      for (const child of allSummaryGroups.filter(g => g.parentId === gId)) {
        computeDepth(child.id, depth + 1);
      }
    };
    computeDepth(id, 0);

    const sortedIds = [...allGroupIds].sort((a, b) => (depthMap.get(b) ?? 0) - (depthMap.get(a) ?? 0));

    await db.transaction(async tx => {
      for (const gId of sortedIds) {
        await tx.delete(saaobSummaryOfAccountsGroup).where(eq(saaobSummaryOfAccountsGroup.id, gId));
      }
    });

    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete Summary of Accounts group.", { id }, e);
  }
}

export async function createSummaryItem(
  name: string,
  parentGroupId: string,
  linkedGroupIds: string[],
): Promise<Result<SaaobSummaryItem>> {
  try {
    const [parent] = await db
      .select({ id: saaobSummaryOfAccountsGroup.id })
      .from(saaobSummaryOfAccountsGroup)
      .where(eq(saaobSummaryOfAccountsGroup.id, parentGroupId))
      .limit(1);
    if (!parent) {
      return new Failure(ErrorCodes.ResourceNotFound, "Parent group does not exist.", { parentGroupId });
    }

    if (linkedGroupIds.length > 0) {
      const existingGroups = await db
        .select({ id: saaobEntryGroup.id })
        .from(saaobEntryGroup)
        .where(inArray(saaobEntryGroup.id, linkedGroupIds));
      const foundIds = new Set(existingGroups.map(g => g.id));
      const missingIds = linkedGroupIds.filter(gId => !foundIds.has(gId));
      if (missingIds.length > 0) {
        return new Failure(ErrorCodes.ValidationFailure, "Some linked groups do not exist.", { missingIds });
      }
    }

    const [created] = await db
      .insert(saaobSummaryOfAccounts)
      .values({ name, parentId: parentGroupId })
      .returning({ id: saaobSummaryOfAccounts.id });

    if (linkedGroupIds.length > 0) {
      await db.insert(saaobSummaryOfAccountsLinkedGroups).values(
        linkedGroupIds.map(gId => ({ entryId: created.id, groupRefId: gId })),
      );
    }

    const item = await _fetchAndBuildSummaryItem(created.id, name, linkedGroupIds);
    return new Success(item);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create Summary of Accounts item.", { name }, e);
  }
}

export async function updateSummaryItem(
  id: string,
  name?: string,
  linkedGroupIds?: string[],
): Promise<Result<SaaobSummaryItem>> {
  try {
    const [existing] = await db
      .select({ id: saaobSummaryOfAccounts.id, name: saaobSummaryOfAccounts.name })
      .from(saaobSummaryOfAccounts)
      .where(eq(saaobSummaryOfAccounts.id, id))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Summary item not found.", { id });
    }

    if (name !== undefined) {
      await db.update(saaobSummaryOfAccounts).set({ name }).where(eq(saaobSummaryOfAccounts.id, id));
    }

    if (linkedGroupIds !== undefined) {
      if (linkedGroupIds.length > 0) {
        const existingGroups = await db
          .select({ id: saaobEntryGroup.id })
          .from(saaobEntryGroup)
          .where(inArray(saaobEntryGroup.id, linkedGroupIds));
        const foundIds = new Set(existingGroups.map(g => g.id));
        const missingIds = linkedGroupIds.filter(gId => !foundIds.has(gId));
        if (missingIds.length > 0) {
          return new Failure(ErrorCodes.ValidationFailure, "Some linked groups do not exist.", { missingIds });
        }
      }

      await db.transaction(async tx => {
        await tx.delete(saaobSummaryOfAccountsLinkedGroups)
          .where(eq(saaobSummaryOfAccountsLinkedGroups.entryId, id));
        if (linkedGroupIds.length > 0) {
          await tx.insert(saaobSummaryOfAccountsLinkedGroups).values(
            linkedGroupIds.map(gId => ({ entryId: id, groupRefId: gId })),
          );
        }
      });
    }

    const currentLinks = await db
      .select({ groupRefId: saaobSummaryOfAccountsLinkedGroups.groupRefId })
      .from(saaobSummaryOfAccountsLinkedGroups)
      .where(eq(saaobSummaryOfAccountsLinkedGroups.entryId, id));

    const resolvedName = name ?? existing.name;
    const resolvedLinkedGroupIds = currentLinks.map(l => l.groupRefId);
    const item = await _fetchAndBuildSummaryItem(id, resolvedName, resolvedLinkedGroupIds);
    return new Success(item);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update Summary of Accounts item.", { id }, e);
  }
}

export async function deleteSummaryItem(id: string): Promise<Result<null>> {
  try {
    const [existing] = await db
      .select({ id: saaobSummaryOfAccounts.id })
      .from(saaobSummaryOfAccounts)
      .where(eq(saaobSummaryOfAccounts.id, id))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Summary item not found.", { id });
    }

    await db.transaction(async tx => {
      await tx.delete(saaobSummaryOfAccountsLinkedGroups)
        .where(eq(saaobSummaryOfAccountsLinkedGroups.entryId, id));
      await tx.delete(saaobSummaryOfAccounts).where(eq(saaobSummaryOfAccounts.id, id));
    });

    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete Summary of Accounts item.", { id }, e);
  }
}

/**
 * Validates a SAAOB template type from an untrusted value.
 *
 * @description
 * Accepts only `"header"` or `"footer"`. Used by API routes when parsing delete payloads.
 *
 * @function parseSaaobTemplateType
 * @param {unknown} type - Raw template type from the client.
 * @returns {Result<SaaobTemplateType>} Parsed type or a validation failure.
 */
export function parseSaaobTemplateType(type: unknown): Result<SaaobTemplateType> {
  if (type !== "header" && type !== "footer") {
    return new Failure(
      ErrorCodes.ValidationFailure,
      "Invalid template type. Must be 'header' or 'footer'.",
    );
  }
  return new Success(type);
}

/**
 * Returns header and footer templates for SAAOB main data export.
 *
 * @description
 * Uses {@link SAAOB_MAIN_DATA_TEMPLATE_IDENTIFIER}. Missing templates are returned as `null`
 * rather than failing the request.
 *
 * @async
 * @function getMainDataTemplates
 * @returns {Promise<Result<SaaobTemplatesBundle>>} Combined header/footer metadata or a failure result.
 */
export async function getMainDataTemplates(): Promise<Result<SaaobTemplatesBundle>> {
  return _fetchSaaobTemplatesBundle(SAAOB_MAIN_DATA_TEMPLATE_IDENTIFIER);
}

/**
 * Uploads a new header or footer template for SAAOB main data export.
 *
 * @description
 * Delegates to the template bucket using {@link SAAOB_MAIN_DATA_TEMPLATE_IDENTIFIER}. Fails when a
 * template for the same type already exists.
 *
 * @async
 * @function uploadMainDataTemplate
 * @param {SaaobTemplateUploadInput} input - Template type, file buffer, and original filename.
 * @returns {Promise<Result<SaaobTemplateInfo>>} Public template metadata on success, or a failure result.
 */
export async function uploadMainDataTemplate(
  input: SaaobTemplateUploadInput,
): Promise<Result<SaaobTemplateInfo>> {
  const result = await templateBucket.upload({
    identifier: SAAOB_MAIN_DATA_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });
  if (result instanceof Success) {
    return new Success(_mapSaaobTemplate(result.value));
  }
  return result;
}

/**
 * Replaces an existing header or footer template for SAAOB main data export.
 *
 * @async
 * @function modifyMainDataTemplate
 * @param {SaaobTemplateUploadInput} input - Template type, file buffer, and original filename.
 * @returns {Promise<Result<SaaobTemplateInfo>>} Updated template metadata on success, or a failure result.
 */
export async function modifyMainDataTemplate(
  input: SaaobTemplateUploadInput,
): Promise<Result<SaaobTemplateInfo>> {
  const result = await templateBucket.modify({
    identifier: SAAOB_MAIN_DATA_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });
  if (result instanceof Success) {
    return new Success(_mapSaaobTemplate(result.value));
  }
  return result;
}

/**
 * Removes a header or footer template for SAAOB main data export.
 *
 * @async
 * @function removeMainDataTemplate
 * @param {SaaobTemplateType} type - Template type to delete.
 * @returns {Promise<Result<void>>} Void success or a failure result.
 */
export async function removeMainDataTemplate(type: SaaobTemplateType): Promise<Result<void>> {
  return templateBucket.remove({
    identifier: SAAOB_MAIN_DATA_TEMPLATE_IDENTIFIER,
    type,
  });
}

/**
 * Returns header and footer templates for SAAOB office-scoped export.
 *
 * @description
 * Uses {@link SAAOB_OFFICE_DATA_TEMPLATE_IDENTIFIER}. Missing templates are returned as `null`
 * rather than failing the request.
 *
 * @async
 * @function getOfficeDataTemplates
 * @returns {Promise<Result<SaaobTemplatesBundle>>} Combined header/footer metadata or a failure result.
 */
export async function getOfficeDataTemplates(): Promise<Result<SaaobTemplatesBundle>> {
  return _fetchSaaobTemplatesBundle(SAAOB_OFFICE_DATA_TEMPLATE_IDENTIFIER);
}

/**
 * Uploads a new header or footer template for SAAOB office-scoped export.
 *
 * @async
 * @function uploadOfficeDataTemplate
 * @param {SaaobTemplateUploadInput} input - Template type, file buffer, and original filename.
 * @returns {Promise<Result<SaaobTemplateInfo>>} Public template metadata on success, or a failure result.
 */
export async function uploadOfficeDataTemplate(
  input: SaaobTemplateUploadInput,
): Promise<Result<SaaobTemplateInfo>> {
  const result = await templateBucket.upload({
    identifier: SAAOB_OFFICE_DATA_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });
  if (result instanceof Success) {
    return new Success(_mapSaaobTemplate(result.value));
  }
  return result;
}

/**
 * Replaces an existing header or footer template for SAAOB office-scoped export.
 *
 * @async
 * @function modifyOfficeDataTemplate
 * @param {SaaobTemplateUploadInput} input - Template type, file buffer, and original filename.
 * @returns {Promise<Result<SaaobTemplateInfo>>} Updated template metadata on success, or a failure result.
 */
export async function modifyOfficeDataTemplate(
  input: SaaobTemplateUploadInput,
): Promise<Result<SaaobTemplateInfo>> {
  const result = await templateBucket.modify({
    identifier: SAAOB_OFFICE_DATA_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });
  if (result instanceof Success) {
    return new Success(_mapSaaobTemplate(result.value));
  }
  return result;
}

/**
 * Removes a header or footer template for SAAOB office-scoped export.
 *
 * @async
 * @function removeOfficeDataTemplate
 * @param {SaaobTemplateType} type - Template type to delete.
 * @returns {Promise<Result<void>>} Void success or a failure result.
 */
export async function removeOfficeDataTemplate(type: SaaobTemplateType): Promise<Result<void>> {
  return templateBucket.remove({
    identifier: SAAOB_OFFICE_DATA_TEMPLATE_IDENTIFIER,
    type,
  });
}

/**
 * Exports SAAOB main data for the given month to an XLSX buffer.
 *
 * @description
 * Calls {@link getAll} for the provided year/month, then builds a formatted
 * Excel workbook using `@cj-tech-master/excelts`. If header/footer templates
 * are stored under {@link SAAOB_MAIN_DATA_TEMPLATE_IDENTIFIER} they are
 * prepended / appended row-by-row before the data.
 *
 * Formatting rules applied to the data sheet:
 * - Depth-0 groups → merged across all columns, bold, centred.
 * - Depth 1–2 groups → blue bold text, indent 0.
 * - Depth 3–4 groups → blue italic text, indent 1.
 * - Entries → regular text, indent 2, numeric values in selected columns.
 *
 * @async
 * @function exportMainDataToBuffer
 * @param {SaaobExportOptions} options - Year, month and selected columns.
 * @returns {Promise<Result<Buffer>>} XLSX file buffer on success, or a failure result.
 */
export async function exportMainDataToBuffer(
  options: SaaobExportOptions,
): Promise<Result<Buffer>> {
  try {
    const dataResult = await getAll(options.year, options.month);
    if (dataResult instanceof Failure) return dataResult;

    const [headerResult, footerResult] = await Promise.all([
      templateBucket.get({ identifier: SAAOB_MAIN_DATA_TEMPLATE_IDENTIFIER, type: "header" }),
      templateBucket.get({ identifier: SAAOB_MAIN_DATA_TEMPLATE_IDENTIFIER, type: "footer" }),
    ]);
    const headerPath = headerResult instanceof Success ? headerResult.value.templatePath : null;
    const footerPath = footerResult instanceof Success ? footerResult.value.templatePath : null;

    const buffer = await _buildSaaobExcelBuffer(dataResult.value, options.columns, headerPath, footerPath);
    return new Success(buffer);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to export SAAOB main data.", {}, e);
  }
}

/**
 * Exports SAAOB office-scoped data to an XLSX buffer.
 *
 * @description
 * Calls {@link getAllByOffice} for the given office, then builds a formatted
 * Excel workbook using `@cj-tech-master/excelts`. Header/footer templates
 * stored under {@link SAAOB_OFFICE_DATA_TEMPLATE_IDENTIFIER} are included
 * when present.
 *
 * @async
 * @function exportOfficeDataToBuffer
 * @param {string} officeId - Office ID whose tree to export.
 * @param {SaaobExportColumnKey[]} columns - Ordered list of data columns to include.
 * @returns {Promise<Result<Buffer>>} XLSX file buffer on success, or a failure result.
 */
export async function exportOfficeDataToBuffer(
  officeId: string,
  columns: SaaobExportColumnKey[],
): Promise<Result<Buffer>> {
  try {
    const dataResult = await getAllByOffice(officeId);
    if (dataResult instanceof Failure) return dataResult;

    const [headerResult, footerResult] = await Promise.all([
      templateBucket.get({ identifier: SAAOB_OFFICE_DATA_TEMPLATE_IDENTIFIER, type: "header" }),
      templateBucket.get({ identifier: SAAOB_OFFICE_DATA_TEMPLATE_IDENTIFIER, type: "footer" }),
    ]);
    const headerPath = headerResult instanceof Success ? headerResult.value.templatePath : null;
    const footerPath = footerResult instanceof Success ? footerResult.value.templatePath : null;

    const buffer = await _buildSaaobExcelBuffer(dataResult.value, columns, headerPath, footerPath);
    return new Success(buffer);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to export SAAOB office data.", {}, e);
  }
}

/**
 * Computes all derived financial fields for a single SAAOB entry row.
 *
 * @param {SaaobEntryRow} row - Raw DB row for the entry.
 * @param {SupplementalRow[]} supplementals - Supplemental rows whose `saaobId` matches this entry.
 * @param {ObrMainRow[]} obrRows - OBR main-data rows whose `saaobId` matches this entry.
 * @param {EsreRow[]} esreRows - ESRE rows whose `saaobId` matches this entry.
 * @param {Map<string, { appropriationTotal: Decimal; cutOffObligation: Decimal }>} lbacData - LBAC aggregates keyed by SAAOB entry ID.
 * @returns {SaaobEntry} Fully computed SAAOB entry.
 */
function _computeEntryObject(
  row: SaaobEntryRow,
  supplementals: SupplementalRow[],
  obrRows: ObrMainRow[],
  esreRows: EsreRow[],
  lbacData: Map<string, { appropriationTotal: Decimal; cutOffObligation: Decimal }>,
): SaaobEntry {
  const annualBudget = casts.castFromDecimal(row.annualBudget);

  const supplementalOrContinuing = supplementals.reduce((acc, s) => {
    const amt = casts.castFromDecimal(s.amount);
    return s.supplementalType === "less" ? acc.minus(amt) : acc.plus(amt);
  }, new Decimal(0));

  const appropriation = annualBudget.plus(supplementalOrContinuing);
  const allotment = row.allotmentShouldCopyFromAppropriation
    ? appropriation
    : (annualBudget.isZero() ? new Decimal(0) : (annualBudget.div(4)).mul(1).plus(supplementalOrContinuing));

  const obligation = obrRows.reduce(
    (acc, o) => acc.plus(casts.castFromDecimal(o.obligated)),
    new Decimal(0),
  );

  const unObligatedBalance = appropriation.minus(obligation);
  const percentage = appropriation.isZero() ? new Decimal(0) : obligation.div(appropriation).mul(100);

  const quarterlyAllotmentBalanceValue = allotment.minus(obligation);
  const quarterlyAllotmentBalancePercentage = allotment.isZero()
    ? new Decimal(0)
    : quarterlyAllotmentBalanceValue.div(allotment).mul(100);

  const disbursedValue = esreRows.reduce(
    (acc, e) => acc.plus(casts.castFromDecimal(e.amount)),
    new Decimal(0),
  );
  const disbursedPercentage = appropriation.isZero() ? new Decimal(0) : disbursedValue.div(appropriation).mul(100);
  const disbursedVariance = obligation.minus(disbursedValue);

  const lbac = lbacData.get(row.id);
  const lbacBudgetValue = lbac ? lbac.appropriationTotal : new Decimal(0);
  const lbacBudgetVariance = appropriation.minus(lbacBudgetValue);
  const lbacBudgetObligated = lbac ? lbac.cutOffObligation : new Decimal(0);
  const lbacBudgetVarianceObligated = obligation.minus(lbacBudgetObligated);

  const obligationWithPRsValue = obrRows.reduce((acc, o) => {
    const obligated = casts.castFromDecimal(o.obligated);
    const pr = o.prAmount ? casts.castFromDecimal(o.prAmount) : new Decimal(0);
    return acc.plus(obligated).plus(pr);
  }, new Decimal(0));
  const obligationWithPRsBalance = appropriation.minus(obligationWithPRsValue);
  const obligationWithPRsPercentage = appropriation.isZero()
    ? new Decimal(0)
    : obligationWithPRsValue.div(appropriation).mul(100);

  const pr = obligationWithPRsValue.minus(obligation);

  return {
    id: row.id,
    name: row.name,
    accountCode: row.accountCode ?? undefined,
    annualBudget: row.annualBudget,
    allotmentShouldCopyFromAppropriation: row.allotmentShouldCopyFromAppropriation,
    supplementalOrContinuing: supplementalOrContinuing.toString(),
    appropriation: appropriation.toString(),
    allotment: allotment.toString(),
    obligation: obligation.toString(),
    unObligatedBalance: unObligatedBalance.toString(),
    percentage: percentage.toString(),
    other: {
      quarterlyAllotmentBalance: {
        value: quarterlyAllotmentBalanceValue.toString(),
        percentage: quarterlyAllotmentBalancePercentage.toString(),
      },
      disbursed: {
        value: disbursedValue.toString(),
        percentage: disbursedPercentage.toString(),
        variance: disbursedVariance.toString(),
      },
      lbacBudget: {
        value: lbacBudgetValue.toString(),
        variance: lbacBudgetVariance.toString(),
        obligated: lbacBudgetObligated.toString(),
        varianceObligated: lbacBudgetVarianceObligated.toString(),
      },
      remarks: row.remarks ?? undefined,
      obligationWithPRs: {
        value: obligationWithPRsValue.toString(),
        balance: obligationWithPRsBalance.toString(),
        percentage: obligationWithPRsPercentage.toString(),
      },
      pr: pr.toString(),
    },
  };
}

/**
 * Batch-fetches all financial data for the given entry rows and returns fully
 * computed {@link SaaobEntry} objects.
 *
 * @async
 * @param {SaaobEntryRow[]} entryRows - The raw entry rows to compute.
 * @returns {Promise<SaaobEntry[]>} Computed entries in the same order as `entryRows`.
 */
async function _fetchAndComputeEntries(entryRows: SaaobEntryRow[], year?: number, month?: number): Promise<SaaobEntry[]> {
  if (entryRows.length === 0) return [];

  const ids = entryRows.map(e => e.id);
  const endOfMonth = _getEndOfCurrentMonthBoundaryUtc8(year, month);

  const [supplementals, obrRows, esreRows, lbacData] = await Promise.all([
    _fetchSupplementalBySaaobIds(ids, endOfMonth),
    _fetchObrDataBySaaobIds(ids, endOfMonth),
    _fetchEsreBySaaobIds(ids, endOfMonth),
    _fetchLbacDataBySaaobIds(ids, year, month),
  ]);

  const supplementalMap = new Map<string, SupplementalRow[]>();
  for (const s of supplementals) {
    const arr = supplementalMap.get(s.saaobId) ?? [];
    arr.push(s);
    supplementalMap.set(s.saaobId, arr);
  }

  const obrMap = new Map<string, ObrMainRow[]>();
  for (const o of obrRows) {
    const arr = obrMap.get(o.saaobId) ?? [];
    arr.push(o);
    obrMap.set(o.saaobId, arr);
  }

  const esreMap = new Map<string, EsreRow[]>();
  for (const e of esreRows) {
    const arr = esreMap.get(e.saaobId) ?? [];
    arr.push(e);
    esreMap.set(e.saaobId, arr);
  }

  return entryRows.map(row =>
    _computeEntryObject(
      row,
      supplementalMap.get(row.id) ?? [],
      obrMap.get(row.id) ?? [],
      esreMap.get(row.id) ?? [],
      lbacData,
    ),
  );
}

/**
 * Collects the IDs of all descendant groups of a given group by traversing
 * the `parentId` references in-memory.
 *
 * @param {string} groupId - The root group ID to start from.
 * @param {SaaobGroupRow[]} allGroups - The full flat list of groups.
 * @returns {string[]} IDs of all descendants (not including `groupId` itself).
 */
function _collectDescendantGroupIds(groupId: string, allGroups: SaaobGroupRow[]): string[] {
  const result: string[] = [];
  const queue = [groupId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = allGroups.filter(g => g.parentId === current);
    for (const child of children) {
      result.push(child.id);
      queue.push(child.id);
    }
  }
  return result;
}

/**
 * Builds a recursive {@link SaaobElements} tree from flat group and entry data.
 *
 * @param {SaaobGroupRow[]} groups - Flat list of groups (already ordered).
 * @param {Map<string, SaaobEntry[]>} entriesByGroup - Map from group ID to computed entries.
 * @param {Set<string>} [rootGroupIds] - When provided, only groups in this set are treated as
 *   roots; otherwise groups with `parentId === null` are roots.
 * @returns {SaaobElements} Recursive tree.
 */
function _buildTree(
  groups: SaaobGroupRow[],
  entriesByGroup: Map<string, SaaobEntry[]>,
  rootGroupIds?: Set<string>,
): SaaobElements {
  const childGroupsByParent = new Map<string, SaaobGroupRow[]>();
  for (const g of groups) {
    if (g.parentId) {
      const arr = childGroupsByParent.get(g.parentId) ?? [];
      arr.push(g);
      childGroupsByParent.set(g.parentId, arr);
    }
  }

  const collectAllEntriesForGroup = (groupId: string): SaaobEntry[] => {
    const result: SaaobEntry[] = [...(entriesByGroup.get(groupId) ?? [])];
    for (const childGroup of (childGroupsByParent.get(groupId) ?? [])) {
      result.push(...collectAllEntriesForGroup(childGroup.id));
    }
    return result;
  };

  const buildGroup = (group: SaaobGroupRow): SaaobGroup => {
    const childGroups = childGroupsByParent.get(group.id) ?? [];
    const childEntries = entriesByGroup.get(group.id) ?? [];
    return {
      id: group.id,
      name: group.name,
      officeId: group.officeId ?? undefined,
      total: _computeSummaryItemAggregate(collectAllEntriesForGroup(group.id)),
      children: [...childGroups.map(cg => buildGroup(cg)), ...childEntries],
    };
  };

  const rootGroups = rootGroupIds
    ? groups.filter(g => rootGroupIds.has(g.id))
    : groups.filter(g => g.parentId === null);

  return rootGroups.map(rg => buildGroup(rg));
}

/**
 * Builds a Map from group ID to computed SaaobEntry[], given the raw entry rows
 * and the fully computed entry objects (same length, same order).
 *
 * @param {SaaobEntryRow[]} entryRows - Raw entry rows.
 * @param {SaaobEntry[]} computedEntries - Computed entries in the same order.
 * @returns {Map<string, SaaobEntry[]>} Map keyed by `parentId`.
 */
function _buildEntriesByGroupMap(entryRows: SaaobEntryRow[], computedEntries: SaaobEntry[]): Map<string, SaaobEntry[]> {
  const map = new Map<string, SaaobEntry[]>();
  for (let i = 0; i < entryRows.length; i++) {
    const row = entryRows[i];
    const entry = computedEntries[i];
    if (!row || !entry) continue;
    const arr = map.get(row.parentId) ?? [];
    arr.push(entry);
    map.set(row.parentId, arr);
  }
  return map;
}

/**
 * Returns the exclusive upper-boundary Date (start of next month, UTC) for
 * "records created before or during the given month in UTC+8" filters.
 * When `year` and `month` are omitted the current UTC+8 date is used.
 *
 * @param {number} [year] - Full calendar year (e.g. 2026). Defaults to current UTC+8 year.
 * @param {number} [month] - Month number 1–12. Defaults to current UTC+8 month.
 * @returns {Date} Start of the following month as a UTC Date object.
 */
function _getEndOfCurrentMonthBoundaryUtc8(year?: number, month?: number): Date {
  const now = DateTime.now().setZone("UTC+8");
  const y = year ?? now.year;
  const m = month ?? now.month;
  return DateTime.fromObject(
    { year: m === 12 ? y + 1 : y, month: m === 12 ? 1 : m + 1, day: 1 },
    { zone: "UTC+8" },
  ).toUTC().toJSDate();
}

/**
 * Returns the start of the given month in UTC+8 as a UTC Date object.
 * When `year` and `month` are omitted the current UTC+8 date is used.
 *
 * @param {number} [year] - Full calendar year (e.g. 2026). Defaults to current UTC+8 year.
 * @param {number} [month] - Month number 1–12. Defaults to current UTC+8 month.
 * @returns {Date} Start of the given month as a UTC Date object.
 */
function _getCurrentMonthStartUtc8(year?: number, month?: number): Date {
  const now = DateTime.now().setZone("UTC+8");
  const y = year ?? now.year;
  const m = month ?? now.month;
  return DateTime.fromObject({ year: y, month: m, day: 1 }, { zone: "UTC+8" }).toUTC().toJSDate();
}

/**
 * Returns the quarter (1–4) for the given month number.
 * When `month` is omitted the current UTC+8 month is used.
 *
 * @param {number} [month] - Month number 1–12. Defaults to current UTC+8 month.
 * @returns {number} Quarter (1–4).
 */
function _getCurrentQuarterUtc8(month?: number): number {
  const m = month ?? DateTime.now().setZone("UTC+8").month;
  return Math.ceil(m / 3);
}

/**
 * Returns the given year, or the current UTC+8 year when omitted.
 *
 * @param {number} [year] - Full calendar year (e.g. 2026). Defaults to current UTC+8 year.
 * @returns {number} Year.
 */
function _getCurrentYearUtc8(year?: number): number {
  return year ?? DateTime.now().setZone("UTC+8").year;
}

/**
 * Fetches all SAAOB entry groups, optionally filtered by office ID.
 * Results are ordered by creation date ascending.
 *
 * @async
 * @param {string[]} [officeIds] - When provided, only groups with a matching `officeId` are returned.
 * @returns {Promise<SaaobGroupRow[]>} Flat list of group rows.
 */
async function _fetchAllGroups(officeIds?: string[]): Promise<SaaobGroupRow[]> {
  const query = db
    .select({
      id: saaobEntryGroup.id,
      name: saaobEntryGroup.name,
      parentId: saaobEntryGroup.parentId,
      officeId: saaobEntryGroup.officeId,
      createdAt: saaobEntryGroup.createdAt,
    })
    .from(saaobEntryGroup)
    .orderBy(asc(saaobEntryGroup.createdAt));

  if (officeIds && officeIds.length > 0) {
    return query.where(inArray(saaobEntryGroup.officeId, officeIds));
  }
  return query;
}

/**
 * Fetches SAAOB entry rows with their linked expense-class account code.
 * When `parentGroupIds` is provided only entries in those groups are returned.
 *
 * @async
 * @param {string[]} [parentGroupIds] - When provided, only entries whose `parentId` is in this list are returned.
 * @returns {Promise<SaaobEntryRow[]>} Flat list of entry rows.
 */
async function _fetchAllEntries(parentGroupIds?: string[]): Promise<SaaobEntryRow[]> {
  const query = db
    .select({
      id: saaobEntries.id,
      name: saaobEntries.name,
      accountCode: saaobEntries.accountCode,
      annualBudget: saaobEntries.annualBudget,
      remarks: saaobEntries.remarks,
      parentId: saaobEntries.parentId,
      allotmentShouldCopyFromAppropriation: saaobEntries.allotmentShouldCopyFromAppropriation,
    })
    .from(saaobEntries);

  if (parentGroupIds && parentGroupIds.length > 0) {
    return query.where(inArray(saaobEntries.parentId, parentGroupIds));
  }
  return query;
}

/**
 * Fetches supplemental records linked to the given SAAOB entry IDs, where the
 * record was created before `endOfMonth`.
 *
 * @async
 * @param {string[]} ids - SAAOB entry IDs to match against `supplemental.saaobId`.
 * @param {Date} endOfMonth - Exclusive upper date boundary (UTC).
 * @returns {Promise<SupplementalRow[]>} Matching supplemental rows.
 */
async function _fetchSupplementalBySaaobIds(ids: string[], endOfMonth: Date): Promise<SupplementalRow[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      saaobId: supplemental.saaobId,
      amount: supplemental.amount,
      supplementalType: supplemental.supplementalType,
    })
    .from(supplemental)
    .where(and(inArray(supplemental.saaobId, ids), lt(supplemental.createdAt, endOfMonth)));
  return rows.filter((r): r is typeof r & { saaobId: string } => r.saaobId !== null);
}

/**
 * Fetches OBR main-data records linked to the given SAAOB entry IDs, where
 * the record was created before `endOfMonth`.
 *
 * @async
 * @param {string[]} ids - SAAOB entry IDs to match against `obrMainData.saaobId`.
 * @param {Date} endOfMonth - Exclusive upper date boundary (UTC).
 * @returns {Promise<ObrMainRow[]>} Matching OBR rows.
 */
async function _fetchObrDataBySaaobIds(ids: string[], endOfMonth: Date): Promise<ObrMainRow[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      saaobId: obrMainData.saaobId,
      obligated: obrMainData.obligated,
      prAmount: obrMainData.prAmount,
    })
    .from(obrMainData)
    .where(and(inArray(obrMainData.saaobId, ids), lt(obrMainData.createdAt, endOfMonth)));
  return rows.filter((r): r is typeof r & { saaobId: string } => r.saaobId !== null);
}

/**
 * Fetches ESRE records linked to the given SAAOB entry IDs, where the record
 * was created before `endOfMonth`.
 *
 * @async
 * @param {string[]} ids - SAAOB entry IDs to match against `esre.saaobId`.
 * @param {Date} endOfMonth - Exclusive upper date boundary (UTC).
 * @returns {Promise<EsreRow[]>} Matching ESRE rows.
 */
async function _fetchEsreBySaaobIds(ids: string[], endOfMonth: Date): Promise<EsreRow[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      saaobId: esre.saaobId,
      amount: esre.amount,
    })
    .from(esre)
    .where(and(inArray(esre.saaobId, ids), lt(esre.createdAt, endOfMonth)));
  return rows.filter((r): r is typeof r & { saaobId: string } => r.saaobId !== null);
}

/**
 * Computes the LBAC-derived `appropriationTotal` and `cutOffObligation` for
 * each SAAOB entry ID by aggregating all matching `lbacItems` records.
 *
 * @description
 * For each SAAOB entry ID the function:
 * 1. Locates all `lbacItems` whose `saaobId` matches.
 * 2. For each lbac item computes `appropriationTotal` using the same formula as
 *    the LBAC service: proposedBudgetTotal + net supplemental augmentation
 *    (capped at the current quarter, current year, via the item's `aipRefCode`).
 * 3. Computes `cutOffObligation` as the sum of OBR AIP reference amounts whose
 *    parent OBR record was created before the start of the current month (UTC+8).
 * 4. Aggregates (sums) both values across all lbac items that share the same
 *    `saaobId`.
 *
 * @async
 * @param {string[]} ids - SAAOB entry IDs.
 * @returns {Promise<Map<string, { appropriationTotal: Decimal; cutOffObligation: Decimal }>>}
 *          A map keyed by SAAOB entry ID containing the aggregated lbac financial values.
 */
async function _fetchLbacDataBySaaobIds(
  ids: string[],
  year?: number,
  month?: number,
): Promise<Map<string, { appropriationTotal: Decimal; cutOffObligation: Decimal }>> {
  if (ids.length === 0) return new Map();

  const currentQuarter = _getCurrentQuarterUtc8(month);
  const currentYear = _getCurrentYearUtc8(year);
  const monthStart = _getCurrentMonthStartUtc8(year, month);

  const lbacRows = await db
    .select({
      id: lbacItems.id,
      saaobId: lbacItems.saaobId,
      proposedBudgetPS: lbacItems.proposedBudgetPS,
      proposedBudgetMOOE: lbacItems.proposedBudgetMOOE,
      proposedBudgetFE: lbacItems.proposedBudgetFE,
      proposedBudgetCO: lbacItems.proposedBudgetCO,
      aipRefCode: lbacItems.aipRefCode,
    })
    .from(lbacItems)
    .where(inArray(lbacItems.saaobId, ids));

  if (lbacRows.length === 0) return new Map();

  const aipRefIds = [...new Set(lbacRows.filter(r => r.aipRefCode).map(r => r.aipRefCode!))];

  type LbacSupplementalEntry = {
    aipRefId: string;
    amount: string;
    supplementalType: "less" | "add";
    quarter: number;
    year: number;
  };

  type LbacObrEntry = {
    aipReferenceId: string;
    amount: string;
    createdAt: Date;
  };

  const [lbacSupplementals, lbacObrAmounts] = await Promise.all([
    aipRefIds.length > 0
      ? db
        .select({
          aipRefCode: supplemental.aipRefCode,
          amount: supplemental.amount,
          supplementalType: supplemental.supplementalType,
          createdAt: supplemental.createdAt,
        })
        .from(supplemental)
        .where(inArray(supplemental.aipRefCode, aipRefIds))
        .then(rows =>
          rows
            .filter((r): r is typeof r & { aipRefCode: string } => r.aipRefCode !== null)
            .map((r): LbacSupplementalEntry => {
              const dt = DateTime.fromJSDate(r.createdAt as unknown as Date, { zone: "utc" }).setZone("UTC+8");
              return {
                aipRefId: r.aipRefCode,
                amount: r.amount,
                supplementalType: r.supplementalType,
                quarter: dt.quarter,
                year: dt.year,
              };
            }),
        )
      : Promise.resolve([] as LbacSupplementalEntry[]),

    aipRefIds.length > 0
      ? db
        .select({
          aipReferenceId: obrMainAipReferences.aipReferenceId,
          amount: obrMainAipReferences.amount,
          createdAt: obrMainData.createdAt,
        })
        .from(obrMainAipReferences)
        .innerJoin(obrMainData, eq(obrMainData.id, obrMainAipReferences.obrId))
        .where(inArray(obrMainAipReferences.aipReferenceId, aipRefIds))
        .then(rows =>
          rows
            .filter(
              (r): r is typeof r & { aipReferenceId: string; amount: string } =>
                r.aipReferenceId !== null && r.amount !== null,
            )
            .map((r): LbacObrEntry => ({
              aipReferenceId: r.aipReferenceId,
              amount: r.amount,
              createdAt: r.createdAt as unknown as Date,
            })),
        )
      : Promise.resolve([] as LbacObrEntry[]),
  ]);

  const result = new Map<string, { appropriationTotal: Decimal; cutOffObligation: Decimal }>();

  for (const lbacRow of lbacRows) {
    if (!lbacRow.saaobId) continue;

    const ps = casts.castFromDecimal(lbacRow.proposedBudgetPS);
    const mooe = casts.castFromDecimal(lbacRow.proposedBudgetMOOE);
    const fe = casts.castFromDecimal(lbacRow.proposedBudgetFE);
    const co = casts.castFromDecimal(lbacRow.proposedBudgetCO);
    const proposedBudgetTotal = ps.plus(mooe).plus(fe).plus(co);

    let contOrSupplemental = new Decimal(0);
    if (lbacRow.aipRefCode) {
      const relevant = lbacSupplementals.filter(
        s => s.aipRefId === lbacRow.aipRefCode && s.year === currentYear && s.quarter <= currentQuarter,
      );
      contOrSupplemental = relevant.reduce((acc, s) => {
        const amt = casts.castFromDecimal(s.amount);
        return s.supplementalType === "less" ? acc.minus(amt) : acc.plus(amt);
      }, new Decimal(0));
    }

    const appropriationTotal = proposedBudgetTotal.plus(contOrSupplemental);

    let cutOffObligation = new Decimal(0);
    if (lbacRow.aipRefCode) {
      cutOffObligation = lbacObrAmounts
        .filter(o => o.aipReferenceId === lbacRow.aipRefCode && o.createdAt < monthStart)
        .reduce((acc, o) => acc.plus(casts.castFromDecimal(o.amount)), new Decimal(0));
    }

    const existing = result.get(lbacRow.saaobId);
    if (existing) {
      result.set(lbacRow.saaobId, {
        appropriationTotal: existing.appropriationTotal.plus(appropriationTotal),
        cutOffObligation: existing.cutOffObligation.plus(cutOffObligation),
      });
    } else {
      result.set(lbacRow.saaobId, { appropriationTotal, cutOffObligation });
    }
  }

  return result;
}

function _collectDescendantSummaryGroupIds(
  groupId: string,
  allGroups: { id: string; parentId: string | null }[],
): string[] {
  const result: string[] = [];
  const queue = [groupId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = allGroups.filter(g => g.parentId === current);
    for (const child of children) {
      result.push(child.id);
      queue.push(child.id);
    }
  }
  return result;
}

function _collectEntriesForGroups(
  linkedGroupIds: string[],
  allSaaobGroups: SaaobGroupRow[],
  entriesByGroup: Map<string, SaaobEntry[]>,
): SaaobEntry[] {
  const allEntries: SaaobEntry[] = [];
  const visitedGroupIds = new Set<string>();

  for (const gId of linkedGroupIds) {
    const toVisit = [gId, ..._collectDescendantGroupIds(gId, allSaaobGroups)];
    for (const id of toVisit) {
      if (!visitedGroupIds.has(id)) {
        visitedGroupIds.add(id);
        allEntries.push(...(entriesByGroup.get(id) ?? []));
      }
    }
  }
  return allEntries;
}

function _computeSummaryItemAggregate(entries: SaaobEntry[]): SaaobSummaryItemAggregate {
  const zero = "0";
  if (entries.length === 0) {
    return {
      annualBudget: zero, supplementalOrContinuing: zero, appropriation: zero,
      allotment: zero, obligation: zero, unObligatedBalance: zero, percentage: zero,
      other: {
        quarterlyAllotmentBalance: { value: zero, percentage: zero },
        disbursed: { value: zero, percentage: zero, variance: zero },
        lbacBudget: { value: zero, variance: zero, obligated: zero, varianceObligated: zero },
        obligationWithPRs: { value: zero, balance: zero, percentage: zero },
        pr: zero,
      },
    };
  }

  const sum = (getter: (e: SaaobEntry) => string) =>
    entries.reduce((acc, e) => acc.plus(new Decimal(getter(e))), new Decimal(0));

  const annualBudget = sum(e => e.annualBudget);
  const supplementalOrContinuing = sum(e => e.supplementalOrContinuing);
  const appropriation = annualBudget.plus(supplementalOrContinuing);
  const allotment = sum(e => e.allotment);
  const obligation = sum(e => e.obligation);
  const unObligatedBalance = appropriation.minus(obligation);
  const percentage = appropriation.isZero() ? new Decimal(0) : obligation.div(appropriation).mul(100);

  const qabValue = allotment.minus(obligation);
  const qabPercentage = allotment.isZero() ? new Decimal(0) : obligation.div(allotment).mul(100);

  const disbursedValue = sum(e => e.other.disbursed.value);
  const disbursedPercentage = appropriation.isZero() ? new Decimal(0) : disbursedValue.div(appropriation).mul(100);
  const disbursedVariance = obligation.minus(disbursedValue);

  const lbacValue = sum(e => e.other.lbacBudget.value);
  const lbacVariance = sum(e => e.other.lbacBudget.variance);
  const lbacObligated = sum(e => e.other.lbacBudget.obligated);
  const lbacVarianceObligated = sum(e => e.other.lbacBudget.varianceObligated);

  const oblWithPRsValue = sum(e => e.other.obligationWithPRs.value);
  const oblWithPRsBalance = appropriation.minus(oblWithPRsValue);
  const oblWithPRsPercentage = appropriation.isZero() ? new Decimal(0) : oblWithPRsValue.div(appropriation).mul(100);

  const pr = sum(e => e.other.pr);

  return {
    annualBudget: annualBudget.toString(),
    supplementalOrContinuing: supplementalOrContinuing.toString(),
    appropriation: appropriation.toString(),
    allotment: allotment.toString(),
    obligation: obligation.toString(),
    unObligatedBalance: unObligatedBalance.toString(),
    percentage: percentage.toString(),
    other: {
      quarterlyAllotmentBalance: { value: qabValue.toString(), percentage: qabPercentage.toString() },
      disbursed: {
        value: disbursedValue.toString(),
        percentage: disbursedPercentage.toString(),
        variance: disbursedVariance.toString(),
      },
      lbacBudget: {
        value: lbacValue.toString(),
        variance: lbacVariance.toString(),
        obligated: lbacObligated.toString(),
        varianceObligated: lbacVarianceObligated.toString(),
      },
      obligationWithPRs: {
        value: oblWithPRsValue.toString(),
        balance: oblWithPRsBalance.toString(),
        percentage: oblWithPRsPercentage.toString(),
      },
      pr: pr.toString(),
    },
  };
}

function _buildSummaryTree(
  groups: SummaryGroupRow[],
  itemsByParentGroup: Map<string, SaaobSummaryItem[]>,
): SaaobSummaryElements {
  const childGroupsByParent = new Map<string, SummaryGroupRow[]>();
  for (const g of groups) {
    if (g.parentId) {
      const arr = childGroupsByParent.get(g.parentId) ?? [];
      arr.push(g);
      childGroupsByParent.set(g.parentId, arr);
    }
  }

  const buildGroup = (group: SummaryGroupRow): SaaobSummaryGroup => ({
    id: group.id,
    name: group.name,
    children: [
      ...(childGroupsByParent.get(group.id) ?? []).map(cg => buildGroup(cg)),
      ...(itemsByParentGroup.get(group.id) ?? []),
    ],
  });

  return groups.filter(g => g.parentId === null).map(rg => buildGroup(rg));
}

async function _fetchAndBuildSummaryItem(
  id: string,
  name: string,
  linkedGroupIds: string[],
): Promise<SaaobSummaryItem> {
  const allSaaobGroups = await _fetchAllGroups();
  const allNeededGroupIds = new Set<string>();
  for (const gId of linkedGroupIds) {
    allNeededGroupIds.add(gId);
    for (const desc of _collectDescendantGroupIds(gId, allSaaobGroups)) {
      allNeededGroupIds.add(desc);
    }
  }
  const entryRows = allNeededGroupIds.size > 0 ? await _fetchAllEntries([...allNeededGroupIds]) : [];
  const computedEntries = await _fetchAndComputeEntries(entryRows);
  const entriesByGroup = _buildEntriesByGroupMap(entryRows, computedEntries);
  const entries = _collectEntriesForGroups(linkedGroupIds, allSaaobGroups, entriesByGroup);
  const aggregate = _computeSummaryItemAggregate(entries);
  return { id, name, linkedGroupIds, ...aggregate };
}

function _mapSaaobTemplate(item: TemplateBucketItem): SaaobTemplateInfo {
  return {
    id: item.id,
    templateType: item.templateType,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function _getSaaobTemplateSlot(
  identifier: string,
  type: SaaobTemplateType,
): Promise<Result<SaaobTemplateInfo | null>> {
  const result = await templateBucket.get({ identifier, type });
  if (result instanceof Success) {
    return new Success(_mapSaaobTemplate(result.value));
  }
  if (result.type === ErrorCodes.ResourceNotFound) {
    return new Success(null);
  }
  return result;
}

async function _fetchSaaobTemplatesBundle(identifier: string): Promise<Result<SaaobTemplatesBundle>> {
  const headerResult = await _getSaaobTemplateSlot(identifier, "header");
  if (headerResult instanceof Failure) return headerResult;

  const footerResult = await _getSaaobTemplateSlot(identifier, "footer");
  if (footerResult instanceof Failure) return footerResult;

  return new Success({
    header: headerResult.value,
    footer: footerResult.value,
  });
}

function _isSaaobGroupNode(node: SaaobGroup | SaaobEntry): node is SaaobGroup {
  return "children" in node;
}

function _collectEntriesFromSaaobChildren(children: Array<SaaobGroup | SaaobEntry>): SaaobEntry[] {
  const result: SaaobEntry[] = [];
  for (const child of children) {
    if (_isSaaobGroupNode(child)) {
      result.push(..._collectEntriesFromSaaobChildren(child.children));
    } else {
      result.push(child);
    }
  }
  return result;
}

function _flattenForExport(
  nodes: Array<SaaobGroup | SaaobEntry>,
  depth: number,
): _ExportFlatRow[] {
  const rows: _ExportFlatRow[] = [];
  for (const node of nodes) {
    if (_isSaaobGroupNode(node)) {
      rows.push({ kind: "group", depth, data: node });
      rows.push(..._flattenForExport(node.children, depth + 1));
    } else {
      rows.push({ kind: "entry", depth, data: node });
    }
  }
  return rows;
}

function _getEntryColumnValue(entry: SaaobEntry, col: SaaobExportColumnKey): number | string {
  switch (col) {
  case "accountCode":                return entry.accountCode ?? "";
  case "annualBudget":               return parseFloat(entry.annualBudget) || 0;
  case "supplementalOrContinuing":   return parseFloat(entry.supplementalOrContinuing) || 0;
  case "appropriation":              return parseFloat(entry.appropriation) || 0;
  case "allotment":                  return parseFloat(entry.allotment) || 0;
  case "obligation":                 return parseFloat(entry.obligation) || 0;
  case "unobligatedBalance":         return parseFloat(entry.unObligatedBalance) || 0;
  case "percentage":                 return parseFloat(entry.percentage) || 0;
  case "remarks":                    return entry.other.remarks ?? "";
  case "quarterlyAllotmentBalance":      return parseFloat(entry.other.quarterlyAllotmentBalance.value) || 0;
  case "quarterlyAllotmentBalancePct":   return parseFloat(entry.other.quarterlyAllotmentBalance.percentage) || 0;
  case "disbursed":                  return parseFloat(entry.other.disbursed.value) || 0;
  case "disbursedPct":               return parseFloat(entry.other.disbursed.percentage) || 0;
  case "disbursedVariance":          return parseFloat(entry.other.disbursed.variance) || 0;
  case "lbacBudget":                 return parseFloat(entry.other.lbacBudget.value) || 0;
  case "lbacBudgetVariance":         return parseFloat(entry.other.lbacBudget.variance) || 0;
  case "lbacObligated":              return parseFloat(entry.other.lbacBudget.obligated) || 0;
  case "lbacObligatedVariance":      return parseFloat(entry.other.lbacBudget.varianceObligated) || 0;
  case "obligationWithPRs":          return parseFloat(entry.other.obligationWithPRs.value) || 0;
  case "obligationWithPRsBalance":   return parseFloat(entry.other.obligationWithPRs.balance) || 0;
  case "obligationWithPRsPct":       return parseFloat(entry.other.obligationWithPRs.percentage) || 0;
  case "pr":                         return parseFloat(entry.other.pr) || 0;
  default:
    return "";
  }
}

function _isNumericColumn(key: SaaobExportColumnKey): boolean {
  const col = SAAOB_EXPORT_COLUMNS.find(c => c.key === key) as { numeric: boolean } | undefined;
  return col ? col.numeric : false;
}

/**
 * Converts a formula cell's value to its last-calculated result, avoiding
 * broken formula references when pasting into a different sheet context.
 * Returns `null` for cells whose cached result is an Excel error (e.g. #VALUE!).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _resolveTemplateValue(cellValue: any): unknown {
  if (
    cellValue !== null
    && cellValue !== undefined
    && typeof cellValue === "object"
    && ("formula" in cellValue || "sharedFormula" in cellValue)
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (cellValue as any).result;
    if (result !== null && result !== undefined && typeof result === "object" && "error" in result) {
      return null;
    }
    return result ?? null;
  }
  return cellValue;
}

/**
 * Offsets a merged-cell range string (e.g. `"A1:Z3"`) by `rowOffset` rows.
 * Returns `null` if the string cannot be parsed.
 */
function _offsetMergeRange(range: string, rowOffset: number): string | null {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
  if (!m) return null;
  return `${m[1]}${parseInt(m[2]) + rowOffset}:${m[3]}${parseInt(m[4]) + rowOffset}`;
}

async function _copyTemplateRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  srcWorkbook: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  destWorksheet: any,
  startRow: number,
): Promise<number> {
  const srcWs = srcWorkbook.getWorksheet(1);
  if (!srcWs) return startRow;

  const rowOffset = startRow - 1;
  let currentRow = startRow;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  srcWs.eachRow({ includeEmpty: true }, (row: any) => {
    const destRow = destWorksheet.getRow(currentRow);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    row.eachCell({ includeEmpty: true }, (cell: any, colNum: number) => {
      // Skip slave cells of merged ranges — only the master cell carries the value
      if (cell.type === _MERGE_CELL_TYPE) return;

      const destCell = destRow.getCell(colNum);
      destCell.value = _resolveTemplateValue(cell.value);
      if (cell.font)      destCell.font      = cell.font;
      if (cell.fill)      destCell.fill      = cell.fill;
      if (cell.border)    destCell.border    = cell.border;
      if (cell.alignment) destCell.alignment = cell.alignment;
      if (cell.numFmt)    destCell.numFmt    = cell.numFmt;
    });
    if (row.height) destRow.height = row.height;
    destRow.commit();
    currentRow++;
  });

  // Re-apply merged cell ranges from the source sheet, offset to destination rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merges: string[] = (srcWs.model as any)?.mergeCells ?? [];
  for (const range of merges) {
    const adjusted = _offsetMergeRange(range, rowOffset);
    if (!adjusted) continue;
    try {
      destWorksheet.mergeCells(adjusted);
    } catch {
      // Ignore overlapping or invalid ranges
    }
  }

  return currentRow;
}

async function _buildSaaobExcelBuffer(
  tree: SaaobElements,
  columns: SaaobExportColumnKey[],
  headerTemplatePath: string | null,
  footerTemplatePath: string | null,
): Promise<Buffer> {
  const { Workbook } = await import("@cj-tech-master/excelts");

  const wb = new Workbook();
  const ws = wb.addWorksheet("SAAOB");

  const totalCols = 1 + columns.length;

  // Set column widths
  ws.getColumn(1).width = 52;
  columns.forEach((col, idx) => {
    const colDef = SAAOB_EXPORT_COLUMNS.find(c => c.key === col) as { numeric: boolean } | undefined;
    ws.getColumn(idx + 2).width = (col === "remarks" || col === "accountCode") ? 26 : 18;
    if (colDef?.numeric) ws.getColumn(idx + 2).numFmt = _NUM_FMT_AMOUNT;
  });

  let row = 1;

  // ---- Header template ----
  if (headerTemplatePath) {
    const headerWb = new Workbook();
    await headerWb.xlsx.readFile(headerTemplatePath);
    row = await _copyTemplateRows(headerWb, ws, row);
  }

  // ---- Column header row ----
  const hRow = ws.getRow(row);
  hRow.getCell(1).value = "Functions/Program/Project/Activity";
  columns.forEach((col, idx) => {
    const label = SAAOB_EXPORT_COLUMNS.find(c => c.key === col)?.label ?? col;
    hRow.getCell(idx + 2).value = label;
  });
  for (let c = 1; c <= totalCols; c++) {
    const cell = hRow.getCell(c);
    cell.font = { bold: true, size: 10 };
    cell.fill = _HEADER_FILL;
    cell.border = _THIN_BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }
  hRow.height = 32;
  hRow.commit();
  row++;

  // ---- Data rows ----
  const flatRows = _flattenForExport(tree, 0);
  for (const flatRow of flatRows) {
    const wsRow = ws.getRow(row);

    if (flatRow.kind === "group") {
      const { depth, data } = flatRow;

      if (depth === 0) {
        // Root group — merge all columns, bold, centred
        ws.mergeCells(row, 1, row, totalCols);
        const cell = wsRow.getCell(1);
        cell.value = data.name.toUpperCase();
        cell.font = { bold: true, size: 11, underline: true };
        cell.fill = _ROOT_FILL;
        cell.border = _THIN_BORDER;
        cell.alignment = { horizontal: "center", vertical: "middle" };
        wsRow.height = 20;
      } else if (depth <= 2) {
        // 2nd / 3rd level — blue bold, indent 0
        const cell = wsRow.getCell(1);
        cell.value = data.name;
        cell.font = { bold: true, color: _BLUE_COLOR, size: 10 };
        cell.border = _THIN_BORDER;
        cell.alignment = { vertical: "middle", indent: 0, wrapText: true };
        for (let c = 2; c <= totalCols; c++) {
          wsRow.getCell(c).border = _THIN_BORDER;
        }
      } else {
        // 4th / 5th level — blue italic, indent 1
        const cell = wsRow.getCell(1);
        cell.value = data.name;
        cell.font = { italic: true, color: _BLUE_COLOR, size: 10 };
        cell.border = _THIN_BORDER;
        cell.alignment = { vertical: "middle", indent: 1, wrapText: true };
        for (let c = 2; c <= totalCols; c++) {
          wsRow.getCell(c).border = _THIN_BORDER;
        }
      }
    } else {
      // Entry / item — indent 2, data in subsequent columns
      const { data } = flatRow;
      const nameCell = wsRow.getCell(1);
      nameCell.value = data.name;
      nameCell.font = { size: 10 };
      nameCell.border = _THIN_BORDER;
      nameCell.alignment = { vertical: "middle", indent: 2, wrapText: true };

      columns.forEach((col, idx) => {
        const dataCell = wsRow.getCell(idx + 2);
        dataCell.value = _getEntryColumnValue(data, col);
        dataCell.border = _THIN_BORDER;
        dataCell.alignment = { vertical: "middle", horizontal: _isNumericColumn(col) ? "right" : "left" };
        if (_isNumericColumn(col)) {
          dataCell.numFmt = col.includes("Pct") || col === "percentage" ? _NUM_FMT_PCT : _NUM_FMT_AMOUNT;
        }
      });
    }

    wsRow.commit();
    row++;
  }

  // ---- Footer template ----
  if (footerTemplatePath) {
    const footerWb = new Workbook();
    await footerWb.xlsx.readFile(footerTemplatePath);
    await _copyTemplateRows(footerWb, ws, row);
  }

  // Freeze the column header row
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];

  const rawBuffer = await wb.xlsx.writeBuffer();
  if (Buffer.isBuffer(rawBuffer)) return rawBuffer;
  // ExcelTS may return Uint8Array in some runtimes
  return Buffer.from(rawBuffer as unknown as Uint8Array);
}

export type SaaobCreateGroupPayload = {
  parentId?: string;
  officeId?: string | null;
  name: string;
};

export type SaaobCreateEntryPayload = {
  name: string;
  annualBudget: string;
  remarks?: string;
  /**
   * Optional explicit expense-code override. When omitted the service
   * auto-resolves the expense class by matching `expenseClasses.accountName`
   * (case-insensitive) against the entry name.
   */
  expenseCodeId?: string;
  /** When `true`, allotment copies the appropriation value instead of using the quarterly formula. */
  allotmentShouldCopyFromAppropriation?: boolean;
};

export type SaaobUpdateEntryPayload = Partial<SaaobCreateEntryPayload>;

export type SaaobEntry = {
  id: string;
  name: string;
  accountCode?: string;
  annualBudget: string;
  allotmentShouldCopyFromAppropriation: boolean;
  supplementalOrContinuing: string;
  appropriation: string;
  allotment: string;
  obligation: string;
  unObligatedBalance: string;
  percentage: string;
  other: {
    quarterlyAllotmentBalance: {
      value: string;
      percentage: string;
    };
    disbursed: {
      value: string;
      percentage: string;
      variance: string;
    };
    lbacBudget: {
      value: string;
      variance: string;
      obligated: string;
      varianceObligated: string;
    };
    remarks?: string;
    obligationWithPRs: {
      value: string;
      balance: string;
      percentage: string;
    };
    pr: string;
  };
};

export type BaseSaaobGroup = {
  id: string;
  name: string;
  officeId?: string;
};

export type SaaobGroup = BaseSaaobGroup & {
  total: SaaobSummaryItemAggregate;
  children: Array<SaaobGroup | SaaobEntry>;
};

export type SaaobElements = Array<SaaobGroup>;

/** Pruned recursive tree returned by {@link searchItems}. Same shape as {@link SaaobElements}. */
export type SaaobSearchResult = SaaobElements;

type SaaobGroupRow = {
  id: string;
  name: string;
  parentId: string | null;
  officeId: string | null;
  createdAt: Date;
};

type SaaobEntryRow = {
  id: string;
  name: string;
  accountCode: string | null;
  annualBudget: string;
  remarks: string | null;
  parentId: string;
  allotmentShouldCopyFromAppropriation: boolean;
};

type SupplementalRow = {
  saaobId: string;
  amount: string;
  supplementalType: "less" | "add";
};

export type SaaobTemplateType = templateBucket.TemplateType;

export type SaaobTemplateInfo = {
  id: string;
  templateType: SaaobTemplateType;
  createdAt: string;
  updatedAt: string;
};

export type SaaobTemplatesBundle = {
  header: SaaobTemplateInfo | null;
  footer: SaaobTemplateInfo | null;
};

export type SaaobTemplateUploadInput = {
  type: SaaobTemplateType;
  file: Buffer;
  filename: string;
};

export interface SaaobExportOptions {
  /** Calendar year (e.g. 2026) used to scope financial calculations. */
  year: number;
  /** Month number 1–12 used to scope financial calculations. */
  month: number;
  /** Ordered list of data-column keys to include in the exported sheet. */
  columns: SaaobExportColumnKey[];
}

type _ExportFlatRow =
  | { kind: "group"; depth: number; data: SaaobGroup }
  | { kind: "entry"; depth: number; data: SaaobEntry };

type ObrMainRow = {
  saaobId: string;
  obligated: string;
  prAmount: string | null;
};

type EsreRow = {
  saaobId: string;
  amount: string;
};

type SummaryGroupRow = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
};

export type SaaobSummaryItemAggregate = {
  annualBudget: string;
  supplementalOrContinuing: string;
  appropriation: string;
  allotment: string;
  obligation: string;
  unObligatedBalance: string;
  percentage: string;
  other: {
    quarterlyAllotmentBalance: { value: string; percentage: string };
    disbursed: { value: string; percentage: string; variance: string };
    lbacBudget: { value: string; variance: string; obligated: string; varianceObligated: string };
    obligationWithPRs: { value: string; balance: string; percentage: string };
    pr: string;
  };
};

export type SaaobSummaryItem = SaaobSummaryItemAggregate & {
  id: string;
  name: string;
  linkedGroupIds: string[];
};

export type BaseSaaobSummaryGroup = {
  id: string;
  name: string;
};

export type SaaobSummaryGroup = BaseSaaobSummaryGroup & {
  children: Array<SaaobSummaryGroup | SaaobSummaryItem>;
};

export type SaaobSummaryElements = Array<SaaobSummaryGroup>;
