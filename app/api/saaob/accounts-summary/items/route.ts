import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import * as saaob from '@/lib/saaob';
import {validator, validatorUtilities} from '@/lib/validators';

type CreateSummaryItemBody = {
  name: string;
  parentGroupId: string;
  linkedGroupIds: string[];
};

export async function POST(req: NextRequest) {
  const session = await auth.verify(
    [permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE],
    'and',
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateSummaryItemBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validate = await validator.validate<CreateSummaryItemBody>(body, {
    properties: {
      name: {type: 'string', formatter: 'non-empty-string'},
      parentGroupId: {type: 'string', formatter: 'uuid'},
      linkedGroupIds: {
        type: 'object',
        formatterFn: async (value) => {
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
    requiredProperties: ['name', 'parentGroupId', 'linkedGroupIds'],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validate.errors!,
    ).build();
  }

  const result = await saaob.createSummaryItem(body.name, body.parentGroupId, body.linkedGroupIds);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status201Created).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
