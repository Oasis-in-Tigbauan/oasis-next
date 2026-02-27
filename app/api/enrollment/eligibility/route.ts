import { NextRequest } from "next/server";

import { getEligibility } from "@/lib/accounts";
import { oneOf } from "@/lib/one-of";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams.get("token");
  if (!params) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{
      message: "Missing token parameter.",
    }]).orchestrate();
  }

  // Validate token against the database
  const eligibility = await getEligibility(params);
  return oneOf(eligibility).match(
    (success) => {
      return ResponseComposer.compose(StatusCodes.Status200Ok)
        .setBody({
          id: success.id,
          token: success.token,
          officeId: success.officeId,
          officeName: success.officeName,
          assignablePositions: success.assignablePositions,
        })
        .orchestrate();
    },
    (err) => ResponseComposer.composeFromFailure(err).orchestrate(),
  );
}
