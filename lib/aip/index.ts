import { and, eq, ilike, or } from "drizzle-orm";

import * as casts from "@/lib/types/casts";
import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import { aipReferences } from "@/lib/db/schema";
import { validatorUtilities } from "@/lib/validators";

/**
 * Retrieves all AIP references as a nested tree structure.
 *
 * @description
 * Fetches all records from the `aip_references` table ordered by creation date. Builds the tree
 * in-memory by mapping each record to an {@link AipNode} and linking children to their parent via
 * `parentId`. Root nodes are groups with no parent (`parentId = null`) and form the top level of
 * the returned array.
 *
 * On success, wraps the root node list in a {@link Success}. On unexpected failure, wraps the error
 * in a fatal {@link Failure}.
 *
 * @async
 * @function all
 * @returns {Promise<Result<AipNode[]>>} A result wrapper containing the root-level nodes on success,
 *                                       or a failure result on error.
 *
 * @remarks
 * - Returns an empty array when no records exist.
 * - Orphaned records (parentId references a non-existent node) are silently excluded from the tree.
 */
export async function all(): Promise<Result<AipNode[]>> {
  try {
    const rows = await db
      .select()
      .from(aipReferences)
      .orderBy(aipReferences.createdAt);

    const items = rows.map(_mapRow);
    const map = new Map<string, AipNode>();
    for (const item of items) {
      map.set(item.id, { ...item, children: [] });
    }

    const roots: AipNode[] = [];
    for (const node of map.values()) {
      if (node.parentId === null) {
        roots.push(node);
      } else {
        const parent = map.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        }
      }
    }

    return new Success(roots);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to fetch AIP references.", {}, e);
  }
}

/**
 * Creates a new AIP reference group.
 *
 * @description
 * Inserts a new record of type `group`. If a `parentId` is supplied, validates that the referenced
 * record exists and is itself a group — items cannot act as parents for groups. Fields that are not
 * provided are omitted from the insert and default to `null` in the database.
 *
 * On success, retrieves the newly created record via {@link _getAipReferenceById} and wraps it in a
 * {@link Success}. On validation failure, returns a {@link Failure} describing the invalid reference.
 * On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function createGroup
 * @param {CreateGroupPayload} payload - Payload containing required and optional fields for the new group.
 * @returns {Promise<Result<AipReferenceItem>>} A result wrapper containing the created group on success,
 *                                              or a failure result on error.
 *
 * @remarks
 * - `implementationStart` and `implementationCompletion` are optional for groups.
 * - All monetary amount fields are stored as decimals; string values are converted before insertion.
 */
