import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

type Response = Array<{
  id: string;
  name: string;
  description: Optional<string>;
}>;

export type FundTypesListResponse = GenericOkResponse<Response>;
