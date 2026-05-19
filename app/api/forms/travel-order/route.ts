import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as travelOrder from "@/lib/forms/travel-order";
import { Failure, oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";
import { getUserById } from "@/lib/accounts";

export async function GET() {
  const session = await auth.verify([
    permission.TRAVEL_READ,
    permission.TRAVEL_WRITE,
    permission.TRAVEL_APPROVER,
  ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await travelOrder.getAll();
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([
    permission.TRAVEL_READ,
    permission.TRAVEL_WRITE,
  ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateTravelOrderBody>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<CreateTravelOrderBody>(body, {
    properties: {
      status: { type: "string", formatter: "non-empty-string" },
      category: { type: "string", formatter: "non-empty-string" },
      startDate: { type: "string", formatter: "non-empty-string" },
      endDate: { type: "string" },
      location: { type: "string", formatter: "non-empty-string" },
      purpose: { type: "string", formatter: "non-empty-string" },
      subjectToClaims: { type: "boolean" },
      notes: { type: "string" },
      requestorId: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: ["status", "category", "startDate", "location", "purpose", "subjectToClaims"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  // Resolve the requestor: if requestorId is provided and the user has travel.write,
  // look up and use the specified user; otherwise fall back to the session user.
  let requestorUser = session.user!;
  if (body.requestorId && session.user!.office.role.permissions.includes(permission.TRAVEL_WRITE)) {
    const userResult = await getUserById(body.requestorId);
    if (userResult instanceof Failure) {
      return ApiResponseBuilder
        .createError(StatusCodes.Status400BadRequest, "Specified requestor user not found.")
        .build();
    }
    requestorUser = userResult.value;
  }

  const payload: travelOrder.TravelOrderPayload = {
    status: body.status,
    category: body.category,
    startDate: body.startDate,
    endDate: body.endDate,
    location: body.location,
    purpose: body.purpose,
    subjectToClaims: body.subjectToClaims,
    notes: body.notes,
  };

  const result = await travelOrder.createTravelOrder(payload, requestorUser);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type CreateTravelOrderBody = {
  status: string;
  category: string;
  startDate: string;
  endDate?: string;
  location: string;
  purpose: string;
  subjectToClaims: boolean;
  notes?: string;
  requestorId?: string;
};
