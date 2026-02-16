import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { auth } from "@/lib/auth";
import { ExceptionResponseComposer, ResponseComposer } from "@/lib/http/ResponseComposer";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { StatusCodes } from "@/lib/http/StatusCodes";
import { validator } from "@/lib/validators";

export async function POST(req: NextRequest) {
    const body = await tryParseJson<SignInRequest>(req);
    if (!body) {
        return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
            .orchestrate();
    }

    const validation = await validator.validate<SignInRequest>(body, {
        properties: {
            email: { type: "string", formatter: "email" },
            password: { type: "string", formatter: "non-empty-string" },
            rememberMe: { type: "boolean" },
        },
        requiredProperties: ["email", "password"],
        allowUnvalidatedProperties: false,
    });
    if (!validation.ok) {
        return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [validation.errors!])
            .orchestrate();
    }

    try {
        await auth.api.signInEmail({
            body: {
                email: body.email,
                password: body.password,
                rememberMe: body.rememberMe ?? false,
            },
        });

        return ResponseComposer.compose(StatusCodes.Status200Ok)
            .setBody({ ok: true })
            .orchestrate();
    } catch (e) {
        Sentry.captureException(e);

        return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{ message: "Invalid Credentials." }])
            .orchestrate();
    }
}

type SignInRequest = {
    email: string;
    password: string;
    rememberMe?: boolean;
}
