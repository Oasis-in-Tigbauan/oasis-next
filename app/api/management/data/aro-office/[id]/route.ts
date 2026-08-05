import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permissions from '@/lib/db/permissions';
import * as aro from '@/lib/field-types/aro';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

export async function PATCH(
  req: NextRequest,
  {params}: RouteContext<'/api/management/data/aro-office/[id]'>,
) {
  const session = await auth.verify([
    permissions.DATA_TYPES_MANAGE_READ,
    permissions.DATA_TYPES_MANAGE_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;
  if (!validatorUtilities.isNotEmpty(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, 'Not found.').build();
  }

  const body = await tryParseJson<PatchPayload>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validation = await validator.validate<PatchPayload>(body, {
    properties: {
      name: {type: 'string', formatter: 'non-empty-string'},
      code: {type: 'string', formatter: 'non-empty-string'},
      description: {type: 'string', formatter: 'non-empty-string'},
      leadUserId: {type: 'string', formatter: 'non-empty-string'},
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validation.errors!,
    ).build();
  }

  const data = await aro.update(id, {
    name: body.name ?? undefined,
    code: body.code ?? undefined,
    description: body.description ?? undefined,
    leadUserId: body.leadUserId ?? undefined,
  });
  return oneOf(data).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type PatchPayload = Partial<{
  name: Optional<string>;
  code: Optional<string>;
  description: Optional<string>;
  leadUserId: Optional<string>;
}>;
