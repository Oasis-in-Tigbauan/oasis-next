import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type AipReferenceResponse = {
  id: string;
  type: 'group' | 'item';
  parentId: string | null;
  sector: string | null;
  code: string | null;
  office: string | null;
  aipReferenceCode: string;
  description: string;
  implementingOffice: string | null;
  implementationStart: number | null;
  implementationCompletion: number | null;
  expectedOutputs: string | null;
  fundingSource: string | null;
  amountPS: string | null;
  amountMOOE: string | null;
  amountCO: string | null;
  amountCCAdapt: string | null;
  amountCCMitigate: string | null;
  ccTopologyCode: string | null;
  gadable: boolean;
  gadAmount: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AipNodeResponse = AipReferenceResponse & {
  children: AipNodeResponse[];
};

export type AipListResponse = GenericOkResponse<AipNodeResponse[]>;
export type AipReferenceSingleResponse = GenericOkResponse<AipReferenceResponse>;
