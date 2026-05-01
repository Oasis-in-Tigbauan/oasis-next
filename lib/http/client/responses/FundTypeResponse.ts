import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

type Response = {
  id: string;
  name: string;
  description: Optional<string>;
};

export type FundTypeResponse = GenericOkResponse<Response>;
