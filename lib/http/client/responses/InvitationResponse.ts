import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

type Response = {
  id: string;
  email: string;
  officeId: string;
  officeName: string;
  errors?: object;
};

export type InvitationResponse = GenericOkResponse<Response>;
