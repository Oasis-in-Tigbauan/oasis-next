import { NextRequest } from "next/server";

import { enroll } from "@/lib/enrollment";
import { ExceptionResponseComposer, ResponseComposer } from "@/lib/http/ResponseComposer";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { StatusCodes } from "@/lib/http/StatusCodes";
import { failureCodes, oneOf } from "@/lib/one-of";
import { validator } from "@/lib/validators";

export async function POST(request: NextRequest) {
    const body = await tryParseJson<EnrollmentRequirements>(request);
    if (!body) {
        return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{
            message: "Invalid Payload.",
        }]).orchestrate();
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
        return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [validation.errors!])
            .orchestrate();
    }

    // Enrollment
    const result = await enroll(body);
    return oneOf(result).match(
        s => ResponseComposer.compose(StatusCodes.Status200Ok)
            .setBody(s)
            .orchestrate(),
        e => {
            if (e.type === failureCodes.Fatal) {
                return ExceptionResponseComposer.compose(StatusCodes.Status500InternalServerError, [{ message: e.value! }])
                    .orchestrate();
            }

            return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: e.value! }])
                .orchestrate();
        },
    );
}

type EnrollmentRequirements = {
    fullName: string;
    email: string;
    password: string;
    positionId: string;
    token: string;
}
