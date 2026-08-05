import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import * as saaob from '@/lib/saaob';
import {validator, validatorUtilities} from '@/lib/validators';

type UpdateSummaryItemBody = {
  name?: string;
  linkedGroupIds?: string[];
};

export async function PATCH(
  req: NextRequest,
  {params}: RouteContext<'/api/saaob/accounts-summary/items/[id]'>,
) {
  const session = await auth.verify(
    [permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE],
    'and',
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;

  const body = await tryParseJson<UpdateSummaryItemBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validate = await validator.validate<UpdateSummaryItemBody>(body, {
    properties: {
      name: {type: 'string', formatter: 'non-empty-string'},
      linkedGroupIds: {
        type: 'object',
        formatterFn: async (value) => {
          if (value === undefined) return {ok: true};
          if (!Array.isArray(value)) return {ok: false, error: 'linkedGroupIds must be an array.'};
          for (const item of value) {
            if (typeof item !== 'string' || !validatorUtilities.isUuid(item)) {
              return {ok: false, error: 'All linkedGroupIds must be valid UUIDs.'};
            }
          }
          return {ok: true};
        },
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

  const linkedGroupIds = Object.prototype.hasOwnProperty.call(body, 'linkedGroupIds')
    ? (body.linkedGroupIds as string[])
    : undefined;

  const result = await saaob.updateSummaryItem(id, body.name, linkedGroupIds);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  _req: NextRequest,
  {params}: RouteContext<'/api/saaob/accounts-summary/items/[id]'>,
) {
  const session = await auth.verify(
    [permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE],
    'and',
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;

  const result = await saaob.deleteSummaryItem(id);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status200Ok).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
