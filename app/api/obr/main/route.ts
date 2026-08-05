import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import * as obr from '@/lib/obr';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

export async function GET() {
  const session = await auth.verify([permission.OBR_MANAGEMENT_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await obr.getAllObrMainData();
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.OBR_MANAGEMENT_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateObrMainDataBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validated = await validator.validate<CreateObrMainDataBody>(body, {
    properties: {
      obrNumber: {type: 'string', formatter: 'non-empty-string'},
      requestId: {type: 'string', formatter: 'uuid'},
      items: {
        type: 'object',
        formatterFn: async (v) => {
          if (!Array.isArray(v) || v.length === 0) {
            return {ok: false, error: 'items must be a non-empty array.'};
          }
          for (let i = 0; i < v.length; i++) {
            const item = v[i];
            if (typeof item !== 'object' || !validatorUtilities.isExisty(item)) {
              return {ok: false, error: `Invalid object at items[${i}].`};
            }
            if (!validatorUtilities.isNotEmpty(item.payee)) {
              return {ok: false, error: `Missing payee in items[${i}].`};
            }
            if (!validatorUtilities.isNotEmpty(item.address)) {
              return {ok: false, error: `Missing address in items[${i}].`};
            }
            if (!validatorUtilities.isUuid(item.responsibilityCenterId)) {
              return {ok: false, error: `Invalid responsibilityCenterId in items[${i}].`};
            }
            if (!validatorUtilities.isUuid(item.expenseCodeId)) {
              return {ok: false, error: `Invalid expenseCodeId in items[${i}].`};
            }
            if (!validatorUtilities.isNotEmpty(item.particulars)) {
              return {ok: false, error: `Missing particulars in items[${i}].`};
            }
            if (!validatorUtilities.isNumber(item.amount, false, false)) {
              return {ok: false, error: `Invalid amount in items[${i}].`};
            }
            if (
              item.prAmount !== undefined &&
              !validatorUtilities.isNumber(item.prAmount, false, false)
            ) {
              return {ok: false, error: `Invalid prAmount in items[${i}].`};
            }
            if (item.saaobId !== undefined && !validatorUtilities.isUuid(item.saaobId)) {
              return {ok: false, error: `Invalid saaobId in items[${i}].`};
            }
            if (item.aipReferences !== undefined) {
              if (!Array.isArray(item.aipReferences)) {
                return {ok: false, error: `Invalid aipReferences in items[${i}].`};
              }
              for (let j = 0; j < item.aipReferences.length; j++) {
                if (!validatorUtilities.isUuid(item.aipReferences[j]?.aipId)) {
                  return {ok: false, error: `Invalid aipId in items[${i}].aipReferences[${j}].`};
                }
                if (!validatorUtilities.isNumber(item.aipReferences[j]?.amount, false, false)) {
                  return {ok: false, error: `Invalid amount in items[${i}].aipReferences[${j}].`};
                }
              }
            }
          }
          return {ok: true};
        },
      },
    },
    requiredProperties: ['obrNumber', 'items'],
    allowUnvalidatedProperties: true,
  });
  if (!validated.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validated.errors!,
    ).build();
  }

  const result = await obr.createObrMainData(
    {
      obrNumber: body.obrNumber,
      requestId: body.requestId,
      items: body.items,
    },
    session.user!,
  );

  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type CreateObrMainDataItemBody = {
  payee: string;
  address: string;
  responsibilityCenterId: string;
  expenseCodeId: string;
  particulars: string;
  amount: string;
  prNumber?: string;
  prAmount?: string;
  saaobId?: string;
  aipReferences?: Array<{aipId: string; amount: string}>;
};

type CreateObrMainDataBody = {
  obrNumber: string;
  requestId?: string;
  items: Array<CreateObrMainDataItemBody>;
};