export async function createGroup(payload: CreateGroupPayload): Promise<Result<AipReferenceItem>> {
  try {
    if (validatorUtilities.isUuid(payload.parentId)) {
      const [parent] = await db
        .select({ id: aipReferences.id, type: aipReferences.type })
        .from(aipReferences)
        .where(eq(aipReferences.id, payload.parentId!))
        .limit(1);
      if (!parent) {
        return new Failure(ErrorCodes.ValidationFailure, "Parent group not found.", { payload });
      }
      if (parent.type !== "group") {
        return new Failure(ErrorCodes.ValidationFailure, "Parent must be a group.", { payload });
      }
    }

    const [inserted] = await db
      .insert(aipReferences)
      .values({
        type: "group",
        ...(validatorUtilities.isUuid(payload.parentId) ? { parentId: payload.parentId } : {}),
        aipReferenceCode: payload.aipReferenceCode,
        description: payload.description,
        ...(payload.implementationStart !== undefined ? { implementationStart: payload.implementationStart } : {}),
        ...(payload.implementationCompletion !== undefined ? { implementationCompletion: payload.implementationCompletion } : {}),
        ...(validatorUtilities.isNotEmpty(payload.sector) ? { sector: payload.sector } : {}),
        ...(validatorUtilities.isNotEmpty(payload.code) ? { code: payload.code } : {}),
        ...(validatorUtilities.isNotEmpty(payload.office) ? { office: payload.office } : {}),
        ...(validatorUtilities.isNotEmpty(payload.implementingOffice) ? { implementingOffice: payload.implementingOffice } : {}),
        ...(validatorUtilities.isNotEmpty(payload.expectedOutputs) ? { expectedOutputs: payload.expectedOutputs } : {}),
        ...(validatorUtilities.isNotEmpty(payload.fundingSource) ? { fundingSource: payload.fundingSource } : {}),
        ...(validatorUtilities.isNotEmpty(payload.ccTopologyCode) ? { ccTopologyCode: payload.ccTopologyCode } : {}),
        ...(payload.amountPS !== undefined ? { amountPS: casts.castToDecimal(payload.amountPS) } : {}),
        ...(payload.amountMOOE !== undefined ? { amountMOOE: casts.castToDecimal(payload.amountMOOE) } : {}),
        ...(payload.amountCO !== undefined ? { amountCO: casts.castToDecimal(payload.amountCO) } : {}),
        ...(payload.amountCCAdapt !== undefined ? { amountCCAdapt: casts.castToDecimal(payload.amountCCAdapt) } : {}),
        ...(payload.amountCCMitigate !== undefined ? { amountCCMitigate: casts.castToDecimal(payload.amountCCMitigate) } : {}),
        ...(payload.gadAmount !== undefined ? { gadAmount: casts.castToDecimal(payload.gadAmount) } : {}),
        ...(payload.gadable !== undefined ? { gadable: payload.gadable } : {}),
      })
      .returning({ id: aipReferences.id });

    if (!inserted) {
      return new Failure(ErrorCodes.Fatal, "Failed to create group.", { payload });
    }

    const item = await _getAipReferenceById(inserted.id);
    if (!item) {
      return new Failure(ErrorCodes.Fatal, "Failed to retrieve created group.", { id: inserted.id });
    }

    return new Success(item);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create group.", { payload }, e);
  }
}

/**
 * Adds a new AIP reference item.
 *
 * @description
 * Inserts a new record of type `item`. The `parentId` is optional; when provided, it must reference
 * an existing record of type `group`. When omitted, the item is stored at the root level. Fields
 * that are not provided are omitted from the insert and default to `null` in the database.
 *
 * On success, retrieves the newly created record via {@link _getAipReferenceById} and wraps it in a
 * {@link Success}. On validation failure, returns a {@link Failure} describing the invalid parent
 * reference. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function addItem
 * @param {AddItemPayload} payload - Payload containing required and optional fields for the new item.
 * @returns {Promise<Result<AipReferenceItem>>} A result wrapper containing the created item on success,
 *                                              or a failure result on error.
 *
 * @remarks
 * - `implementationStart` and `implementationCompletion` are required for items.
 * - All monetary amount fields are stored as decimals; string values are converted before insertion.
 */
