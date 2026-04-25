import { NextRequest } from "next/server";

import { enroll } from "@/lib/accounts";
import { oneOf } from "@/lib/one-of";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";

export async function POST(request: NextRequest) {
  const body = await tryParseJson<EnrollmentRequirements>(request);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  // Validate the request body
  const validation = await validator.validate<EnrollmentRequirements>(body, {
    properties: {
      fullName: {
        type: "string",
        formatter: "non-empty-string",
      },
      email: {
        type: "string",
        formatter: "email",
      },
      password: {
        type: "string",
        formatter: "strong-password",
      },
      positionId: {
        type: "string",
        formatter: "uuid",
      },
      token: {
        type: "string",
        formatter: "non-empty-string",
      },
    },
    requiredProperties: ["fullName", "email", "password", "positionId", "token"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  // Enrollment
  const result = await enroll(body);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type EnrollmentRequirements = {
    fullName: string;
    email: string;
    password: string;
    positionId: string;
    token: string;
}
