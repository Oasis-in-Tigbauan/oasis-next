import type { ApiResponseException } from "@/lib/http/client/responses/ApiResponseException";
import type { EnrollmentEligibilityResponse } from "@/lib/http/client/responses/EnrollmentEligibilityResponse";

export type {
    ApiResponseException,
    EnrollmentEligibilityResponse,
};

export interface BetterFetchResponse<TSuccess, TError> {
    data: TSuccess,
    error: TError
}
