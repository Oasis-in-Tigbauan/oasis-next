import { NextRequest } from "next/server";

import { ExceptionResponseComposer, ResponseComposer } from "@/lib/http/ResponseComposer";
import { getEligibility } from "@/lib/enrollment/eligibility";
import { oneOf } from "@/lib/one-of";
import { StatusCodes } from "@/lib/http/StatusCodes";

export async function GET(req: NextRequest) {
    const params = req.nextUrl.searchParams.get("token");
    if (!params) {
        return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{
            message: "Missing token parameter.",
        }]).orchestrate();
    }

    // Validate token against the database
    const eligibility = await getEligibility(params);
    return oneOf(eligibility).match(
        (success) => {
            return ResponseComposer.compose(StatusCodes.Status200Ok)
                .setBody(success)
                .orchestrate();
        },
        (err) => {
            return ExceptionResponseComposer.compose(StatusCodes.Status400BadRequest, [{
                message: err.value,
            }]).orchestrate();
        },
    );
}
