import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type ObrRequestDetailItem = {
  id: string;
  particulars: string;
  amount: string;
  expenseCode: {
    id: string;
    name: string;
    fpp: Optional<string>;
    accountCode: Optional<string>;
  };
  responsibilityCenter: {
    id: string;
    name: string;
  };
};

export type ObrRequestDetailApprover = {
  status: string;
  reason: Optional<string>;
  position: {
    id: string;
    name: string;
  };
  signer: Optional<{
    id: string;
    name: string;
  }>;
  signedAt: Optional<string>;
};

export type ObrRequestDetail = {
  id: string;
  type: string;
  requestNumber: string;
  payee: string;
  officeAddress: string;
  obrNumber: Optional<string>;
  prNumber: Optional<string>;
  submittedForApproval: boolean;
  disbursementApproved: boolean;
  promoted: boolean;
  requestItemsCount: number;
  office: {
    id: string;
    name: string;
  };
  publisher: {
    id: string;
    name: string;
  };
  requestItems: Array<ObrRequestDetailItem>;
  approvers: Array<ObrRequestDetailApprover>;
};

export type ObrRequestDetailResponse = GenericOkResponse<ObrRequestDetail>;
