import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

type Response = {
  id: string;
  accountName: string;
  fpp: Optional<string>;
  classification: Optional<string>;
  subClassification: Optional<string>;
  group: Optional<string>;
  accountCode: Optional<string>;
  class: Optional<string>;
  allowedFor: Array<{id: string; aa: string}>;
};

export type ExpenseClassResponse = GenericOkResponse<Response>;
