import type {NextRequest} from 'next/server';

import {
  parseLbacTemplateType,
  type LbacTemplateType,
  type LbacTemplateUploadInput,
} from '@/lib/lbac';
import {ErrorCodes, Failure, Success, type Result} from '@/lib/one-of';

/**
 * Reads multipart form data from a Next.js request.
 */
export async function readFormData(req: NextRequest): Promise<Result<FormData>> {
  try {
    const formData = await req.formData();
    return new Success(formData);
  } catch {
    return new Failure(ErrorCodes.ValidationFailure, 'Invalid multipart form data.');
  }
}

/**
 * Parses multipart form data for LBAC template upload or replace operations.
 */
export async function parseTemplateUploadFormData(
  formData: FormData,
): Promise<Result<LbacTemplateUploadInput>> {
  const typeRaw = formData.get('type');
  if (typeRaw !== 'header' && typeRaw !== 'footer') {
    return new Failure(
      ErrorCodes.ValidationFailure,
      "Invalid template type. Must be 'header' or 'footer'.",
    );
  }

  const fileField = formData.get('file');
  if (!fileField || typeof fileField === 'string') {
    return new Failure(ErrorCodes.ValidationFailure, 'A file is required.');
  }

  const filename = fileField.name;
  const bytes = await fileField.arrayBuffer();
  const file = Buffer.from(bytes);

  if (file.length === 0) {
    return new Failure(ErrorCodes.ValidationFailure, 'The uploaded file is empty.');
  }

  return new Success({type: typeRaw, file, filename});
}

/**
 * Validates a template type from a JSON delete payload.
 */
export function parseTemplateTypeFromBody(type: unknown): Result<LbacTemplateType> {
  return parseLbacTemplateType(type);
}
