import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import * as saaob from '@/lib/saaob';
import {validator, validatorUtilities} from '@/lib/validators';

type CreateStatisticBody = {
  name: string;
  isGroup: boolean;
  parentId?: string;
  selectedMainGroupIds?: string[];
  selectedSummaryItemIds?: string[];
};

async function validateUuidArray(value: unknown, label: string) {
  if (value === undefined) return {ok: true};
  if (!Array.isArray(value)) {
    return {ok: false, error: `${label} must be an array.`};
  }
  for (const item of value) {
    if (typeof item !== 'string' || !validatorUtilities.isUuid(item)) {
      return {ok: false, error: `All ${label} values must be valid UUIDs.`};
    }
  }
  return {ok: true};
}

function parseYearMonth(req: NextRequest): {
  year?: number;
  month?: number;
  error?: string;
} {
  const rawYear = req.nextUrl.searchParams.get('year');
  const rawMonth = req.nextUrl.searchParams.get('month');

  if ((rawYear === null) !== (rawMonth === null)) {
    return {error: "Both 'year' and 'month' must be provided together."};
  }

  if (rawYear === null || rawMonth === null) return {};

  const year = parseInt(rawYear, 10);
  const month = parseInt(rawMonth, 10);

  if (!Number.isFinite(year) || year < 2000) {
    return {error: "Invalid 'year': must be an integer of 2000 or later."};
  }

  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return {error: "Invalid 'month': must be an integer between 1 and 12."};
  }

  return {year, month};
}

export async function GET(req: NextRequest) {
  const session = await auth.verify([permission.SAAOB_DATA_READ], 'and');
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const parsed = parseYearMonth(req);
  if (parsed.error) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, parsed.error).build();
  }

  const result = await saaob.getAllStatisticEntries(parsed.year, parsed.month);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s.budget).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify(
    [permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE],
    'and',
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateStatisticBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validate = await validator.validate<CreateStatisticBody>(body, {
    properties: {
      name: {type: 'string', formatter: 'non-empty-string'},
      isGroup: {type: 'boolean'},
      parentId: {
        type: 'string',
        formatter: 'uuid',
      },
      selectedMainGroupIds: {
        type: 'object',
        formatterFn: async (value) => validateUuidArray(value, 'selectedMainGroupIds'),
      },
      selectedSummaryItemIds: {
        type: 'object',
        formatterFn: async (value) => validateUuidArray(value, 'selectedSummaryItemIds'),
      },
    },
    requiredProperties: ['name', 'isGroup'],
    allowUnvalidatedProperties: false,
  });

  if (!validate.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validate.errors!,
    ).build();
  }

  const result = await saaob.createStatisticEntry(
    {
      name: body.name,
      statisticType: 'budget',
      selectedMainGroupIds: body.selectedMainGroupIds,
      selectedSummaryItemIds: body.selectedSummaryItemIds,
    },
    body.isGroup ? 'group' : 'item',
    body.parentId,
  );

  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status201Created).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