export async function addItem(payload: AddItemPayload): Promise<Result<AipReferenceItem>> {
  try {
    if (validatorUtilities.isUuid(payload.parentId)) {
      const [parent] = await db
        .select({ id: aipReferences.id, type: aipReferences.type })
        .from(aipReferences)
        .where(eq(aipReferences.id, payload.parentId!))
        .limit(1);

      if (!parent) {
        return new Failure(ErrorCodes.ValidationFailure, "Parent group not found.", { payload });
      }
      if (parent.type !== "group") {
        return new Failure(ErrorCodes.ValidationFailure, "Parent must be a group.", { payload });
      }
    }

    const [inserted] = await db
      .insert(aipReferences)
      .values({
        type: "item",
        ...(validatorUtilities.isUuid(payload.parentId) ? { parentId: payload.parentId } : {}),
        aipReferenceCode: payload.aipReferenceCode,
        description: payload.description,
        implementationStart: payload.implementationStart,
        implementationCompletion: payload.implementationCompletion,
        ...(validatorUtilities.isNotEmpty(payload.sector) ? { sector: payload.sector } : {}),
        ...(validatorUtilities.isNotEmpty(payload.code) ? { code: payload.code } : {}),
        ...(validatorUtilities.isNotEmpty(payload.office) ? { office: payload.office } : {}),
        ...(validatorUtilities.isNotEmpty(payload.implementingOffice) ? { implementingOffice: payload.implementingOffice } : {}),
        ...(validatorUtilities.isNotEmpty(payload.expectedOutputs) ? { expectedOutputs: payload.expectedOutputs } : {}),
        ...(validatorUtilities.isNotEmpty(payload.fundingSource) ? { fundingSource: payload.fundingSource } : {}),
        ...(validatorUtilities.isNotEmpty(payload.ccTopologyCode) ? { ccTopologyCode: payload.ccTopologyCode } : {}),
        ...(payload.amountPS !== undefined ? { amountPS: casts.castToDecimal(payload.amountPS) } : {}),
        ...(payload.amountMOOE !== undefined ? { amountMOOE: casts.castToDecimal(payload.amountMOOE) } : {}),
        ...(payload.amountCO !== undefined ? { amountCO: casts.castToDecimal(payload.amountCO) } : {}),
        ...(payload.amountCCAdapt !== undefined ? { amountCCAdapt: casts.castToDecimal(payload.amountCCAdapt) } : {}),
        ...(payload.amountCCMitigate !== undefined ? { amountCCMitigate: casts.castToDecimal(payload.amountCCMitigate) } : {}),
        ...(payload.gadAmount !== undefined ? { gadAmount: casts.castToDecimal(payload.gadAmount) } : {}),
        ...(payload.gadable !== undefined ? { gadable: payload.gadable } : {}),
      })
      .returning({ id: aipReferences.id });

    if (!inserted) {
      return new Failure(ErrorCodes.Fatal, "Failed to create item.", { payload });
    }

    const item = await _getAipReferenceById(inserted.id);
    if (!item) {
      return new Failure(ErrorCodes.Fatal, "Failed to retrieve created item.", { id: inserted.id });
    }

    return new Success(item);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create item.", { payload }, e);
  }
}

/**
 * Updates an existing AIP reference group with the given partial payload.
 *
 * @description
 * Verifies the record exists and is of type `group`; returns a resource-not-found failure if not.
 * If a new `parentId` is provided, validates that the proposed parent exists and is a group. To
 * prevent circular references, walks the ancestor chain from the proposed parent upward; if the
 * current group's identifier is encountered, the update is rejected. Passing `parentId: null`
 * promotes the group to root level. Only fields present in the payload are written; absent fields
 * are left unchanged.
 *
 * On success, retrieves the updated record via {@link _getAipReferenceById} and wraps it in a
 * {@link Success}. On validation or not-found failure, returns an appropriate {@link Failure}. On
 * unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function updateGroup
 * @param {string} id - Identifier of the group to update.
 * @param {UpdateGroupPayload} payload - Partial payload containing fields to update.
 * @returns {Promise<Result<AipReferenceItem>>} A result wrapper containing the updated group on success,
 *                                              or a failure result on error.
 *
 * @remarks
 * - Passing `parentId: null` clears the parent, making this group a root-level group.
 * - Omitting `parentId` from the payload leaves the existing parent relationship unchanged.
 * - Circular reference detection performs sequential DB lookups up the ancestor chain.
 */
