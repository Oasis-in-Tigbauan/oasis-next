import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";
import type { Permissions } from "@/lib/db/permissions";

type Response = {
  id: string;
  name: string;
  permissions: Array<Permissions>;
  userCount: number;
};

export type RoleDefinitionResponse = GenericOkResponse<Response>;
