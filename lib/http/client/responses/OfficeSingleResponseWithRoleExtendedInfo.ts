import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type OfficeSingleResponseWithRoleExtendedInfo = GenericOkResponse<{
  id: string;
  name: string;
  roles: Array<{
    id: string;
    name: string;
    permissions: Array<string>;
    userCount: number;
  }>;
}>;
