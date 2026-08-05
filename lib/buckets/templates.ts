import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {and, eq} from 'drizzle-orm';
import {v7 as uuidv7} from 'uuid';

import {db} from '@/lib/db';
import {templateBucket} from '@/lib/db/schema';
import {ErrorCodes, Failure, Result, Success} from '@/lib/one-of';

const STORAGE_DIR = process.env.BUCKET_ROOT || path.join(os.homedir(), '.oasis-bucket', 'bucket');

/**
 * Uploads a new template file and records it in the template bucket.
 *
 * @description
 * Validates that `identifier` is non-empty and `filename` ends with `.xlsx`. Checks that no
 * existing template with the same `identifier` and `type` combination is already stored — each
 * `(identifier, type)` pair must be unique. On validation success, writes the file buffer to
 * `storage/templates/<uuid>.xlsx`, inserts a new row into `template_bucket`, and returns the
 * created record.
 *
 * On success, wraps the new {@link TemplateBucketItem} in a {@link Success}. On a duplicate or
 * invalid input, returns a {@link Failure} with `ValidationFailure`. On unexpected failure, wraps
 * the error in a fatal {@link Failure}.
 *
 * @async
 * @function upload
 * @param {TemplateUploadInput} input - Upload parameters including identifier, type, file buffer, and filename.
 * @returns {Promise<Result<TemplateBucketItem>>} The newly created template record on success, or a failure result.
 *
 * @remarks
 * - File is stored at `<cwd>/storage/templates/<uuid>.xlsx`; the directory is created if absent.
 * - Only one template per `(identifier, type)` pair may exist; use `modify` to replace an existing template.
 */
export async function upload(input: TemplateUploadInput): Promise<Result<TemplateBucketItem>> {
  try {
    const validationError = validateUploadInput(input.identifier, input.filename);
    if (validationError) return validationError;

    const existing = await findExisting(input.identifier, input.type);
    if (existing.length > 0) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        `A ${input.type} template for identifier "${input.identifier}" already exists. Use modify to replace it.`,
      );
    }

    await ensureStorageDir();

    const filePath = path.join(STORAGE_DIR, `${uuidv7()}.xlsx`);
    await fs.writeFile(filePath, input.file);

    const [inserted] = await db
      .insert(templateBucket)
      .values({
        identifier: input.identifier,
        templatePath: filePath,
        templateType: input.type,
      })
      .returning();

    return new Success(mapRow(inserted));
  } catch (err) {
    return new Failure(ErrorCodes.Fatal, 'Failed to upload template.', undefined, err);
  }
}

/**
 * Replaces the file of an existing template and updates the stored path.
 *
 * @description
 * Validates that `identifier` is non-empty and `filename` ends with `.xlsx`. Looks up the existing
 * template by `identifier` and `type` — returns `ResourceNotFound` if no matching record exists.
 * On success, writes the new buffer to a new UUID-named path, updates `template_path` in the
 * database, then deletes the previous file from disk. The `updatedAt` timestamp is refreshed
 * automatically by Drizzle's `$onUpdate` callback.
 *
 * On success, wraps the updated {@link TemplateBucketItem} in a {@link Success}. On missing record
 * or invalid input, returns a {@link Failure}. On unexpected failure, wraps the error in a fatal
 * {@link Failure}.
 *
 * @async
 * @function modify
 * @param {TemplateUploadInput} input - Upload parameters including identifier, type, file buffer, and filename.
 * @returns {Promise<Result<TemplateBucketItem>>} The updated template record on success, or a failure result.
 *
 * @remarks
 * - The new file is written before the database is updated to avoid a stale path being persisted on write failure.
 * - The old file is deleted after the database update succeeds; deletion failures are silently swallowed.
 */
export async function modify(input: TemplateUploadInput): Promise<Result<TemplateBucketItem>> {
  try {
    const validationError = validateUploadInput(input.identifier, input.filename);
    if (validationError) return validationError;

    const existing = await findExisting(input.identifier, input.type);
    if (existing.length === 0) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        `No ${input.type} template found for identifier "${input.identifier}". Use upload to create one first.`,
      );
    }

    const current = existing[0];

    await ensureStorageDir();

    const newFilePath = path.join(STORAGE_DIR, `${uuidv7()}.xlsx`);
    await fs.writeFile(newFilePath, input.file);

    const [updated] = await db
      .update(templateBucket)
      .set({templatePath: newFilePath})
      .where(eq(templateBucket.id, current.id))
      .returning();

    await fs.unlink(current.templatePath).catch(() => {});

    return new Success(mapRow(updated));
  } catch (err) {
    return new Failure(ErrorCodes.Fatal, 'Failed to modify template.', undefined, err);
  }
}

