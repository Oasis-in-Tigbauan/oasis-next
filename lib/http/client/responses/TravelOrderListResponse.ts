import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type TravelOrderApprovedBy = {
  id: string;
  name: string;
  position: {
    id: string;
    name: string;
  };
};

export type TravelOrderRequestor = {
  id: string;
  name: string;
  office: {
    id: string;
    name: string;
  };
  officePosition: {
    id: string;
    name: string;
  };
};

export type TravelOrderItem = {
  id: string;
  refNumber: number;
  travelOrderStatus: string;
  date: string;
  requestor: TravelOrderRequestor;
  category: string;
  startDate: string;
  endDate?: string;
  noOfDays: number;
  location: string;
  purpose: string;
  time: string;
  subjectToClaims: boolean;
  notes?: string;
  approvedBy?: TravelOrderApprovedBy;
};

export type TravelOrderListResponse = GenericOkResponse<TravelOrderItem[]>;

export type TravelOrderUserItem = {
  id: string;
  name: string;
  office: {
    id: string;
    name: string;
  };
  officePosition: {
    id: string;
    name: string;
  };
};

export type TravelOrderUserListResponse = GenericOkResponse<TravelOrderUserItem[]>;
