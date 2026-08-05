import type {NextRequest} from 'next/server';

import * as aipService from '@/lib/aip';
import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.AIP_READ, permission.AIP_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateItemRequest>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validate = await validator.validate<CreateItemRequest>(body, {
    properties: {
      parentId: {
        type: 'string',
        formatterFn: async (v) => {
          if (v === undefined || v === null) return {ok: true};
          if (!validatorUtilities.isUuid(v)) {
            return {ok: false, error: 'Invalid parent group ID.'};
          }
          return {ok: true};
        },
      },
      aipReferenceCode: {type: 'string', formatter: 'non-empty-string'},
      description: {type: 'string', formatter: 'non-empty-string'},
      implementationStart: {
        type: 'number',
        formatterFn: async (v) => {
          if (!validatorUtilities.isNumber(v, false, true)) {
            return {ok: false, error: 'implementationStart must be a valid integer.'};
          }
          if (v < 1 || v > 12) {
            return {ok: false, error: 'implementationStart must be a valid month (1–12).'};
          }
          return {ok: true};
        },
      },
      implementationCompletion: {
        type: 'number',
        formatterFn: async (v) => {
          if (!validatorUtilities.isNumber(v, false, true)) {
            return {ok: false, error: 'implementationCompletion must be a valid integer.'};
          }
          if (v < 1 || v > 12) {
            return {ok: false, error: 'implementationCompletion must be a valid month (1–12).'};
          }
          return {ok: true};
        },
      },
      sector: {type: 'string', formatter: 'non-empty-string'},
      code: {type: 'string', formatter: 'non-empty-string'},
      office: {type: 'string', formatter: 'non-empty-string'},
      implementingOffice: {type: 'string', formatter: 'non-empty-string'},
      expectedOutputs: {type: 'string', formatter: 'non-empty-string'},
      fundingSource: {type: 'string', formatter: 'non-empty-string'},
      amountPS: {type: 'string', formatter: 'decimal'},
      amountMOOE: {type: 'string', formatter: 'decimal'},
      amountCO: {type: 'string', formatter: 'decimal'},
      amountCCAdapt: {type: 'string', formatter: 'decimal'},
      amountCCMitigate: {type: 'string', formatter: 'decimal'},
      ccTopologyCode: {type: 'string', formatter: 'non-empty-string'},
      gadable: {type: 'boolean'},
      gadAmount: {type: 'string', formatter: 'decimal'},
    },
    requiredProperties: [
      'aipReferenceCode',
      'description',
      'implementationStart',
      'implementationCompletion',
    ],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validate.errors!,
    ).build();
  }

  const result = await aipService.addItem(body);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type CreateItemRequest = {
  parentId?: string | null;
  aipReferenceCode: string;
  description: string;
  implementationStart: number;
  implementationCompletion: number;
  sector?: string;
  code?: string;
  office?: string;
  implementingOffice?: string;
  expectedOutputs?: string;
  fundingSource?: string;
  amountPS?: string;
  amountMOOE?: string;
  amountCO?: string;
  amountCCAdapt?: string;
  amountCCMitigate?: string;
  ccTopologyCode?: string;
  gadable?: boolean;
  gadAmount?: string;
};