export async function updateGroup(id: string, payload: UpdateGroupPayload): Promise<Result<AipReferenceItem>> {
  try {
    const [existing] = await db
      .select({ id: aipReferences.id, type: aipReferences.type })
      .from(aipReferences)
      .where(and(eq(aipReferences.id, id), eq(aipReferences.type, "group")))
      .limit(1);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such group found.", { id });
    }

    if (typeof payload.parentId !== "undefined") {
      if (payload.parentId === null) {
        // Clearing parent — becoming a root group, allowed
      } else if (validatorUtilities.isUuid(payload.parentId)) {
        const [newParent] = await db
          .select({ id: aipReferences.id, type: aipReferences.type })
          .from(aipReferences)
          .where(eq(aipReferences.id, payload.parentId))
          .limit(1);

        if (!newParent) {
          return new Failure(ErrorCodes.ValidationFailure, "Parent group not found.", { payload });
        }
        if (newParent.type !== "group") {
          return new Failure(ErrorCodes.ValidationFailure, "Parent must be a group.", { payload });
        }

        // Prevent circular reference: walk up from the proposed parent and ensure
        // we never encounter the current group's id
        const isCircular = await _isDescendant(id, payload.parentId);
        if (isCircular) {
          return new Failure(ErrorCodes.ValidationFailure, "Cannot set a descendant as parent (circular reference).", { id, payload });
        }
      }
    }

    await db
      .update(aipReferences)
      .set({
        ...(validatorUtilities.isNotEmpty(payload.aipReferenceCode) ? { aipReferenceCode: payload.aipReferenceCode } : {}),
        ...(validatorUtilities.isNotEmpty(payload.description) ? { description: payload.description } : {}),
        ...(payload.implementationStart !== undefined ? { implementationStart: payload.implementationStart } : {}),
        ...(payload.implementationCompletion !== undefined ? { implementationCompletion: payload.implementationCompletion } : {}),
        ...(validatorUtilities.isNotEmpty(payload.sector) ? { sector: payload.sector } : {}),
        ...(validatorUtilities.isNotEmpty(payload.code) ? { code: payload.code } : {}),
        ...(validatorUtilities.isNotEmpty(payload.office) ? { office: payload.office } : {}),
        ...(validatorUtilities.isNotEmpty(payload.implementingOffice) ? { implementingOffice: payload.implementingOffice } : {}),
        ...(validatorUtilities.isNotEmpty(payload.expectedOutputs) ? { expectedOutputs: payload.expectedOutputs } : {}),
        ...(validatorUtilities.isNotEmpty(payload.fundingSource) ? { fundingSource: payload.fundingSource } : {}),
        ...(validatorUtilities.isNotEmpty(payload.ccTopologyCode) ? { ccTopologyCode: payload.ccTopologyCode } : {}),
        ...(payload.amountPS !== undefined ? { amountPS: casts.castToDecimal(payload.amountPS) } : {}),
        ...(payload.amountMOOE !== undefined ? { amountMOOE: casts.castToDecimal(payload.amountMOOE) } : {}),
        ...(payload.amountCO !== undefined ? { amountCO: casts.castToDecimal(payload.amountCO) } : {}),
        ...(payload.amountCCAdapt !== undefined ? { amountCCAdapt: casts.castToDecimal(payload.amountCCAdapt) } : {}),
        ...(payload.amountCCMitigate !== undefined ? { amountCCMitigate: casts.castToDecimal(payload.amountCCMitigate) } : {}),
        ...(payload.gadAmount !== undefined ? { gadAmount: casts.castToDecimal(payload.gadAmount) } : {}),
        ...(payload.gadable !== undefined ? { gadable: payload.gadable } : {}),
        ...(typeof payload.parentId !== "undefined" ? { parentId: payload.parentId } : {}),
      })
      .where(eq(aipReferences.id, id));

    const item = await _getAipReferenceById(id);
    if (!item) {
      return new Failure(ErrorCodes.Fatal, "Failed to retrieve updated group.", { id });
    }

    return new Success(item);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update group.", { id, payload }, e);
  }
}

/**
 * Updates an existing AIP reference item with the given partial payload.
 *
 * @description
 * Verifies the record exists and is of type `item`; returns a resource-not-found failure if not.
 * If a new `parentId` is provided, validates that the proposed parent exists and is a group. Passing
 * `parentId: null` moves the item to the root level. Only fields present in the payload are written;
 * absent fields are left unchanged.
 *
 * On success, retrieves the updated record via {@link _getAipReferenceById} and wraps it in a
 * {@link Success}. On validation or not-found failure, returns an appropriate {@link Failure}. On
 * unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function updateItem
 * @param {string} id - Identifier of the item to update.
 * @param {UpdateItemPayload} payload - Partial payload containing fields to update.
 * @returns {Promise<Result<AipReferenceItem>>} A result wrapper containing the updated item on success,
 *                                              or a failure result on error.
 */
