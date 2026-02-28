import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type OfficeSingleResponse = GenericOkResponse<{
  id: string;
  name: string;
  role: Array<{
    id: string;
    name: string;
    permissions: Array<string>;
  }>;
}>;
