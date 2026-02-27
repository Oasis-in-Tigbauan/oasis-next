import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

type Response = {
  id: string;
  email: string;
  officeId: string;
  officeName: string;
};

export type InvitationListResponse = GenericOkResponse<Array<Response>>;
