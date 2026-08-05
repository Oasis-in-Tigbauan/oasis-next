import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as payroll from '@/lib/forms/payroll';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

type PayrollRouteContext = {
  params: Promise<{id: string}>;
};

export async function PATCH(req: NextRequest, {params}: PayrollRouteContext) {
  const session = await auth.verify();
  if (session.code !== SessionCode.Ok || !session.user) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payroll ID.',
    ).build();
  }

  const body = await tryParseJson<payroll.PayrollPayload>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  if (!Array.isArray(body.entries)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Payroll entries must be an array.',
    ).build();
  }

  const validation = await _validatePayload(body);
  if (!validation.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validation.errors,
    ).build();
  }

  const result = await payroll.updatePayroll(id, body, session.user);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(_req: NextRequest, {params}: PayrollRouteContext) {
  const session = await auth.verify();
  if (session.code !== SessionCode.Ok || !session.user) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payroll ID.',
    ).build();
  }

  const result = await payroll.deletePayroll(id);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

function _validatePayload(body: payroll.PayrollPayload) {
  return validator.validate<payroll.PayrollPayload>(body, {
    properties: {
      payrollNo: {type: 'string', formatter: 'non-empty-string', max: 40},
      payrollMonth: {type: 'string', formatter: 'non-empty-string', max: 7},
      purpose: {type: 'string', max: 500},
      periodCovered: {type: 'string', max: 200},
      lgu: {type: 'string', formatter: 'non-empty-string', max: 150},
      fund: {type: 'string', formatter: 'non-empty-string', max: 80},
      sheetNumber: {type: 'string', formatter: 'non-empty-string', max: 5},
      totalSheets: {type: 'string', formatter: 'non-empty-string', max: 5},
      authorizedOfficial: {type: 'string', formatter: 'non-empty-string', max: 150},
      headOfAccounting: {type: 'string', formatter: 'non-empty-string', max: 150},
      headOfTreasury: {type: 'string', formatter: 'non-empty-string', max: 150},
      localChiefExecutive: {type: 'string', formatter: 'non-empty-string', max: 150},
      disbursingOfficer: {type: 'string', formatter: 'non-empty-string', max: 150},
      cafaoNo: {type: 'string', max: 80},
      cafaoDate: {type: 'string', max: 40},
      entries: {type: 'object'},
    },
    requiredProperties: [
      'payrollNo',
      'payrollMonth',
      'lgu',
      'fund',
      'sheetNumber',
      'totalSheets',
      'authorizedOfficial',
      'headOfAccounting',
      'headOfTreasury',
      'localChiefExecutive',
      'disbursingOfficer',
      'entries',
    ],
    allowUnvalidatedProperties: false,
  });
}
