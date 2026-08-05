import type {Permissions} from '@/lib/db/permissions';
import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

type Response = {
  permission: Permissions;
  description: string;
  note?: string;
};

export type PermissionDefinitionResponse = GenericOkResponse<Array<Response>>;
