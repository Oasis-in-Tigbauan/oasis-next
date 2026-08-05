import type {
  Commutation,
  LeaveType,
  OtherPurpose,
  SickLocation,
  StudyPurpose,
  VacationLocation,
} from '@/lib/forms/leave';
import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type LeaveApplicationItem = {
  id: string;
  refNumber: number;
  date: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  dateOfFiling: string;
  position: string;
  monthlySalary: string;
  leaveTypes: LeaveType[];
  otherLeaveDescription?: string;
  vacationLocation?: VacationLocation;
  vacationLocationDetails?: string;
  sickLocation?: SickLocation;
  illnessDetails?: string;
  studyPurpose?: StudyPurpose;
  otherPurposes: OtherPurpose[];
  workingDays: string;
  leaveStartDate: string;
  inclusiveDates: string;
  commutation: Commutation;
  approvedBy?: string;
  approvedByPosition?: string;
};

export type LeaveApplicationListResponse = GenericOkResponse<LeaveApplicationItem[]>;
export type LeaveApplicationResponse = GenericOkResponse<LeaveApplicationItem>;
