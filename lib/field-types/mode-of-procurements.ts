import {desc, count, eq, isNull} from 'drizzle-orm';
import {DateTime} from 'luxon';

import {db} from '@/lib/db';
import {modeOfProcurements} from '@/lib/db/schema';
import {ErrorCodes, Failure, Result, Success} from '@/lib/one-of';
import {validatorUtilities} from '@/lib/validators';

export async function create(
  payload: ModeOfProcurementsPayload,
): Promise<Result<ModeOfProcurementsType>> {
  try {
    const [result] = await db
      .select({
        any: count(modeOfProcurements.id),
      })
      .from(modeOfProcurements)
      .where(eq(modeOfProcurements.name, payload.name));
    if (result?.any > 0) {
      return new Failure(ErrorCodes.ValidationFailure, 'Procurement type already exists.', payload);
    }

    const [procurementType] = await db
      .insert(modeOfProcurements)
      .values({
        name: payload.name,
        ...(validatorUtilities.isNotEmpty(payload.description)
          ? {description: payload.description}
          : {}),
      })
      .returning();
    if (!procurementType) {
      return new Failure(ErrorCodes.Fatal, 'Unable to create a procurement type.');
    }

    return new Success({
      id: procurementType.id,
      name: procurementType.name,
      description: procurementType.description,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to create procurement type.', payload, e);
  }
}

export async function all(): Promise<Result<Array<ModeOfProcurementsType>>> {
  try {
    const allProcurementTypes = await db
      .select({
        id: modeOfProcurements.id,
        name: modeOfProcurements.name,
        description: modeOfProcurements.description,
      })
      .from(modeOfProcurements)
      .where(isNull(modeOfProcurements.deletedAt))
      .orderBy(desc(modeOfProcurements.createdAt));

    return new Success(allProcurementTypes);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to fetch procurement types.', {}, e);
  }
}

export async function update(
  id: string,
  payload: Partial<UpdateModeOfProcurementsPayload>,
): Promise<Result<ModeOfProcurementsType>> {
  try {
    const [target] = await db
      .select({
        id: modeOfProcurements.id,
        name: modeOfProcurements.name,
        description: modeOfProcurements.description,
      })
      .from(modeOfProcurements)
      .where(eq(modeOfProcurements.id, id))
      .limit(1);
    if (!target) {
      return new Failure(ErrorCodes.ResourceNotFound, 'No such procurement type found.', {id});
    }

    // Filter out unserializable content and empty values
    const values: Partial<ModeOfProcurementsPayload> =
      validatorUtilities.filterUpdatedFields(payload);

    // Apply updates
    const [updated] = await db
      .update(modeOfProcurements)
      .set({
        ...(validatorUtilities.isExisty(values.name) ? {name: values.name} : {}),
        ...(validatorUtilities.isExisty(values.description)
          ? {description: values.description}
          : {}),
      })
      .where(eq(modeOfProcurements.id, target.id))
      .returning();

    return new Success({
      id: updated.id,
      name: updated.name,
      description: updated.description,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to update procurement type.', {...payload, id}, e);
  }
}

export async function removeSoftly(id: string): Promise<Result<null>> {
  try {
    const [targetProcurementType] = await db
      .select({id: modeOfProcurements.id, deletedAt: modeOfProcurements.deletedAt})
      .from(modeOfProcurements)
      .where(eq(modeOfProcurements.id, id))
      .limit(1);
    if (!targetProcurementType || targetProcurementType.deletedAt) {
      return new Failure(ErrorCodes.ResourceNotFound, 'Procurement type not found.');
    }

    await db
      .update(modeOfProcurements)
      .set({deletedAt: DateTime.utc().toJSDate()})
      .where(eq(modeOfProcurements.id, targetProcurementType.id));

    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to remove the procurement type.', {id}, e);
  }
}

type ModeOfProcurementsPayload = {
  name: string;
  description: Optional<string>;
};

type UpdateModeOfProcurementsPayload = Partial<ModeOfProcurementsPayload>;

export type ModeOfProcurementsType = {
  id: string;
  name: string;
  description: Optional<string>;
};
