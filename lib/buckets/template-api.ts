import type { NextRequest } from "next/server";

import { ErrorCodes, Failure, Success, type Result } from "@/lib/one-of";

import * as templates from "@/lib/buckets/templates";
import type { TemplateBucketItem, TemplateType } from "@/lib/buckets/templates";

export type PublicSaaobTemplateInfo = {
  id: string;
  templateType: TemplateType;
  createdAt: string;
  updatedAt: string;
};

export type SaaobTemplatesBundle = {
  header: PublicSaaobTemplateInfo | null;
  footer: PublicSaaobTemplateInfo | null;
};

export type ParsedTemplateUpload = {
  type: TemplateType;
  file: Buffer;
  filename: string;
};

function toPublic(item: TemplateBucketItem): PublicSaaobTemplateInfo {
  return {
    id: item.id,
    templateType: item.templateType,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function getSlot(
  identifier: string,
  type: TemplateType,
): Promise<Result<PublicSaaobTemplateInfo | null>> {
  const result = await templates.get({ identifier, type });
  if (result instanceof Success) {
    return new Success(toPublic(result.value));
  }
  if (result.type === ErrorCodes.ResourceNotFound) {
    return new Success(null);
  }
  return result;
}

/**
 * Loads header and footer templates for a fixed bucket identifier.
 *
 * @description
 * Missing templates are represented as `null` rather than failing the request.
 *
 * @async
 * @function fetchTemplatesBundle
 * @param {string} identifier - Hardcoded bucket identifier from the API route.
 * @returns {Promise<Result<SaaobTemplatesBundle>>} Combined header/footer payload or a failure result.
 */
export async function fetchTemplatesBundle(
  identifier: string,
): Promise<Result<SaaobTemplatesBundle>> {
  const headerResult = await getSlot(identifier, "header");
  if (headerResult instanceof Failure) return headerResult;

  const footerResult = await getSlot(identifier, "footer");
  if (footerResult instanceof Failure) return footerResult;

  return new Success({
    header: headerResult.value,
    footer: footerResult.value,
  });
}

/**
 * Parses multipart form data for template upload or replace operations.
 *
 * @description
 * Expects `type` (`header` | `footer`) and `file` (`.xlsx`) fields. The identifier is never
 * accepted from the client.
 *
 * @async
 * @function parseTemplateUploadFormData
 * @param {FormData} formData - Parsed multipart body from the request.
 * @returns {Promise<Result<ParsedTemplateUpload>>} Upload payload or a validation failure.
 */
export async function parseTemplateUploadFormData(
  formData: FormData,
): Promise<Result<ParsedTemplateUpload>> {
  const typeRaw = formData.get("type");
  if (typeRaw !== "header" && typeRaw !== "footer") {
    return new Failure(
      ErrorCodes.ValidationFailure,
      "Invalid template type. Must be 'header' or 'footer'.",
    );
  }

  const fileField = formData.get("file");
  if (!fileField || typeof fileField === "string") {
    return new Failure(ErrorCodes.ValidationFailure, "A file is required.");
  }

  const filename = fileField.name;
  const bytes = await fileField.arrayBuffer();
  const file = Buffer.from(bytes);

  if (file.length === 0) {
    return new Failure(ErrorCodes.ValidationFailure, "The uploaded file is empty.");
  }

  return new Success({ type: typeRaw, file, filename });
}

/**
 * Validates a template type from a JSON delete payload.
 *
 * @function parseTemplateTypeFromBody
 * @param {unknown} type - Raw `type` field from the request body.
 * @returns {Result<TemplateType>} Parsed type or a validation failure.
 */
export function parseTemplateTypeFromBody(type: unknown): Result<TemplateType> {
  if (type !== "header" && type !== "footer") {
    return new Failure(
      ErrorCodes.ValidationFailure,
      "Invalid template type. Must be 'header' or 'footer'.",
    );
  }
  return new Success(type);
}

/**
 * Uploads or replaces a template for a fixed bucket identifier.
 *
 * @async
 * @function uploadOrModifyTemplate
 * @param {string} identifier - Hardcoded bucket identifier from the API route.
 * @param {ParsedTemplateUpload} input - Parsed upload payload.
 * @param {"upload" | "modify"} mode - Whether to create or replace an existing template.
 * @returns {Promise<Result<PublicSaaobTemplateInfo>>} Public template metadata on success.
 */
export async function uploadOrModifyTemplate(
  identifier: string,
  input: ParsedTemplateUpload,
  mode: "upload" | "modify",
): Promise<Result<PublicSaaobTemplateInfo>> {
  const serviceInput = {
    identifier,
    type: input.type,
    file: input.file,
    filename: input.filename,
  };

  const result = mode === "upload"
    ? await templates.upload(serviceInput)
    : await templates.modify(serviceInput);

  if (result instanceof Success) {
    return new Success(toPublic(result.value));
  }
  return result;
}

/**
 * Removes a template for a fixed bucket identifier and type.
 *
 * @async
 * @function removeTemplate
 * @param {string} identifier - Hardcoded bucket identifier from the API route.
 * @param {TemplateType} type - Template type to delete.
 * @returns {Promise<Result<void>>} Void success or a failure result.
 */
export async function removeTemplate(
  identifier: string,
  type: TemplateType,
): Promise<Result<void>> {
  return templates.remove({ identifier, type });
}

/**
 * Reads multipart form data from a Next.js request.
 *
 * @async
 * @function readFormData
 * @param {NextRequest} req - Incoming request.
 * @returns {Promise<Result<FormData>>} Parsed form data or a validation failure.
 */
export async function readFormData(req: NextRequest): Promise<Result<FormData>> {
  try {
    const formData = await req.formData();
    return new Success(formData);
  } catch {
    return new Failure(ErrorCodes.ValidationFailure, "Invalid multipart form data.");
  }
}
