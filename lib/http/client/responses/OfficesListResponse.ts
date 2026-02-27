import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

type Response = {
  id: string;
  name: string;
};

export type OfficesListResponse = GenericOkResponse<Array<Response>>;
