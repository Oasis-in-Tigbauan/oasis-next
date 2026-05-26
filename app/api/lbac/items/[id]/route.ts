import type { NextRequest } from "next/server";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as lbac from "@/lib/lbac";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

type UpdateLbacItemBody = {
  aipRefCode?: string | null;
  mfoPpa?: string;
  majorFinalOutput?: string | null;
  performanceOutputIndicator?: string | null;
  targetForBudgetYear?: string | null;
  proposedBudgetPS?: string;
  proposedBudgetMOOE?: string;
  proposedBudgetFE?: string;
  proposedBudgetCO?: string;
  remarks?: string | null;
  remarksForAllocation?: string | null;
  gadable?: boolean;
  tagging?: string | null;
  amountAttributed?: string | null;
  physicalTargets?: string | null;
  priorYearAccomplishments?: string | null;
  remarksForOtherMetadata?: string | null;
  implementingUnitId?: string | null;
  expenseCodeId?: string | null;
  saaobId?: string | null;
  aroType?: "ps" | "mooe" | "finex" | "capex" | null;
  budgetType?: "ab" | "sb" | "rb" | null;
  aroLink?: string | null;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.verify(
    [permission.LBAC_DATA_READ, permission.LBAC_DATA_WRITE],
    "and",
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "No such item found.").build();
  }

  const body = await tryParseJson<UpdateLbacItemBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  const validate = await validator.validate<UpdateLbacItemBody>(body, {
    properties: {
      aipRefCode: { type: "string", formatter: "uuid" },
      mfoPpa: { type: "string", formatter: "non-empty-string" },
      majorFinalOutput: { type: "string", formatter: "non-empty-string" },
      performanceOutputIndicator: { type: "string", formatter: "non-empty-string" },
      targetForBudgetYear: { type: "string", formatter: "non-empty-string" },
      proposedBudgetPS: { type: "string", formatter: "decimal" },
      proposedBudgetMOOE: { type: "string", formatter: "decimal" },
      proposedBudgetFE: { type: "string", formatter: "decimal" },
      proposedBudgetCO: { type: "string", formatter: "decimal" },
      remarks: { type: "string", formatter: "non-empty-string" },
      remarksForAllocation: { type: "string", formatter: "non-empty-string" },
      gadable: { type: "boolean" },
      tagging: { type: "string", formatter: "non-empty-string" },
      amountAttributed: { type: "string", formatter: "decimal" },
      physicalTargets: { type: "string", formatter: "non-empty-string" },
      priorYearAccomplishments: { type: "string", formatter: "non-empty-string" },
      remarksForOtherMetadata: { type: "string", formatter: "non-empty-string" },
      implementingUnitId: { type: "string", formatter: "uuid" },
      expenseCodeId: { type: "string", formatter: "uuid" },
      saaobId: { type: "string", formatter: "uuid" },
      aroType: { type: "string", formatter: "non-empty-string" },
      budgetType: { type: "string", formatter: "non-empty-string" },
      aroLink: { type: "string", formatter: "uuid" },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!).build();
  }

  const result = await lbac.updateLbacItem(id, body);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.verify(
    [permission.LBAC_DATA_READ, permission.LBAC_DATA_WRITE],
    "and",
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "No such item found.").build();
  }

  const result = await lbac.deleteLbacItem(id);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
