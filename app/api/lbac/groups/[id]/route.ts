import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import * as lbac from '@/lib/lbac';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

type UpdateLbacGroupBody = {
  name?: string;
  aipRefCode?: string | null;
  implementingUnitId?: string | null;
  officeId?: string | null;
};

export async function PATCH(req: NextRequest, {params}: RouteContext<'/api/lbac/groups/[id]'>) {
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

  const body = await tryParseJson<UpdateLbacGroupBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validate = await validator.validate<UpdateLbacGroupBody>(body, {
    properties: {
      name: {type: 'string', formatter: 'non-empty-string'},
      aipRefCode: {type: 'string', formatter: 'uuid'},
      implementingUnitId: {type: 'string', formatter: 'uuid'},
      officeId: {type: 'string', formatter: 'uuid'},
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

  const result = await lbac.updateLbacGroup(id, body);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(_req: NextRequest, {params}: RouteContext<'/api/lbac/groups/[id]'>) {
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

  const result = await lbac.deleteLbacGroup(id);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
