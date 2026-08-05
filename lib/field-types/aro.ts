import {and, count, desc, eq, ilike, or} from 'drizzle-orm';

import {db} from '@/lib/db';
import {aroOfficeDefinitions, officePosition, user} from '@/lib/db/schema';
import {ErrorCodes, Failure, Result, Success} from '@/lib/one-of';
import {validatorUtilities} from '@/lib/validators';

export async function create(payload: AROPayload): Promise<Result<ARO>> {
  try {
    const [result] = await db
      .select({
        any: count(aroOfficeDefinitions.id),
      })
      .from(aroOfficeDefinitions)
      .where(eq(aroOfficeDefinitions.name, payload.name));
    if (result?.any > 0) {
      return new Failure(ErrorCodes.ValidationFailure, 'ARO Definition already exists.', payload);
    }

    // Validate the user
    const [aroLeadUser] = await db
      .select({
        id: user.id,
        name: user.name,
        positionId: officePosition.id,
        positionName: officePosition.name,
      })
      .from(user)
      .where(
        and(
          eq(user.id, payload.leadUserId),
          eq(user.banned, false),
          eq(user.shadowBanned, false),
          eq(user.emailVerified, true),
        ),
      )
      .leftJoin(officePosition, eq(officePosition.id, user.officePositionId))
      .limit(1);
    if (!aroLeadUser) {
      return new Failure(ErrorCodes.ValidationFailure, 'Invalid ARO Lead User', payload);
    }

    // Create the office code.
    const [aroDescription] = await db
      .insert(aroOfficeDefinitions)
      .values({
        name: payload.name,
        code: payload.code,
        description: payload.description,
        leadUserId: aroLeadUser.id,
      })
      .returning();
    if (!aroDescription) {
      return new Failure(ErrorCodes.Fatal, 'Unable to create a ARO definition.');
    }

    return new Success({
      id: aroDescription.id,
      name: aroDescription.name,
      code: aroDescription.code,
      description: aroDescription.description,
      leadUser: {
        id: aroLeadUser.id,
        name: aroLeadUser.name,
        position: {
          id: aroLeadUser.positionId!,
          name: aroLeadUser.positionName!,
        },
      },
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to create ARO definition.', payload, e);
  }
}

export async function all(): Promise<Result<Array<ARO>>> {
  try {
    const rows = await db
      .select({
        id: aroOfficeDefinitions.id,
        name: aroOfficeDefinitions.name,
        code: aroOfficeDefinitions.code,
        description: aroOfficeDefinitions.description,
        leadUserId: user.id,
        leadUserName: user.name,
        positionId: officePosition.id,
        positionName: officePosition.name,
      })
      .from(aroOfficeDefinitions)
      .leftJoin(user, eq(user.id, aroOfficeDefinitions.leadUserId))
      .leftJoin(officePosition, eq(officePosition.id, user.officePositionId))
      .orderBy(desc(aroOfficeDefinitions.createdAt));

    return new Success(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        description: r.description,
        leadUser: {
          id: r.leadUserId!,
          name: r.leadUserName!,
          position: {
            id: r.positionId!,
            name: r.positionName!,
          },
        },
      })),
    );
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to fetch all ARO definitions.', {}, e);
  }
}

export async function update(id: string, payload: Partial<UpdateAROPayload>): Promise<Result<ARO>> {
  try {
    const [target] = await db
      .select({
        id: aroOfficeDefinitions.id,
        name: aroOfficeDefinitions.name,
        code: aroOfficeDefinitions.code,
        description: aroOfficeDefinitions.description,
        leadUserId: user.id,
        leadUserName: user.name,
        positionId: officePosition.id,
        positionName: officePosition.name,
      })
      .from(aroOfficeDefinitions)
      .where(eq(aroOfficeDefinitions.id, id))
      .leftJoin(user, eq(user.id, aroOfficeDefinitions.leadUserId))
      .leftJoin(officePosition, eq(officePosition.id, user.officePositionId))
      .limit(1);
    if (!target) {
      return new Failure(ErrorCodes.ResourceNotFound, 'ARO definition not found.', {id});
    }

    const values: Partial<AROPayload> = validatorUtilities.filterUpdatedFields(payload);

    let leadUser = {
      id: target.leadUserId!,
      name: target.leadUserName!,
      position: {
        id: target.positionId!,
        name: target.positionName!,
      },
    };

    if (validatorUtilities.isExisty(values.leadUserId) && target.leadUserId !== values.leadUserId) {
      const [newLeadUser] = await db
        .select({
          id: user.id,
          name: user.name,
          positionId: officePosition.id,
          positionName: officePosition.name,
        })
        .from(user)
        .where(
          and(
            eq(user.id, values.leadUserId!),
            eq(user.banned, false),
            eq(user.shadowBanned, false),
            eq(user.emailVerified, true),
          ),
        )
        .leftJoin(officePosition, eq(officePosition.id, user.officePositionId))
        .limit(1);
      if (!newLeadUser) {
        return new Failure(ErrorCodes.ValidationFailure, 'Invalid ARO Lead User.', {
          ...payload,
          id,
        });
      }

      leadUser = {
        id: newLeadUser.id,
        name: newLeadUser.name,
        position: {
          id: newLeadUser.positionId!,
          name: newLeadUser.positionName!,
        },
      };
    }

    const [updated] = await db
      .update(aroOfficeDefinitions)
      .set({
        ...(validatorUtilities.isExisty(values.name) ? {name: values.name} : {}),
        ...(validatorUtilities.isExisty(values.code) ? {code: values.code} : {}),
        ...(validatorUtilities.isExisty(values.description)
          ? {description: values.description}
          : {}),
        ...(validatorUtilities.isExisty(values.leadUserId) ? {leadUserId: leadUser.id} : {}),
      })
      .where(eq(aroOfficeDefinitions.id, id))
      .returning();
    if (!updated) {
      return new Failure(ErrorCodes.Fatal, 'Unable to update ARO definition.', {...payload, id});
    }

    return new Success({
      id: updated.id,
      name: updated.name,
      code: updated.code,
      description: updated.description,
      leadUser,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to update ARO definition.', {...payload, id}, e);
  }
}

export async function searchForValidAROUser(query: string): Promise<Result<Array<AROUser>>> {
  try {
    const trimmed = query.trim();
    if (!trimmed) return new Success([]);

    const wildcard = `%${trimmed}%`;

    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        positionId: officePosition.id,
        positionName: officePosition.name,
      })
      .from(user)
      .where(
        and(
          eq(user.emailVerified, true),
          eq(user.banned, false),
          eq(user.shadowBanned, false),
          or(ilike(user.name, wildcard), ilike(user.email, wildcard)),
        ),
      )
      .leftJoin(officePosition, eq(officePosition.id, user.officePositionId))
      .limit(20);

    return new Success(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        position: {
          id: r.positionId!,
          name: r.positionName!,
        },
      })),
    );
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to search for valid ARO users.', {query}, e);
  }
}

type AROPayload = {
  name: string;
  description: string;
  code: string;
  leadUserId: string;
};

type UpdateAROPayload = Partial<AROPayload>;

export type AROUser = {
  id: string;
  name: string;
  position: {
    id: string;
    name: string;
  };
};

export type ARO = {
  id: string;
  name: string;
  description: Optional<string>;
  code: string;
  leadUser: AROUser;
};
