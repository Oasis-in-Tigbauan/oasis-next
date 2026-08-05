import type {StatusCodes} from '@/lib/http/composers/StatusCodes';

export interface ApiResponseException {
  type: string;
  title: string;
  status: StatusCodes | number;
  statusText: string;
  traceId?: string;

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  details: string | Record<string, any>;
  message: string;
}
