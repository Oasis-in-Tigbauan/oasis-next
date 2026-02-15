import type { ErrorCollection } from "@/lib/http/ResponseComposer";
import type { StatusCodes } from "@/lib/http/StatusCodes";

export interface ApiResponseException {
    /**
     * IETF RFC 7237 Error Type
     * @see https://datatracker.ietf.org/doc/html/rfc7237
     */
    type: string;

    /**
     * Title of the error
     */
    title: string;

    /**
     * Error code
     */
    status: StatusCodes | number;

    /**
     * Trace ID of the error
     * @remarks ID of the error which the developers can track. However, this is not yet implemented.
     */
    traceId?: string;

    errors: ErrorCollection;
}
