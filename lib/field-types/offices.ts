import {and, count, eq} from 'drizzle-orm';

import {db} from '@/lib/db';
import {office, officeCodes, user} from '@/lib/db/schema';
import {ErrorCodes, Failure, Result, Success} from '@/lib/one-of';
import {validatorUtilities} from '@/lib/validators';

/**
 * Creates a new office code record when no existing record shares the same `aa` value.
 *
 * The function first checks for uniqueness by `aa`. If a matching office code already exists,
 * it returns a validation failure. Otherwise, it inserts a new record using the provided payload,
 * including only optional fields that are not empty.
 *
 * On successful insertion, it returns the created office code data wrapped in a {@link Success}.
 * If the insert does not produce a record or an exception occurs, it returns a {@link Failure}.
 *
 * @param {CreateOfficeCodePayload} payload The input data used to create the office code.
 * @returns {Promise<Result<OfficeCode>>} A promise that resolves to:
 * - {@link Success} containing the created office code
 * - {@link Failure} when the office code already exists or creation fails
 *
 * @example
 * const result = await create({
 *   aa: "AA001",
 *   code: "OC-100",
 *   sector: "Operations",
 *   office: "Main Office",
 * });
 */
export async function create(payload: CreateOfficeCodePayload): Promise<Result<OfficeCode>> {
  try {
    const [result] = await db
      .select({
        any: count(officeCodes.id),
      })
      .from(officeCodes)
      .where(eq(officeCodes.aa, payload.aa));
    if (result?.any > 0) {
      return new Failure(ErrorCodes.ValidationFailure, 'Office code already exists.', payload);
    }

    // Check if the office exists
    const [officeToUse] = await db
      .select({id: office.id, name: office.name})
      .from(office)
      .where(eq(office.id, payload.officeId));
    if (!officeToUse) {
      return new Failure(ErrorCodes.ResourceNotFound, 'Office does not exist.', payload);
    }

    // Head user
    const [headUser] = await db
      .select({id: user.id, name: user.name})
      .from(user)
      .where(and(eq(user.id, payload.headUserId), eq(user.officeId, officeToUse.id)));
    if (!headUser) {
      return new Failure(ErrorCodes.ResourceNotFound, 'Head user does not exist.', payload);
    }

    // Create the office code.
    const [officeCode] = await db
      .insert(officeCodes)
      .values({
        aa: payload.aa,
        officeId: officeToUse.id,
        headUserId: headUser.id,
        ...(validatorUtilities.isNotEmpty(payload.code) ? {code: payload.code} : {}),
        ...(validatorUtilities.isNotEmpty(payload.sector) ? {sector: payload.sector} : {}),
        ...(validatorUtilities.isNotEmpty(payload.function) ? {sector: payload.function} : {}),
        ...(validatorUtilities.isNotEmpty(payload.liftOffice)
          ? {liftOffice: payload.liftOffice}
          : {}),
        ...(validatorUtilities.isNotEmpty(payload.subOffice) ? {subOffice: payload.subOffice} : {}),
      })
      .returning();
    if (!officeCode) {
      return new Failure(ErrorCodes.Fatal, 'Unable to create office code.');
    }

    return new Success({
      id: officeCode.id,
      aa: officeCode.aa,
      code: officeCode.code,
      sector: officeCode.sector,
      function: officeCode.function,
      liftOffice: officeCode.liftOffice,
      subOffice: officeCode.subOffice,
      office: {
        id: officeToUse.id,
        name: officeToUse.name,
      },
      headUser: {
        id: headUser.id,
        name: headUser.name,
      },
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to create office code.', payload, e);
  }
}

/**
 * Retrieves all office codes ordered by creation time.
 *
 * On success, returns the complete list of office codes wrapped in a {@link Success}.
 * If the query fails, returns a {@link Failure} with a fatal error.
 *
 * @returns {Promise<Result<Array<OfficeCode>>>} A promise that resolves to:
 * - {@link Success} containing all office codes
 * - {@link Failure} when the office codes cannot be fetched
 *
 * @example
 * const result = await all();
 */
export async function all(): Promise<Result<Array<OfficeCode>>> {
  try {
    const codes = await db
      .select({
        id: officeCodes.id,
        aa: officeCodes.aa,
        code: officeCodes.code,
        sector: officeCodes.sector,
        function: officeCodes.function,
        liftOffice: officeCodes.liftOffice,
        subOffice: officeCodes.subOffice,
        officeId: officeCodes.officeId,
        officeName: office.name,
        headUserId: officeCodes.headUserId,
        headUserName: user.name,
      })
      .from(officeCodes)
      .leftJoin(office, eq(officeCodes.officeId, office.id))
      .leftJoin(user, eq(officeCodes.headUserId, user.id))
      .orderBy(officeCodes.createdAt);

    const mapped: OfficeCode[] = codes.map((c) => ({
      id: c.id,
      aa: c.aa,
      code: c.code,
      sector: c.sector,
      function: c.function,
      liftOffice: c.liftOffice,
      subOffice: c.subOffice,
      office: {
        id: c.officeId,
        name: c.officeName!,
      },
      headUser: {
        id: c.headUserId,
        name: c.headUserName!,
      },
    }));

    return new Success(mapped);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to fetch office codes.', {}, e);
  }
}

/**
 * Updates an existing office code by its identifier.
 *
 * The function first looks up the target office code. If no matching record is found,
 * it returns a {@link Failure} with a resource-not-found error. Before applying updates,
 * it filters the provided payload to remove empty or unserializable values so that only
 * meaningful fields are considered for persistence.
 *
 * When the update succeeds, it returns the updated office code wrapped in a {@link Success}.
 * If any error occurs during lookup or update, it returns a {@link Failure} with a fatal error.
 *
 * @param {string} id The unique identifier of the office code to update.
 * @param {Partial<UpdateOfficeCodePayload>} payload The partial office code data to update.
 * @returns {Promise<Result<OfficeCode>>} A promise that resolves to:
 * - {@link Success} containing the updated office code
 * - {@link Failure} when the office code is not found or the update cannot be completed
 *
 * @example
 * const result = await update("office-code-id", {
 *   sector: "Operations",
 *   office: "Regional Office",
 * });
 */
export async function update(
  id: string,
  payload: Partial<UpdateOfficeCodePayload>,
): Promise<Result<OfficeCode>> {
  try {
    const [target] = await db
      .select({
        id: officeCodes.id,
        officeId: officeCodes.officeId,
        officeName: office.name,
        headUserId: officeCodes.headUserId,
        headUserName: user.name,
      })
      .from(officeCodes)
      .where(eq(officeCodes.id, id))
      .leftJoin(office, eq(officeCodes.officeId, office.id))
      .leftJoin(user, eq(officeCodes.headUserId, user.id))
      .limit(1);
    if (!target) {
      return new Failure(ErrorCodes.ResourceNotFound, 'Office code not found.', {id});
    }

    // Filter out unserializable content and empty values
    const values: Partial<CreateOfficeCodePayload> =
      validatorUtilities.filterUpdatedFields(payload);

    let officeUpdate: {id: string; name: string} | null = null;
    if (validatorUtilities.isExisty(values.officeId) && target.officeId !== values.officeId) {
      const [officeToUse] = await db
        .select({id: office.id, name: office.name})
        .from(office)
        .where(eq(office.id, values.officeId!));
      if (!officeToUse) {
        return new Failure(ErrorCodes.ResourceNotFound, 'Office does not exist.', {...payload, id});
      }

      officeUpdate = {id: officeToUse.id, name: officeToUse.name};
    }

    let headUser: {id: string; name: string} | null = null;
    if (validatorUtilities.isExisty(values.headUserId) && target.headUserId !== values.headUserId) {
      const [newHeadUser] = await db
        .select({id: user.id, name: user.name})
        .from(user)
        .where(
          and(
            eq(user.id, values.headUserId!),
            eq(user.officeId, officeUpdate?.id ?? target.officeId),
          ),
        );
      if (!newHeadUser) {
        return new Failure(ErrorCodes.ResourceNotFound, 'Office does not exist.', {...payload, id});
      }

      headUser = {id: newHeadUser.id, name: newHeadUser.name};
    }

    // Apply updates
    const [updated] = await db
      .update(officeCodes)
      .set({
        ...(validatorUtilities.isExisty(values.aa) ? {aa: values.aa} : {}),
        ...(validatorUtilities.isExisty(values.code) ? {code: values.code} : {}),
        ...(validatorUtilities.isExisty(values.sector) ? {sector: values.sector} : {}),
        ...(validatorUtilities.isExisty(values.function) ? {function: values.function} : {}),
        ...(validatorUtilities.isExisty(values.liftOffice) ? {liftOffice: values.liftOffice} : {}),
        ...(validatorUtilities.isExisty(values.subOffice) ? {subOffice: values.subOffice} : {}),
        ...(validatorUtilities.isExisty(officeUpdate) ? {officeId: officeUpdate!.id} : {}),
        ...(validatorUtilities.isExisty(headUser) ? {headUserId: headUser!.id} : {}),
      })
      .where(eq(officeCodes.id, target.id))
      .returning();

    return new Success({
      id: updated.id,
      aa: updated.aa,
      code: updated.code,
      sector: updated.sector,
      function: updated.function,
      liftOffice: updated.liftOffice,
      subOffice: updated.subOffice,
      office: officeUpdate ?? {id: target.officeId, name: target.officeName!},
      headUser: headUser ?? {id: target.headUserId, name: target.headUserName!},
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to update office code.', {...payload, id}, e);
  }
}

type CreateOfficeCodePayload = {
  aa: string;
  code: Optional<string>;
  sector: Optional<string>;
  function: Optional<string>;
  liftOffice: Optional<string>;
  subOffice: Optional<string>;
  officeId: string;
  headUserId: string;
};

type UpdateOfficeCodePayload = Omit<CreateOfficeCodePayload, 'officeId' | 'headUserId'> & {
  officeId: Optional<string>;
  headUserId: Optional<string>;
};

export type OfficeCode = {
  id: string;
  aa: string;
  code: Optional<string>;
  sector: Optional<string>;
  function: Optional<string>;
  liftOffice: Optional<string>;
  subOffice: Optional<string>;
  office: {
    id: string;
    name: string;
  };
  headUser: {
    id: string;
    name: string;
  };
};
