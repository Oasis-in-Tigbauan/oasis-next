import type { ApiResponseException } from "@/lib/http/client/responses/ApiResponseException";
import type { EnrollmentEligibilityResponse } from "@/lib/http/client/responses/EnrollmentEligibilityResponse";
import type { InvitationResponse } from "@/lib/http/client/responses/InvitationResponse";
import type { InvitationListResponse } from "@/lib/http/client/responses/InvitationListResponse";
import type { OfficesListResponse } from "@/lib/http/client/responses/OfficesListResponse";
import type { UnactivatedListResponse } from "@/lib/http/client/responses/UnactivatedListResponse";

export type {
  ApiResponseException,
  EnrollmentEligibilityResponse,
  InvitationResponse,
  InvitationListResponse,
  OfficesListResponse,
  UnactivatedListResponse,
};

export interface BetterFetchResponse<TSuccess, TError> {
    data: TSuccess,
    error?: TError
}
