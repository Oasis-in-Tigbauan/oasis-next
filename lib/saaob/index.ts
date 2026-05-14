import { and, asc, eq, ilike, inArray, lt } from "drizzle-orm";
import { DateTime } from "luxon";
import { Decimal } from "decimal.js";

import * as casts from "@/lib/types/casts";
import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import {
  esre,
  expenseClasses,
  lbacItems,
  obrMainAipReferences,
  obrMainData,
  saaobEntries,
  saaobEntryGroup,
  supplemental,
} from "@/lib/db/schema";
import { type User } from "@/lib/accounts";

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
export async function getAll(): Promise<Result<SaaobElements>> {
  try {
    const [groups, entryRows] = await Promise.all([_fetchAllGroups(), _fetchAllEntries()]);
    const computedEntries = await _fetchAndComputeEntries(entryRows);
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
 * The new group is created with `officeId = null` (global, not office-tagged).
 *
 * @async
 * @function createGroup
 * @param {string} name - Display name for the new group.
 * @param {User} _user - The authenticated user (reserved for future auditing).
 * @param {string} [parentId] - ID of the parent group, or omitted for a root group.
 * @returns {Promise<Result<SaaobGroup>>} The created group with an empty children array.
 */
export async function createGroup(name: string, _user: User, parentId?: string): Promise<Result<SaaobGroup>> {
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

    const [created] = await db
      .insert(saaobEntryGroup)
      .values({ name, parentId: parentId ?? null, officeId: null })
      .returning({ id: saaobEntryGroup.id, name: saaobEntryGroup.name });

    return new Success({ id: created.id, name: created.name, children: [] });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create SAAOB group.", { name, parentId }, e);
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
 * @returns {Promise<Result<BaseSaaobGroup>>} The updated group (id + name only).
 */
export async function updateGroup(id: string, name?: string): Promise<Result<BaseSaaobGroup>> {
  try {
    const [existing] = await db
      .select({ id: saaobEntryGroup.id, name: saaobEntryGroup.name })
      .from(saaobEntryGroup)
      .where(eq(saaobEntryGroup.id, id))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Group not found.", { id });
    }

    if (name !== undefined) {
      await db.update(saaobEntryGroup).set({ name }).where(eq(saaobEntryGroup.id, id));
    }

    return new Success({ id, name: name ?? existing.name });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update SAAOB group.", { id }, e);
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

      if (expandedGroupIds.has(group.id)) {
        return {
          id: group.id,
          name: group.name,
          children: [
            ...directChildGroups.map(cg => buildPrunedGroup(cg)),
            ...directChildEntries.map(e => computedEntryMap.get(e.id)).filter((e): e is SaaobEntry => e !== undefined),
          ],
        };
      }

      const relevantChildGroups = directChildGroups.filter(
        cg => pathGroupIds.has(cg.id) || expandedGroupIds.has(cg.id),
      );
      const relevantEntries = directChildEntries
        .filter(e => matchedEntryIds.has(e.id))
        .map(e => computedEntryMap.get(e.id))
        .filter((e): e is SaaobEntry => e !== undefined);

      return {
        id: group.id,
        name: group.name,
        children: [...relevantChildGroups.map(cg => buildPrunedGroup(cg)), ...relevantEntries],
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
  const allotment = appropriation;

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
async function _fetchAndComputeEntries(entryRows: SaaobEntryRow[]): Promise<SaaobEntry[]> {
  if (entryRows.length === 0) return [];

  const ids = entryRows.map(e => e.id);
  const endOfMonth = _getEndOfCurrentMonthBoundaryUtc8();

  const [supplementals, obrRows, esreRows, lbacData] = await Promise.all([
    _fetchSupplementalBySaaobIds(ids, endOfMonth),
    _fetchObrDataBySaaobIds(ids, endOfMonth),
    _fetchEsreBySaaobIds(ids, endOfMonth),
    _fetchLbacDataBySaaobIds(ids),
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

  const buildGroup = (group: SaaobGroupRow): SaaobGroup => {
    const childGroups = childGroupsByParent.get(group.id) ?? [];
    const childEntries = entriesByGroup.get(group.id) ?? [];
    return {
      id: group.id,
      name: group.name,
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
 * "records created before or during the current month in UTC+8" filters.
 *
 * @returns {Date} Start of next month as a UTC Date object.
 */
function _getEndOfCurrentMonthBoundaryUtc8(): Date {
  const now = DateTime.now().setZone("UTC+8");
  return DateTime.fromObject(
    { year: now.month === 12 ? now.year + 1 : now.year, month: now.month === 12 ? 1 : now.month + 1, day: 1 },
    { zone: "UTC+8" },
  ).toUTC().toJSDate();
}

/**
 * Returns the start of the current month in UTC+8 as a UTC Date object.
 *
 * @returns {Date} Start of the current month (UTC).
 */
function _getCurrentMonthStartUtc8(): Date {
  const now = DateTime.now().setZone("UTC+8");
  return DateTime.fromObject({ year: now.year, month: now.month, day: 1 }, { zone: "UTC+8" }).toUTC().toJSDate();
}

/**
 * Returns the current quarter (1–4) in UTC+8.
 *
 * @returns {number} Current quarter.
 */
function _getCurrentQuarterUtc8(): number {
  return DateTime.now().setZone("UTC+8").quarter;
}

/**
 * Returns the current year in UTC+8.
 *
 * @returns {number} Current year.
 */
function _getCurrentYearUtc8(): number {
  return DateTime.now().setZone("UTC+8").year;
}

// ---------------------------------------------------------------------------
// Private batch-fetch helpers
// ---------------------------------------------------------------------------

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
): Promise<Map<string, { appropriationTotal: Decimal; cutOffObligation: Decimal }>> {
  if (ids.length === 0) return new Map();

  const currentQuarter = _getCurrentQuarterUtc8();
  const currentYear = _getCurrentYearUtc8();
  const monthStart = _getCurrentMonthStartUtc8();

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

export type SaaobCreateGroupPayload = {
  parentId?: string;
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
};

export type SaaobUpdateEntryPayload = Partial<SaaobCreateEntryPayload>;

export type SaaobEntry = {
  id: string;
  name: string;
  accountCode?: string;
  annualBudget: string;
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
};

export type SaaobGroup = BaseSaaobGroup & {
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
};

type SupplementalRow = {
  saaobId: string;
  amount: string;
  supplementalType: "less" | "add";
};

type ObrMainRow = {
  saaobId: string;
  obligated: string;
  prAmount: string | null;
};

type EsreRow = {
  saaobId: string;
  amount: string;
};
