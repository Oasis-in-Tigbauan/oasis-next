import { DateTime } from "luxon";
import { NextResponse, type NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import {
  COMMUTATION_OPTIONS,
  LEAVE_TYPE_OPTIONS,
  OTHER_PURPOSE_OPTIONS,
  SICK_LOCATION_OPTIONS,
  STUDY_PURPOSE_OPTIONS,
  VACATION_LOCATION_OPTIONS,
  exportLeaveApplicationToPdfBuffer,
  type LeaveApplicationExportPayload,
} from "@/lib/forms/leave";
import { calculateInclusiveLeaveDates } from "@/lib/forms/leave-dates";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { Failure } from "@/lib/one-of";
import { validator } from "@/lib/validators";

export async function POST(req: NextRequest) {
  const session = await auth.verify();
  if (session.code !== SessionCode.Ok || !session.user) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<LeaveApplicationExportPayload>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  if (!Array.isArray(body.leaveTypes) || !Array.isArray(body.otherPurposes)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Leave selections must be arrays.")
      .build();
  }

  const validation = await validator.validate<LeaveApplicationExportPayload>(body, {
    properties: {
      lastName: { type: "string", formatter: "non-empty-string", max: 100 },
      firstName: { type: "string", formatter: "non-empty-string", max: 100 },
      middleName: { type: "string", max: 100 },
      dateOfFiling: { type: "string", formatter: "non-empty-string" },
      position: { type: "string", formatter: "non-empty-string", max: 150 },
      monthlySalary: { type: "string", formatter: "decimal", max: 30 },
      leaveTypes: { type: "object" },
      otherLeaveDescription: { type: "string", max: 150 },
      vacationLocation: { type: "string" },
      vacationLocationDetails: { type: "string", max: 150 },
      sickLocation: { type: "string" },
      illnessDetails: { type: "string", max: 150 },
      studyPurpose: { type: "string" },
      otherPurposes: { type: "object" },
      workingDays: { type: "string", formatter: "non-empty-string", max: 5 },
      leaveStartDate: { type: "string", formatter: "non-empty-string" },
      commutation: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: [
      "lastName",
      "firstName",
      "dateOfFiling",
      "position",
      "monthlySalary",
      "leaveTypes",
      "otherPurposes",
      "workingDays",
      "leaveStartDate",
      "commutation",
    ],
    allowUnvalidatedProperties: false,
  });

  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors)
      .build();
  }

  const issue = _validateFormRules(body);
  if (issue) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, issue)
      .build();
  }

  const result = await exportLeaveApplicationToPdfBuffer(body, session.user.office.name);
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const filenamePart = `${body.lastName}-${body.firstName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const filename = `leave-application-${filenamePart || "applicant"}.pdf`;

  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function _validateFormRules(body: LeaveApplicationExportPayload): string | null {
  if (body.leaveTypes.length !== 1 || body.leaveTypes.some(type => !LEAVE_TYPE_OPTIONS.includes(type))) {
    return "Choose exactly one valid type of leave.";
  }

  if (body.otherPurposes.some(purpose => !OTHER_PURPOSE_OPTIONS.includes(purpose))) {
    return "Invalid other purpose selection.";
  }

  if (body.leaveTypes.includes("other") && !body.otherLeaveDescription?.trim()) {
    return "Specify the other type of leave.";
  }

  if (body.vacationLocation && !VACATION_LOCATION_OPTIONS.includes(body.vacationLocation)) {
    return "Invalid vacation or special privilege leave location.";
  }

  if (body.sickLocation && !SICK_LOCATION_OPTIONS.includes(body.sickLocation)) {
    return "Invalid sick leave location.";
  }

  if (body.studyPurpose && !STUDY_PURPOSE_OPTIONS.includes(body.studyPurpose)) {
    return "Invalid study leave purpose.";
  }

  if (!COMMUTATION_OPTIONS.includes(body.commutation)) {
    return "Invalid commutation selection.";
  }

  if (!calculateInclusiveLeaveDates(body.leaveStartDate, body.workingDays)) {
    return "Choose a weekday start date and a whole number of working days greater than zero.";
  }

  if (!DateTime.fromISO(body.dateOfFiling).isValid) {
    return "Date of filing must be valid.";
  }

  return null;
}
