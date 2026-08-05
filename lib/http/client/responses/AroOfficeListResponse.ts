import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type AroOfficeItem = {
  id: string;
  name: string;
  code: string;
  description: string;
  leadUser: {
    id: string;
    name: string;
    position: {
      id: string;
      name: string;
    };
  };
};

export type AroOfficeListResponse = GenericOkResponse<AroOfficeItem[]>;
