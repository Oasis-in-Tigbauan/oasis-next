import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

type Response = {
  id: string;
  email: string;
  office: {
    id: string;
    name: string;
    role: {
      id: string;
      name: string;
    };
  };
  errors?: object;
};

export type InvitationResponse = GenericOkResponse<Response>;
