import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type PpmpSaaobRef = {
  id: string;
  name: string;
};

export type PpmpLbacRef = {
  id: string;
  name: string;
  aipRefCode: string | null;
};

export type PpmpPlanItemResponse = {
  id: string;
  generalDescription: string | null;
  typeOfProject: "goods" | "infra" | "cons-serv";
  quantityOrSize: string;
  recommendedModeOfProcurement: string | null;
  eligibleForPreProcurementConference: boolean;
  startOfProcurementActivity: string;
  endOfProcurementActivity: string;
  expectedDeliveryPeriod: string;
  saaob: PpmpSaaobRef;
  estimatedBudget: string;
  attachedSupportingDocuments: string | null;
  remarks: string | null;
};

export type PpmpProjectGroupResponse = {
  id: string;
  title: string;
  children: PpmpPlanItemResponse[];
};

export type PpmpMinorGroupResponse = {
  id: string;
  lbac: PpmpLbacRef;
  children: Array<PpmpProjectGroupResponse | PpmpPlanItemResponse>;
};

export type PpmpMajorGroupResponse = {
  id: string;
  saaob: PpmpSaaobRef;
  children: PpmpMinorGroupResponse[];
};

export type PpmpDataResponse = GenericOkResponse<PpmpMajorGroupResponse[]>;
