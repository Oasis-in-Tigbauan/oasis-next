import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permissions from '@/lib/db/permissions';
import * as fundTypes from '@/lib/field-types/fund-types';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

export async function PATCH(
  req: NextRequest,
  {params}: RouteContext<'/api/management/data/fund-types/[id]'>,
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
      description: {type: 'string', formatter: 'non-empty-string'},
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

  const data = await fundTypes.update(id, body);
  return oneOf(data).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type PatchPayload = Partial<{
  name: string;
  description: Optional<string>;
}>;
