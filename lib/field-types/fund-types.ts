import {desc, count, eq} from 'drizzle-orm';

import {db} from '@/lib/db';
import {fundTypes} from '@/lib/db/schema';
import {ErrorCodes, Failure, Result, Success} from '@/lib/one-of';
import {validatorUtilities} from '@/lib/validators';

export async function create(payload: CreateFundTypePayload): Promise<Result<FundType>> {
  try {
    const [result] = await db
      .select({
        any: count(fundTypes.id),
      })
      .from(fundTypes)
      .where(eq(fundTypes.name, payload.name));
    if (result?.any > 0) {
      return new Failure(ErrorCodes.ValidationFailure, 'Fund type already exists.', payload);
    }

    // Create the office code.
    const [fundType] = await db
      .insert(fundTypes)
      .values({
        name: payload.name,
        ...(validatorUtilities.isNotEmpty(payload.description)
          ? {description: payload.description}
          : {}),
      })
      .returning();
    if (!fundType) {
      return new Failure(ErrorCodes.Fatal, 'Unable to create a fund type.');
    }

    return new Success({
      id: fundType.id,
      name: fundType.name,
      description: fundType.description,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to create fund type.', payload, e);
  }
}

export async function all(): Promise<Result<Array<FundType>>> {
  try {
    const allFundTypes = await db
      .select({
        id: fundTypes.id,
        name: fundTypes.name,
        description: fundTypes.description,
      })
      .from(fundTypes)
      .orderBy(desc(fundTypes.createdAt));

    return new Success(allFundTypes);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to fetch fund type.', {}, e);
  }
}

export async function update(
  id: string,
  payload: Partial<UpdateFundTypePayload>,
): Promise<Result<FundType>> {
  try {
    const [target] = await db
      .select({
        id: fundTypes.id,
        name: fundTypes.name,
        description: fundTypes.description,
      })
      .from(fundTypes)
      .where(eq(fundTypes.id, id))
      .limit(1);
    if (!target) {
      return new Failure(ErrorCodes.ResourceNotFound, 'No such fund type found.', {id});
    }

    // Filter out unserializable content and empty values
    const values: Partial<CreateFundTypePayload> = validatorUtilities.filterUpdatedFields(payload);

    // Apply updates
    const [updated] = await db
      .update(fundTypes)
      .set({
        ...(validatorUtilities.isExisty(values.name) ? {name: values.name} : {}),
        ...(validatorUtilities.isExisty(values.description)
          ? {description: values.description}
          : {}),
      })
      .where(eq(fundTypes.id, target.id))
      .returning();

    return new Success({
      id: updated.id,
      name: updated.name,
      description: updated.description,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to update fund type.', {...payload, id}, e);
  }
}

type CreateFundTypePayload = {
  name: string;
  description: Optional<string>;
};

type UpdateFundTypePayload = Partial<CreateFundTypePayload>;

export type FundType = {
  id: string;
  name: string;
  description: Optional<string>;
};
