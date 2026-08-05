import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import * as ppmp from '@/lib/forms/ppmp';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

type MoveItemBody = {
  parentType: number;
  targetId: string;
};

export async function PATCH(
  req: NextRequest,
  {params}: RouteContext<'/api/forms/ppmp/item/[id]/move'>,
) {
  const session = await auth.verify([permission.PPMP_READ, permission.PPMP_MANAGE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status404NotFound,
      'No such plan item found.',
    ).build();
  }

  const body = await tryParseJson<MoveItemBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validate = await validator.validate<MoveItemBody>(body, {
    properties: {
      parentType: {
        type: 'number',
        formatterFn: async (v) => {
          if (v !== ppmp.ParentType.Minor && v !== ppmp.ParentType.Project) {
            return {
              ok: false,
              error: `parentType must be ${ppmp.ParentType.Minor} (minor group) or ${ppmp.ParentType.Project} (project group).`,
            };
          }
          return {ok: true};
        },
      },
      targetId: {type: 'string', formatter: 'uuid'},
    },
    requiredProperties: ['parentType', 'targetId'],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validate.errors!,
    ).build();
  }

  const result = await ppmp.moveItem(id, body.parentType as ppmp.ParentType, body.targetId);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