export async function updateItem(id: string, payload: UpdateItemPayload): Promise<Result<AipReferenceItem>> {
  try {
    const [existing] = await db
      .select({ id: aipReferences.id, type: aipReferences.type })
      .from(aipReferences)
      .where(and(eq(aipReferences.id, id), eq(aipReferences.type, "item")))
      .limit(1);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such item found.", { id });
    }

    if (validatorUtilities.isUuid(payload.parentId)) {
      const [newParent] = await db
        .select({ id: aipReferences.id, type: aipReferences.type })
        .from(aipReferences)
        .where(eq(aipReferences.id, payload.parentId!))
        .limit(1);

      if (!newParent) {
        return new Failure(ErrorCodes.ValidationFailure, "Parent group not found.", { payload });
      }
      if (newParent.type !== "group") {
        return new Failure(ErrorCodes.ValidationFailure, "Parent must be a group.", { payload });
      }
    }

    await db
      .update(aipReferences)
      .set({
        ...(validatorUtilities.isNotEmpty(payload.aipReferenceCode) ? { aipReferenceCode: payload.aipReferenceCode } : {}),
        ...(validatorUtilities.isNotEmpty(payload.description) ? { description: payload.description } : {}),
        ...(payload.implementationStart !== undefined ? { implementationStart: payload.implementationStart } : {}),
        ...(payload.implementationCompletion !== undefined ? { implementationCompletion: payload.implementationCompletion } : {}),
        ...(validatorUtilities.isNotEmpty(payload.sector) ? { sector: payload.sector } : {}),
        ...(validatorUtilities.isNotEmpty(payload.code) ? { code: payload.code } : {}),
        ...(validatorUtilities.isNotEmpty(payload.office) ? { office: payload.office } : {}),
        ...(validatorUtilities.isNotEmpty(payload.implementingOffice) ? { implementingOffice: payload.implementingOffice } : {}),
        ...(validatorUtilities.isNotEmpty(payload.expectedOutputs) ? { expectedOutputs: payload.expectedOutputs } : {}),
        ...(validatorUtilities.isNotEmpty(payload.fundingSource) ? { fundingSource: payload.fundingSource } : {}),
        ...(validatorUtilities.isNotEmpty(payload.ccTopologyCode) ? { ccTopologyCode: payload.ccTopologyCode } : {}),
        ...(payload.amountPS !== undefined ? { amountPS: casts.castToDecimal(payload.amountPS) } : {}),
        ...(payload.amountMOOE !== undefined ? { amountMOOE: casts.castToDecimal(payload.amountMOOE) } : {}),
        ...(payload.amountCO !== undefined ? { amountCO: casts.castToDecimal(payload.amountCO) } : {}),
        ...(payload.amountCCAdapt !== undefined ? { amountCCAdapt: casts.castToDecimal(payload.amountCCAdapt) } : {}),
        ...(payload.amountCCMitigate !== undefined ? { amountCCMitigate: casts.castToDecimal(payload.amountCCMitigate) } : {}),
        ...(payload.gadAmount !== undefined ? { gadAmount: casts.castToDecimal(payload.gadAmount) } : {}),
        ...(payload.gadable !== undefined ? { gadable: payload.gadable } : {}),
        ...(typeof payload.parentId !== "undefined" ? { parentId: payload.parentId } : {}),
      })
      .where(eq(aipReferences.id, id));

    const item = await _getAipReferenceById(id);
    if (!item) {
      return new Failure(ErrorCodes.Fatal, "Failed to retrieve updated item.", { id });
    }

    return new Success(item);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update item.", { id, payload }, e);
  }
}

/**
 * Deletes an existing AIP reference group.
 *
 * @description
 * Verifies the record exists and is of type `group`; returns a resource-not-found failure if not.
 * Checks whether the group has any direct children (items or nested groups with a matching
 * `parentId`). If children exist, the deletion is rejected — all children must be moved or deleted
 * first. Otherwise, the group record is deleted.
 *
 * On success, wraps `undefined` in a {@link Success}. On validation or not-found failure, returns an
 * appropriate {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function deleteGroup
 * @param {string} id - Identifier of the group to delete.
 * @returns {Promise<Result<void>>} A result wrapper containing void on success, or a failure result
 *                                  on error.
 *
 * @remarks
 * - The group must be empty (no children) before it can be deleted.
 */
