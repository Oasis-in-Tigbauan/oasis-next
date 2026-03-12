import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

type Response = {
  id: string;
  aa: string;
  code: Optional<string>;
  sector: Optional<string>;
  function: Optional<string>;
  liftOffice: Optional<string>;
  subOffice: Optional<string>;
  office: Optional<string>;
  headUser: Optional<string>;
}

export type OfficeCodeListResponse = GenericOkResponse<Array<Response>>;
