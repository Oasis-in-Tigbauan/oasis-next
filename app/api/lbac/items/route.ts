import type { NextRequest } from "next/server";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as lbac from "@/lib/lbac";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";

type CreateLbacItemBody = {
  groupId: string;
  aipRefCode?: string | null;
  mfoPpa: string;
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
};

export async function POST(req: NextRequest) {
  const session = await auth.verify(
    [permission.LBAC_DATA_READ, permission.LBAC_DATA_WRITE],
    "and",
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateLbacItemBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  const validate = await validator.validate<CreateLbacItemBody>(body, {
    properties: {
      groupId: { type: "string", formatter: "uuid" },
      mfoPpa: { type: "string", formatter: "non-empty-string" },
      aipRefCode: { type: "string", formatter: "uuid" },
      proposedBudgetPS: { type: "string", formatter: "decimal" },
      proposedBudgetMOOE: { type: "string", formatter: "decimal" },
      proposedBudgetFE: { type: "string", formatter: "decimal" },
      proposedBudgetCO: { type: "string", formatter: "decimal" },
      implementingUnitId: { type: "string", formatter: "uuid" },
      expenseCodeId: { type: "string", formatter: "uuid" },
      gadable: { type: "boolean" },
      majorFinalOutput: { type: "string", formatter: "non-empty-string" },
      performanceOutputIndicator: { type: "string", formatter: "non-empty-string" },
      targetForBudgetYear: { type: "string", formatter: "non-empty-string" },
      remarks: { type: "string", formatter: "non-empty-string" },
      remarksForAllocation: { type: "string", formatter: "non-empty-string" },
      tagging: { type: "string", formatter: "non-empty-string" },
      amountAttributed: { type: "string", formatter: "decimal" },
      physicalTargets: { type: "string", formatter: "non-empty-string" },
      priorYearAccomplishments: { type: "string", formatter: "non-empty-string" },
      remarksForOtherMetadata: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: ["groupId", "mfoPpa"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!).build();
  }

  const { groupId, ...payload } = body;
  const result = await lbac.createLbacItem(groupId, payload, session.user!);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
