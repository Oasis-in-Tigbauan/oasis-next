import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import * as saaob from '@/lib/saaob';
import {validator, validatorUtilities} from '@/lib/validators';

type UpdateGroupBody = {
  name?: string;
  officeId?: string | null;
};

export async function PATCH(req: NextRequest, {params}: RouteContext<'/api/saaob/groups/[id]'>) {
  const session = await auth.verify(
    [permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE],
    'and',
  );
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

  const body = await tryParseJson<UpdateGroupBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validate = await validator.validate<UpdateGroupBody>(body, {
    properties: {
      name: {type: 'string', formatter: 'non-empty-string'},
      officeId: {
        type: 'string',
        formatter: 'uuid',
      },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validate.errors!,
    ).build();
  }

  const result = await saaob.updateGroup(
    id,
    body.name,
    Object.prototype.hasOwnProperty.call(body, 'officeId') ? (body.officeId ?? null) : undefined,
  );
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(_req: NextRequest, {params}: RouteContext<'/api/saaob/groups/[id]'>) {
  const session = await auth.verify(
    [permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE],
    'and',
  );
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

  const result = await saaob.deleteGroup(id);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
