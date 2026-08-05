import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import * as lbac from '@/lib/lbac';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

type MoveLbacGroupBody = {
  targetGroupId: string | null;
};

export async function PATCH(
  req: NextRequest,
  {params}: RouteContext<'/api/lbac/groups/[id]/move'>,
) {
  const session = await auth.verify([permission.LBAC_DATA_READ, permission.LBAC_DATA_WRITE], 'and');
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status404NotFound,
      'No such group found.',
    ).build();
  }

  const body = await tryParseJson<MoveLbacGroupBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  // targetGroupId can be null (move to root) or a valid UUID
  if (body.targetGroupId !== null && body.targetGroupId !== undefined) {
    const validate = await validator.validate<Pick<MoveLbacGroupBody, 'targetGroupId'>>(body, {
      properties: {
        targetGroupId: {type: 'string', formatter: 'uuid'},
      },
      requiredProperties: ['targetGroupId'],
      allowUnvalidatedProperties: false,
    });
    if (!validate.ok) {
      return ApiResponseBuilder.createError(
        StatusCodes.Status400BadRequest,
        validate.errors!,
      ).build();
    }
  } else if (!('targetGroupId' in body)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'targetGroupId is required.',
    ).build();
  }

  const result = await lbac.moveLbacGroup(id, body.targetGroupId);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
