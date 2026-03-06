import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";
import type { Permissions } from "@/lib/db/permissions";

type Response = {
  permission: Permissions;
  description: string;
  note?: string;
}

export type PermissionDefinitionResponse = GenericOkResponse<Array<Response>>;
