import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type ObrSearchItem = {
  id: string;
  obrNumber: string;
  alobs: string;
  payee: string;
  address: string;
  particulars: string;
  expenseClass: {
    id: string;
    accountName: string;
    accountCode: string | null | undefined;
    subClassification: string | null | undefined;
  } | null | undefined;
  office: {
    id: string;
    name: string;
  } | null | undefined;
};

export type ObrSearchResponse = GenericOkResponse<ObrSearchItem[]>;
