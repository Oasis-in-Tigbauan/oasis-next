import type { NextRequest } from "next/server";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as saaob from "@/lib/saaob";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";
import type { SaaobCreateEntryPayload } from "@/lib/saaob";

type CreateEntryBody = SaaobCreateEntryPayload & {
  parentId: string;
};

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE], "and");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateEntryBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  const validate = await validator.validate<CreateEntryBody>(body, {
    properties: {
      parentId: { type: "string", formatter: "uuid" },
      name: { type: "string", formatter: "non-empty-string" },
      annualBudget: { type: "string", formatter: "decimal" },
      remarks: { type: "string", formatter: "non-empty-string" },
      expenseCodeId: { type: "string", formatter: "uuid" },
      allotmentShouldCopyFromAppropriation: { type: "boolean" },
    },
    requiredProperties: ["parentId", "name", "annualBudget"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!).build();
  }

  const result = await saaob.createEntry(body.parentId, session.user!, {
    name: body.name,
    annualBudget: body.annualBudget,
    remarks: body.remarks,
    expenseCodeId: body.expenseCodeId,
    allotmentShouldCopyFromAppropriation: body.allotmentShouldCopyFromAppropriation,
  });
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status201Created).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
