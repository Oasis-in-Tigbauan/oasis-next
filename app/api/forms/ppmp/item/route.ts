import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import * as ppmp from '@/lib/forms/ppmp';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

type CreateItemBody = {
  parentId: string;
  parentType: number;
  payload: {
    generalDescription?: string;
    typeOfProject: string;
    quantityOrSize: string;
    recommendedModeOfProcurement?: string;
    eligibleForPreProcurementConference?: boolean;
    startOfProcurementActivity: string;
    endOfProcurementActivity: string;
    expectedDeliveryPeriod: string;
    saaobId?: string;
    estimatedBudget: string;
    attachedSupportingDocuments?: string;
    remarks?: string;
  };
};

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.PPMP_READ, permission.PPMP_MANAGE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateItemBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  // Validate outer fields (parentId via built-in formatter; parentType via formatterFn last)
  const validateOuter = await validator.validate<Pick<CreateItemBody, 'parentId' | 'parentType'>>(
    body,
    {
      properties: {
        parentId: {type: 'string', formatter: 'uuid'},
        parentType: {
          type: 'number',
          formatterFn: async (v) => {
            if (v !== ppmp.ParentType.Minor && v !== ppmp.ParentType.Project) {
              return {
                ok: false,
                error: `parentType must be ${ppmp.ParentType.Minor} (minor group) or ${ppmp.ParentType.Project} (project group).`,
              };
            }
            return {ok: true};
          },
        },
      },
      requiredProperties: ['parentId', 'parentType'],
      allowUnvalidatedProperties: true,
    },
  );
  if (!validateOuter.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validateOuter.errors!,
    ).build();
  }

  // Validate payload fields manually
  const p = body.payload;
  if (!p || typeof p !== 'object') {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'payload is required and must be an object.',
    ).build();
  }
  const validTypes = ['goods', 'infra', 'cons-serv'];
  if (!validatorUtilities.isNotEmpty(p.typeOfProject) || !validTypes.includes(p.typeOfProject)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      `payload.typeOfProject must be one of: ${validTypes.join(', ')}.`,
    ).build();
  }
  if (!validatorUtilities.isNotEmpty(p.quantityOrSize)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'payload.quantityOrSize is required.',
    ).build();
  }
  if (!validatorUtilities.isNotEmpty(p.startOfProcurementActivity)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'payload.startOfProcurementActivity is required.',
    ).build();
  }
  if (!validatorUtilities.isNotEmpty(p.endOfProcurementActivity)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'payload.endOfProcurementActivity is required.',
    ).build();
  }
  if (!validatorUtilities.isNotEmpty(p.expectedDeliveryPeriod)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'payload.expectedDeliveryPeriod is required.',
    ).build();
  }
  if (!validatorUtilities.isNumber(p.estimatedBudget, false, false)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'payload.estimatedBudget must be a valid decimal.',
    ).build();
  }
  if (p.saaobId !== undefined && !validatorUtilities.isUuid(p.saaobId)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'payload.saaobId must be a valid UUID.',
    ).build();
  }

  const result = await ppmp.createItem(
    body.parentId,
    body.parentType as ppmp.ParentType,
    body.payload,
  );
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