export async function deleteGroup(id: string): Promise<Result<void>> {
  try {
    const [existing] = await db
      .select({ id: aipReferences.id })
      .from(aipReferences)
      .where(and(eq(aipReferences.id, id), eq(aipReferences.type, "group")))
      .limit(1);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such group found.", { id });
    }

    const [child] = await db
      .select({ id: aipReferences.id })
      .from(aipReferences)
      .where(eq(aipReferences.parentId, id))
      .limit(1);

    if (child) {
      return new Failure(ErrorCodes.ValidationFailure, "Group has children. Move them out before deleting.", { id });
    }

    await db.delete(aipReferences).where(eq(aipReferences.id, id));
    return new Success(undefined);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete group.", { id }, e);
  }
}

/**
 * Deletes an existing AIP reference item.
 *
 * @description
 * Verifies the record exists and is of type `item`; returns a resource-not-found failure if not.
 * Checks whether the item has any direct children. If children exist, the deletion is rejected —
 * all nested records must be removed first. Otherwise, the item record is deleted.
 *
 * On success, wraps `undefined` in a {@link Success}. On validation or not-found failure, returns an
 * appropriate {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function deleteItem
 * @param {string} id - Identifier of the item to delete.
 * @returns {Promise<Result<void>>} A result wrapper containing void on success, or a failure result
 *                                  on error.
 *
 * @remarks
 * - The item must have no nested children before it can be deleted.
 */
export async function deleteItem(id: string): Promise<Result<void>> {
  try {
    const [existing] = await db
      .select({ id: aipReferences.id })
      .from(aipReferences)
      .where(and(eq(aipReferences.id, id), eq(aipReferences.type, "item")))
      .limit(1);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such item found.", { id });
    }

    const [child] = await db
      .select({ id: aipReferences.id })
      .from(aipReferences)
      .where(eq(aipReferences.parentId, id))
      .limit(1);

    if (child) {
      return new Failure(ErrorCodes.ValidationFailure, "Item has nested children. Remove them before deleting.", { id });
    }

    await db.delete(aipReferences).where(eq(aipReferences.id, id));
    return new Success(undefined);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete item.", { id }, e);
  }
}

/**
 * Converts an existing AIP reference from one type to the other.
 *
 * @description
 * Verifies the record exists, then updates its `type` to the requested target type. Converting a
 * group to an item is only allowed when the group has no children, since children under an item are
 * not supported by the cleanup workflow. If the record is already of the requested type, the current
 * record is returned unchanged.
 *
 * On success, retrieves the converted record via {@link _getAipReferenceById} and wraps it in a
 * {@link Success}. On validation or not-found failure, returns an appropriate {@link Failure}. On
 * unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function convert
 * @param {string} id - Identifier of the reference to convert.
 * @param {"group" | "item"} targetType - Target type to apply to the reference.
 * @returns {Promise<Result<AipReferenceItem>>} A result wrapper containing the converted reference on success,
 *                                              or a failure result on error.
 */
export async function convert(
  id: string,
  targetType: "group" | "item",
): Promise<Result<AipReferenceItem>> {
  try {
    const [existing] = await db
      .select({ id: aipReferences.id, type: aipReferences.type, parentId: aipReferences.parentId })
      .from(aipReferences)
      .where(eq(aipReferences.id, id))
      .limit(1);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such AIP reference found.", { id });
    }

    if (existing.type === targetType) {
      const item = await _getAipReferenceById(id);
      if (!item) {
        return new Failure(ErrorCodes.Fatal, "Failed to retrieve AIP reference.", { id });
      }
      return new Success(item);
    }

    if (targetType === "item") {
      const [child] = await db
        .select({ id: aipReferences.id })
        .from(aipReferences)
        .where(eq(aipReferences.parentId, id))
        .limit(1);

      if (child) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          "Cannot convert a group with children into an item. Move or delete its children first.",
          { id },
        );
      }
    }

    await db
      .update(aipReferences)
      .set({ type: targetType })
      .where(eq(aipReferences.id, id));

    const item = await _getAipReferenceById(id);
    if (!item) {
      return new Failure(ErrorCodes.Fatal, "Failed to retrieve converted AIP reference.", { id });
    }

    return new Success(item);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to convert AIP reference.", { id, targetType }, e);
  }
}

