import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

type Response = Array<{
  id: string;
  name: string;
  heads: Array<{
    id: string;
    name: string;
  }>;
}>;

export type OfficeCodeWithHeadsResponse = GenericOkResponse<Response>;
