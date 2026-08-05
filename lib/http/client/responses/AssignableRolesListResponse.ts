import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type AssignableRoleItem = {
  id: string;
  name: string;
};

export type AssignableRolesListResponse = GenericOkResponse<AssignableRoleItem[]>;
