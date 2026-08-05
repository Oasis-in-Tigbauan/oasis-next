import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import * as ppmp from '@/lib/forms/ppmp';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

export async function PATCH(
  req: NextRequest,
  {params}: RouteContext<'/api/forms/ppmp/major-group/[id]'>,
) {
  const session = await auth.verify([permission.PPMP_READ, permission.PPMP_MANAGE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status404NotFound,
      'No such major group found.',
    ).build();
  }

  const body = await tryParseJson<{saaobId: string}>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validate = await validator.validate<{saaobId: string}>(body, {
    properties: {
      saaobId: {type: 'string', formatter: 'uuid'},
    },
    requiredProperties: ['saaobId'],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validate.errors!,
    ).build();
  }

  const result = await ppmp.updateMajorGroup(id, body.saaobId);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  _req: NextRequest,
  {params}: RouteContext<'/api/forms/ppmp/major-group/[id]'>,
) {
  const session = await auth.verify([permission.PPMP_READ, permission.PPMP_MANAGE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status404NotFound,
      'No such major group found.',
    ).build();
  }

  const result = await ppmp.deleteMajorGroup(id);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