/**
 * Moves multiple AIP references to a target parent.
 *
 * @description
 * Validates that all provided identifiers exist. When a `parentId` is supplied, validates that the
 * target parent exists and is a group. Passing `parentId: null` moves the selected references to the
 * root level. Group items cannot be moved under one of their own descendants; this is checked for
 * every selected group before the batch update is executed.
 *
 * On success, wraps `undefined` in a {@link Success}. On validation or not-found failure, returns an
 * appropriate {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function move
 * @param {string[]} ids - Identifiers of the references to move.
 * @param {string | null} parentId - Target parent identifier, or `null` to move them to root level.
 * @returns {Promise<Result<void>>} A result wrapper containing void on success, or a failure result on error.
 */
export async function move(ids: string[], parentId: string | null): Promise<Result<void>> {
  try {
    if (ids.length === 0) {
      return new Failure(ErrorCodes.ValidationFailure, "At least one item is required to move.", { ids, parentId });
    }

    const uniqueIds = [...new Set(ids)];
    const records = await db
      .select({ id: aipReferences.id, type: aipReferences.type })
      .from(aipReferences);

    const recordMap = new Map(records.map(record => [record.id, record]));
    for (const id of uniqueIds) {
      if (!recordMap.has(id)) {
        return new Failure(ErrorCodes.ResourceNotFound, "One or more AIP references do not exist.", { ids, parentId, missingId: id });
      }
    }

    if (parentId !== null) {
      if (!validatorUtilities.isUuid(parentId)) {
        return new Failure(ErrorCodes.ValidationFailure, "Invalid target parent ID.", { ids, parentId });
      }

      const parent = recordMap.get(parentId);
      if (!parent) {
        return new Failure(ErrorCodes.ValidationFailure, "Target parent group not found.", { ids, parentId });
      }
      if (parent.type !== "group") {
        return new Failure(ErrorCodes.ValidationFailure, "Target parent must be a group.", { ids, parentId });
      }
    }

    for (const id of uniqueIds) {
      if (id === parentId) {
        return new Failure(ErrorCodes.ValidationFailure, "A reference cannot be moved under itself.", { ids, parentId, id });
      }

      const record = recordMap.get(id)!;
      if (record.type === "group" && parentId !== null) {
        const isCircular = await _isDescendant(id, parentId);
        if (isCircular) {
          return new Failure(
            ErrorCodes.ValidationFailure,
            "Cannot move a group under one of its descendants.",
            { ids, parentId, id },
          );
        }
      }
    }

    for (const id of uniqueIds) {
      await db
        .update(aipReferences)
        .set({ parentId })
        .where(eq(aipReferences.id, id));
    }

    return new Success(undefined);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to move AIP references.", { ids, parentId }, e);
  }
}

/**
 * Checks whether `candidateAncestorId` is an ancestor-or-equal of `nodeId`.
 * Used to prevent circular references when re-parenting groups.
 */
async function _isDescendant(ancestorId: string, nodeId: string): Promise<boolean> {
  // Walk up from nodeId; if we reach ancestorId, it's circular.
  let currentId: string | null = nodeId;
  while (currentId !== null) {
    if (currentId === ancestorId) return true;
    const [row] = await db
      .select({ parentId: aipReferences.parentId })
      .from(aipReferences)
      .where(eq(aipReferences.id, currentId))
      .limit(1);
    currentId = row?.parentId ?? null;
  }
  return false;
}

async function _getAipReferenceById(id: string): Promise<AipReferenceItem | null> {
  const [row] = await db
    .select()
    .from(aipReferences)
    .where(eq(aipReferences.id, id))
    .limit(1);
  if (!row) return null;
  return _mapRow(row);
}

