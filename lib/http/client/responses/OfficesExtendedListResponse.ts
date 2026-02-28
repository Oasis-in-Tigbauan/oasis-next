import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

type Response = Array<{
  id: string;
  name: string;
  userCount: number;
  roleCount: number;
}>;

export type OfficesExtendedListResponse = GenericOkResponse<Response>;
