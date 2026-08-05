import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type AipSearchResultItem = {
  id: string;
  aipReferenceCode: string;
  description: string;
};

export type AipSearchResponse = GenericOkResponse<AipSearchResultItem[]>;
