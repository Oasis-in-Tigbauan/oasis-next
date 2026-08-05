import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import * as travelOrder from '@/lib/forms/travel-order';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

export async function PATCH(
  req: NextRequest,
  {params}: RouteContext<'/api/forms/travel-order/[id]'>,
) {
  const session = await auth.verify([permission.TRAVEL_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid travel order ID.',
    ).build();
  }

  const body = await tryParseJson<Partial<UpdateTravelOrderBody>>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validate = await validator.validate<Partial<UpdateTravelOrderBody>>(body, {
    properties: {
      status: {type: 'string', formatter: 'non-empty-string'},
      category: {type: 'string', formatter: 'non-empty-string'},
      startDate: {type: 'string', formatter: 'non-empty-string'},
      endDate: {type: 'string'},
      location: {type: 'string', formatter: 'non-empty-string'},
      purpose: {type: 'string', formatter: 'non-empty-string'},
      subjectToClaims: {type: 'boolean'},
      notes: {type: 'string'},
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

  const result = await travelOrder.updateTravelOrder(id, body, session.user!);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  _req: NextRequest,
  {params}: RouteContext<'/api/forms/travel-order/[id]'>,
) {
  const session = await auth.verify([permission.TRAVEL_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid travel order ID.',
    ).build();
  }

  const result = await travelOrder.deleteTravelOrder(id);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type UpdateTravelOrderBody = {
  status: string;
  category: string;
  startDate: string;
  endDate?: string;
  location: string;
  purpose: string;
  subjectToClaims: boolean;
  notes?: string;
};