function _mapRow(row: typeof aipReferences.$inferSelect): AipReferenceItem {
  return {
    id: row.id,
    type: row.type,
    parentId: row.parentId,
    sector: row.sector,
    code: row.code,
    office: row.office,
    aipReferenceCode: row.aipReferenceCode,
    description: row.description,
    implementingOffice: row.implementingOffice,
    implementationStart: row.implementationStart,
    implementationCompletion: row.implementationCompletion,
    expectedOutputs: row.expectedOutputs,
    fundingSource: row.fundingSource,
    amountPS: row.amountPS,
    amountMOOE: row.amountMOOE,
    amountCO: row.amountCO,
    amountCCAdapt: row.amountCCAdapt,
    amountCCMitigate: row.amountCCMitigate,
    ccTopologyCode: row.ccTopologyCode,
    gadable: row.gadable,
    gadAmount: row.gadAmount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type AipReferenceItem = {
  id: string;
  type: "group" | "item";
  parentId: string | null;
  sector: string | null;
  code: string | null;
  office: string | null;
  aipReferenceCode: string;
  description: string;
  implementingOffice: string | null;
  implementationStart: number | null;
  implementationCompletion: number | null;
  expectedOutputs: string | null;
  fundingSource: string | null;
  amountPS: string | null;
  amountMOOE: string | null;
  amountCO: string | null;
  amountCCAdapt: string | null;
  amountCCMitigate: string | null;
  ccTopologyCode: string | null;
  gadable: boolean;
  gadAmount: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AipNode = AipReferenceItem & {
  children: AipNode[];
};

type SharedPayload = {
  sector?: string;
  code?: string;
  office?: string;
  aipReferenceCode: string;
  description: string;
  implementingOffice?: string;
  implementationStart?: number;
  implementationCompletion?: number;
  expectedOutputs?: string;
  fundingSource?: string;
  amountPS?: string;
  amountMOOE?: string;
  amountCO?: string;
  amountCCAdapt?: string;
  amountCCMitigate?: string;
  ccTopologyCode?: string;
  gadable?: boolean;
  gadAmount?: string;
};

export type CreateGroupPayload = SharedPayload & {
  parentId?: string;
};

export type AddItemPayload = Omit<SharedPayload, "implementationStart" | "implementationCompletion"> & {
  parentId?: string | null;
  implementationStart: number;
  implementationCompletion: number;
};

type SharedUpdatePayload = {
  sector?: string;
  code?: string;
  office?: string;
  aipReferenceCode?: string;
  description?: string;
  implementingOffice?: string;
  implementationStart?: number;
  implementationCompletion?: number;
  expectedOutputs?: string;
  fundingSource?: string;
  amountPS?: string;
  amountMOOE?: string;
  amountCO?: string;
  amountCCAdapt?: string;
  amountCCMitigate?: string;
  ccTopologyCode?: string;
  gadable?: boolean;
  gadAmount?: string;
};

export type UpdateGroupPayload = SharedUpdatePayload & {
  parentId?: string | null;
};

export type UpdateItemPayload = SharedUpdatePayload & {
  parentId?: string | null;
};

export type AipSearchResultItem = {
  id: string;
  aipReferenceCode: string;
  description: string;
};

/**
 * Searches AIP references by code or description.
 *
 * @description
 * Performs a case-insensitive partial match on `aipReferenceCode` and `description`. Returns up to
 * 20 results ordered by AIP reference code.
 *
 * On success, wraps the result list in a {@link Success}. On unexpected failure, wraps the error in
 * a fatal {@link Failure}.
 *
 * @async
 * @function searchAipCode
 * @param {string} query - The search term to match against code or description.
 * @returns {Promise<Result<AipSearchResultItem[]>>} A result wrapper containing matching AIP references
 *                                                   on success, or a failure result on error.
 */
export async function searchAipCode(query: string): Promise<Result<AipSearchResultItem[]>> {
  try {
    const term = `%${query}%`;
    const rows = await db
      .select({
        id: aipReferences.id,
        aipReferenceCode: aipReferences.aipReferenceCode,
        description: aipReferences.description,
      })
      .from(aipReferences)
      .where(or(ilike(aipReferences.aipReferenceCode, term), ilike(aipReferences.description, term)))
      .orderBy(aipReferences.aipReferenceCode)
      .limit(20);

    return new Success(rows.map(r => ({
      id: r.id,
      aipReferenceCode: r.aipReferenceCode,
      description: r.description,
    })));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to search AIP references.", { query }, e);
  }
}
