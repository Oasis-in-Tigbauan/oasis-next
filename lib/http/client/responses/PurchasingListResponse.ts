import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type PurchasingItemSignatory = {
  id: string;
  name: string;
  position: string;
};

export type PurchasingItemAip = {
  id: string;
  aipCode: string;
  ppa: string;
  sourceOfFund: Optional<string>;
  amountCharged: Optional<string>;
  implementingOffice: Optional<string>;
};

export type PurchasingItemResponse = {
  id: string;
  prNumber: string;
  date: string;
  modeOfProcurement: Optional<{
    id: string;
    name: string;
    description?: string;
  }>;
  purchaseOrderNumber: Optional<string>;
  supplier: Optional<string>;
  address: Optional<string>;
  tinNumber: Optional<string>;
  placeOfDelivery: Optional<string>;
  dateOfDelivery: Optional<string>;
  deliveryTerm: Optional<string>;
  paymentTerm: Optional<string>;
  unit: string;
  itemDescription: string;
  quantity: string;
  unitCost: string;
  totalCost: string;
  purpose: string;
  requestingUser: {
    id: string;
    name: string;
  };
  requestingOffice: {
    id: string;
    name: string;
  };
  headOfOffice: PurchasingItemSignatory;
  approvedBy: PurchasingItemSignatory;
  treasurer: PurchasingItemSignatory;
  aip: PurchasingItemAip[];
};

export type PurchasingListResponse = GenericOkResponse<PurchasingItemResponse[]>;
