import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";

export async function POST() {
  await auth.api.signOut({
    headers: await headers(),
  });

  return ResponseComposer.compose(StatusCodes.Status204NoContent).orchestrate();
}
