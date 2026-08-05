import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import * as saaob from '@/lib/saaob';
import {validator, validatorUtilities} from '@/lib/validators';

type UpdateStatisticBody = {
  name?: string;
  selectedMainGroupIds?: string[];
  selectedSummaryItemIds?: string[];
};

async function validateUuidArray(value: unknown, label: string) {
  if (value === undefined) return {ok: true};
  if (!Array.isArray(value)) return {ok: false, error: `${label} must be an array.`};
  for (const item of value) {
    if (typeof item !== 'string' || !validatorUtilities.isUuid(item)) {
      return {ok: false, error: `All ${label} values must be valid UUIDs.`};
    }
  }
  return {ok: true};
}

export async function PATCH(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const session = await auth.verify(
    [permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE],
    'and',
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;

  const body = await tryParseJson<UpdateStatisticBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validate = await validator.validate<UpdateStatisticBody>(body, {
    properties: {
      name: {type: 'string', formatter: 'non-empty-string'},
      selectedMainGroupIds: {
        type: 'object',
        formatterFn: async (value) => validateUuidArray(value, 'selectedMainGroupIds'),
      },
      selectedSummaryItemIds: {
        type: 'object',
        formatterFn: async (value) => validateUuidArray(value, 'selectedSummaryItemIds'),
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

  if (
    body.name === undefined &&
    body.selectedMainGroupIds === undefined &&
    body.selectedSummaryItemIds === undefined
  ) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'At least one field must be provided for update.',
    ).build();
  }

  const result = await saaob.updateStatisticEntry(id, {
    name: body.name,
    selectedMainGroupIds: Object.prototype.hasOwnProperty.call(body, 'selectedMainGroupIds')
      ? body.selectedMainGroupIds
      : undefined,
    selectedSummaryItemIds: Object.prototype.hasOwnProperty.call(body, 'selectedSummaryItemIds')
      ? body.selectedSummaryItemIds
      : undefined,
  });

  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const session = await auth.verify(
    [permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE],
    'and',
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;

  const result = await saaob.deleteStatisticEntry(id);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status200Ok).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
