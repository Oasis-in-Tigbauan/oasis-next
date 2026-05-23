import type { NextRequest } from "next/server";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as lbac from "@/lib/lbac";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

type UpdateLbacQuarterlyBody = {
  priorYearAccomplishments?: string;
  physicalTargetQ1?: string;
  physicalTargetQ2?: string;
  physicalTargetQ3?: string;
  physicalTargetQ4?: string;
  physicalTargetTotal?: string;
  actualPhysicalPerformanceQ1?: string;
  actualPhysicalPerformanceQ2?: string;
  actualPhysicalPerformanceQ3?: string;
  actualPhysicalPerformanceQ4?: string;
  variance?: string;
  accomplishmentPercentage?: string;
  remarks?: string;
  targetForBudgetYear?: string;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.verify([
    permission.LBAC_QUARTERLY_READ,
    permission.LBAC_QUARTERLY_WRITE,
  ], "and");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "No such item found.").build();
  }

  const body = await tryParseJson<UpdateLbacQuarterlyBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  const validate = await validator.validate<UpdateLbacQuarterlyBody>(body, {
    properties: {
      priorYearAccomplishments: { type: "string", formatter: "non-empty-string" },
      physicalTargetQ1: { type: "string", formatter: "non-empty-string" },
      physicalTargetQ2: { type: "string", formatter: "non-empty-string" },
      physicalTargetQ3: { type: "string", formatter: "non-empty-string" },
      physicalTargetQ4: { type: "string", formatter: "non-empty-string" },
      physicalTargetTotal: { type: "string", formatter: "non-empty-string" },
      actualPhysicalPerformanceQ1: { type: "string", formatter: "non-empty-string" },
      actualPhysicalPerformanceQ2: { type: "string", formatter: "non-empty-string" },
      actualPhysicalPerformanceQ3: { type: "string", formatter: "non-empty-string" },
      actualPhysicalPerformanceQ4: { type: "string", formatter: "non-empty-string" },
      variance: { type: "string", formatter: "non-empty-string" },
      accomplishmentPercentage: { type: "string", formatter: "non-empty-string" },
      remarks: { type: "string", formatter: "non-empty-string" },
      targetForBudgetYear: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!).build();
  }

  const result = await lbac.updateLbacQuarterlyReport(id, body);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
