import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as leave from '@/lib/forms/leave';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import {validator} from '@/lib/validators';

export async function GET() {
  const session = await auth.verify();
  if (session.code !== SessionCode.Ok || !session.user) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await leave.getAllLeaveApplications();
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify();
  if (session.code !== SessionCode.Ok || !session.user) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<leave.LeaveApplicationExportPayload>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  if (!Array.isArray(body.leaveTypes) || !Array.isArray(body.otherPurposes)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Leave selections must be arrays.',
    ).build();
  }

  const validation = await _validatePayload(body);
  if (!validation.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validation.errors,
    ).build();
  }

  const result = await leave.createLeaveApplication(body, session.user);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

function _validatePayload(body: Partial<leave.LeaveApplicationExportPayload>) {
  return validator.validate<Partial<leave.LeaveApplicationExportPayload>>(body, {
    properties: {
      lastName: {type: 'string', formatter: 'non-empty-string', max: 100},
      firstName: {type: 'string', formatter: 'non-empty-string', max: 100},
      middleName: {type: 'string', max: 100},
      dateOfFiling: {type: 'string', formatter: 'non-empty-string'},
      position: {type: 'string', formatter: 'non-empty-string', max: 150},
      monthlySalary: {type: 'string', formatter: 'decimal', max: 30},
      leaveTypes: {type: 'object'},
      otherLeaveDescription: {type: 'string', max: 150},
      vacationLocation: {type: 'string'},
      vacationLocationDetails: {type: 'string', max: 150},
      sickLocation: {type: 'string'},
      illnessDetails: {type: 'string', max: 150},
      studyPurpose: {type: 'string'},
      otherPurposes: {type: 'object'},
      workingDays: {type: 'string', formatter: 'non-empty-string', max: 5},
      leaveStartDate: {type: 'string', formatter: 'non-empty-string'},
      commutation: {type: 'string', formatter: 'non-empty-string'},
      approvedBy: {type: 'string', max: 150},
      approvedByPosition: {type: 'string', max: 150},
    },
    requiredProperties: [
      'lastName',
      'firstName',
      'dateOfFiling',
      'position',
      'monthlySalary',
      'leaveTypes',
      'otherPurposes',
      'workingDays',
      'leaveStartDate',
      'commutation',
    ],
    allowUnvalidatedProperties: false,
  });
}
