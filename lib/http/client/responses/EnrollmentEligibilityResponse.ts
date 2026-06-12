import { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

type Response = {
    id: string;
    token: string;
}

export type EnrollmentEligibilityResponse = GenericOkResponse<Response>