/**
 * Removes a template record and deletes its associated file from disk.
 *
 * @description
 * Validates that `identifier` is non-empty, then looks up the template by `identifier` and `type`.
 * Returns `ResourceNotFound` if no matching record exists. On success, deletes the database row
 * first, then removes the corresponding file from disk. File deletion failures are silently
 * swallowed after the row has been removed to maintain record consistency.
 *
 * On success, wraps `void` in a {@link Success}. On missing record or invalid input, returns a
 * {@link Failure}. On unexpected failure, wraps the error in a fatal {@link Failure}.
 *
 * @async
 * @function remove
 * @param {{ identifier: string; type: TemplateType }} input - Identifier and type of the template to delete.
 * @returns {Promise<Result<void>>} A void success result, or a failure result.
 *
 * @remarks
 * - The database row is deleted before the file to prevent orphaned records if file deletion fails.
 */
export async function remove(input: {
  identifier: string;
  type: TemplateType;
}): Promise<Result<void>> {
  try {
    const validationError = validateIdentifier(input.identifier);
    if (validationError) return validationError;

    const existing = await findExisting(input.identifier, input.type);
    if (existing.length === 0) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        `No ${input.type} template found for identifier "${input.identifier}".`,
      );
    }

    const current = existing[0];

    await db.delete(templateBucket).where(eq(templateBucket.id, current.id));

    await fs.unlink(current.templatePath).catch(() => {});

    return new Success(undefined);
  } catch (err) {
    return new Failure(ErrorCodes.Fatal, 'Failed to delete template.', undefined, err);
  }
}

/**
 * Retrieves the template record for a given identifier and type.
 *
 * @description
 * Validates that `identifier` is non-empty, then queries `template_bucket` for the row matching
 * the provided `identifier` and `type` combination. Returns `ResourceNotFound` when no match exists.
 *
 * On success, wraps the matching {@link TemplateBucketItem} in a {@link Success}. On missing record
 * or invalid input, returns a {@link Failure}. On unexpected failure, wraps the error in a fatal
 * {@link Failure}.
 *
 * @async
 * @function get
 * @param {{ identifier: string; type: TemplateType }} input - Identifier and type of the template to retrieve.
 * @returns {Promise<Result<TemplateBucketItem>>} The matching template record on success, or a failure result.
 */
export async function get(input: {
  identifier: string;
  type: TemplateType;
}): Promise<Result<TemplateBucketItem>> {
  try {
    const validationError = validateIdentifier(input.identifier);
    if (validationError) return validationError;

    const rows = await findExisting(input.identifier, input.type);
    if (rows.length === 0) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        `No ${input.type} template found for identifier "${input.identifier}".`,
      );
    }

    return new Success(mapRow(rows[0]));
  } catch (err) {
    return new Failure(ErrorCodes.Fatal, 'Failed to retrieve template.', undefined, err);
  }
}

async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, {recursive: true});
}

function validateUploadInput(identifier: string, filename: string): Failure | null {
  if (!identifier || identifier.trim().length === 0) {
    return new Failure(ErrorCodes.ValidationFailure, 'Identifier must be a non-empty string.');
  }

  if (!filename.toLowerCase().endsWith('.xlsx')) {
    return new Failure(ErrorCodes.ValidationFailure, 'Only .xlsx files are accepted.');
  }

  return null;
}

function validateIdentifier(identifier: string): Failure | null {
  if (!identifier || identifier.trim().length === 0) {
    return new Failure(ErrorCodes.ValidationFailure, 'Identifier must be a non-empty string.');
  }

  return null;
}

async function findExisting(identifier: string, type: TemplateType) {
  return db
    .select()
    .from(templateBucket)
    .where(and(eq(templateBucket.identifier, identifier), eq(templateBucket.templateType, type)))
    .limit(1);
}

function mapRow(row: typeof templateBucket.$inferSelect): TemplateBucketItem {
  return {
    id: row.id,
    identifier: row.identifier,
    templatePath: row.templatePath,
    templateType: row.templateType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type TemplateType = 'header' | 'footer';

export interface TemplateUploadInput {
  /** Domain key identifying which form/data this template belongs to (e.g. `"saaob.main-data"`). */
  identifier: string;
  /** Whether this template is a header or footer. */
  type: TemplateType;
  /** Raw bytes of the `.xlsx` file. */
  file: Buffer;
  /** Original filename; used solely to enforce the `.xlsx` extension. */
  filename: string;
}

export interface TemplateBucketItem {
  id: string;
  identifier: string;
  templatePath: string;
  templateType: TemplateType;
  createdAt: Date;
  updatedAt: Date;
}
