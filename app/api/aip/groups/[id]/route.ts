import type {NextRequest} from 'next/server';

import * as aipService from '@/lib/aip';
import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

export async function PATCH(req: NextRequest, {params}: RouteContext<'/api/aip/groups/[id]'>) {
  const session = await auth.verify([permission.AIP_READ, permission.AIP_WRITE]);
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

  const body = await tryParseJson<PatchGroupRequest>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validate = await validator.validate<PatchGroupRequest>(body, {
    properties: {
      parentId: {
        type: 'string',
        formatterFn: async (v) => {
          if (v === null) return {ok: true};
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
          if (v! < 1 || v! > 12) {
            return {ok: false, error: 'implementationStart must be a valid month (1-12).'};
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
          if (v! < 1 || v! > 12) {
            return {ok: false, error: 'implementationCompletion must be a valid month (1-12).'};
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
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validate.errors!,
    ).build();
  }

  const result = await aipService.updateGroup(id, body);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(_req: NextRequest, {params}: RouteContext<'/api/aip/groups/[id]'>) {
  const session = await auth.verify([permission.AIP_READ, permission.AIP_WRITE]);
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

  const result = await aipService.deleteGroup(id);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type PatchGroupRequest = {
  parentId?: string | null;
  aipReferenceCode?: string;
  description?: string;
  implementationStart?: number;
  implementationCompletion?: number;
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
