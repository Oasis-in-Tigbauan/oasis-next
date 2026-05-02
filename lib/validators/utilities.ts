/**
 * Checks if a value exists
 *
 * @param {any} value - Value to validate if it exists
 * @returns {boolean} Returns true if the value is not null or undefined, returns false otherwise.
 */
export function isExisty(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any,
): boolean {
  return value !== null && value !== undefined;
}

/**
 * Checks if the string is not empty.
 *
 * @param {string} value - Value to validate if it's not empty.
 * @returns {boolean} Returns true if the value is not empty, returns false otherwise.
 * @remarks If a non-string type is passed, it will return false.
 */
export function isNotEmpty(value: Optional<string>): boolean {
  if (!isExisty(value)) {
    return false;
  }

  // noinspection SuspiciousTypeOfGuard
  if (typeof value !== "string") {
    return false;
  }

  return value.trim().length > 0;
}

/**
 * Checks whether every element in `lookup` is present in `input`.
 *
 * Uses strict equality semantics as implemented by `Array.prototype.includes`
 * (i.e., SameValueZero).
 *
 * @template T Element type.
 * @param {T[]} lookup The list of required items.
 * @param {T[]} input The list to search within.
 * @returns {boolean} `true` if all items in `lookup` exist in `input`; otherwise `false`.
 *
 * @example
 * every(["read", "write"], ["read", "write", "delete"]); // true
 * every([1, 2], [2, 3]); // false
 */
export function every<T>(lookup: T[], input: T[]): boolean {
  return lookup.every((item) => input.includes(item));
}

/**
 * Determines whether the provided array contains only non-empty strings.
 *
 * Each element must be:
 * - of type `"string"`, and
 * - non-empty according to {@link isNotEmpty}.
 *
 * @param {any[]} data Array to validate.
 * @returns {boolean} `true` if all items are non-empty strings; otherwise `false`.
 *
 * @example
 * isArrayOfStrings(["a", "b"]); // true
 * isArrayOfStrings(["a", ""]); // false
 * isArrayOfStrings(["a", 1] as any); // false
 */
export function isArrayOfStrings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[],
): boolean {
  return data.every((item) => typeof item === "string" && isNotEmpty(item));
}

/**
 * Determines whether a given string is a syntactically valid email address.
 *
 * This is a lightweight format check intended for quick validation (e.g., form input).
 * It rejects empty values and then verifies the value matches a basic `local@domain.tld` pattern.
 * It does not guarantee the address exists, can receive mail, or complies with every edge case in
 * relevant RFCs.
 *
 * @param {string} email - The email address candidate to validate.
 * @returns {boolean} `true` if the input is non-empty and matches the expected email format; otherwise `false`.
 *
 * @example
 * isEmail("person@example.com"); // true
 * isEmail("not-an-email"); // false
 */
export function isEmail(email: string): boolean {
  // Fail on empty strings
  if (!isNotEmpty(email)) return false;

  // Check via regex
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Checks whether a given string is a valid UUID in the canonical 8-4-4-4-12 hexadecimal format.
 *
 * This is a format-only validation:
 * - Rejects empty values.
 * - Ensures the input matches the standard UUID textual shape (hex digits separated by hyphens).
 * It does not enforce UUID version/variant semantics (e.g., v4 vs v1) beyond the general pattern.
 *
 * @param {string} uuid - The UUID candidate to validate.
 * @returns {boolean} `true` if the input is non-empty and matches the expected UUID format; otherwise `false`.
 *
 * @example
 * isUuid("550e8400-e29b-41d4-a716-446655440000"); // true
 * isUuid("not-a-uuid"); // false
 */
export function isUuid(uuid: string): boolean {
  // Fail on empty strings
  if (!isNotEmpty(uuid)) return false;

  // Check via regex
  return /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/.test(uuid);
}

/**
 * Validates whether a value can be treated as a number.
 *
 * @description
 * Converts the provided value with {@link Number} and checks whether the result is a valid numeric value. Optionally
 * applies a negative-number rule based on the `allowNegative` flag.
 *
 * @function isNumber
 * @param {Optional<string | number>} value - Value to validate as a number.
 * @param {boolean} [allowNegative=false] - Whether negative numbers should be considered valid.
 * @param {boolean} [limitSafeIntegersOnly=true] - Whether to limit the validation to safe integers (2^53 - 1).
 * @returns {boolean} `true` when the value is numeric and satisfies the negative-number rule; otherwise, `false`.
 *
 * @remarks
 * - Values that convert to `NaN` are rejected.
 * - Values that exceed the safe integer range (2^53 - 1) are rejected. (limitSafeIntegersOnly = true)
 * - Values that passed the finite values (Infinity or -Infinity) are rejected. (limitSafeIntegersOnly = false)
 * - When negative values are not allowed, negative numbers are rejected.
 */
export function isNumber(
  value: Optional<string | number>,
  allowNegative: boolean = true,
  limitSafeIntegersOnly: boolean = true,
): boolean {
  if (!isExisty(value)) return false;
  if (typeof value === "string" && !isNotEmpty(value)) return false;

  const n = Number(value);

  if (Number.isNaN(n)) return false;
  if (!Number.isFinite(n)) return false;

  if (limitSafeIntegersOnly && !Number.isSafeInteger(n)) return false;

  return !(!allowNegative && n < 0);
}

/**
 * Filters an object to include only meaningful, serializable values for update operations.
 *
 * The function removes entries whose values are considered empty or invalid, including:
 * - `null` or `undefined`
 * - empty strings
 * - empty arrays
 * - empty objects
 * - `NaN`, `Infinity`, and other non-finite numbers
 *
 * After filtering, the result is serialized and deserialized with JSON to discard
 * any remaining unserializable values.
 *
 * @param {Record<string, Optional<any>>} data The input object containing candidate fields for update.
 * @returns {Record<string, any>} A new object containing only valid, non-empty, serializable fields.
 *
 * @example
 * const result = filterUpdatedFields({
 *   name: "Office A",
 *   description: "",
 *   tags: [],
 *   metadata: {},
 *   count: 5,
 * });
 * // result => { name: "Office A", count: 5 }
 */
export function filterUpdatedFields(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, Optional<any>>): Record<string, any>
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {};

  for (const key of Object.keys(data)) {
    // Check if the keys do really exist
    if (!isExisty(data[key])) continue;

    // If the value type is of string, do check if it contains something
    if (typeof data[key] === "string" && !isNotEmpty(data[key])) continue;

    // If the value type is of an object, do check if it contains something
    if (typeof data[key] === "object") {
      // If array.
      if (Array.isArray(data[key]) && data[key].length === 0) continue;

      // If just object.
      if (Object.keys(data[key]).length === 0) continue;
    }

    // Infinity and numbers that goes the limit of finite numbers are considered
    // empty by default
    if (typeof data[key] === "number") {
      const n = Number(data[key]);
      if (Number.isNaN(n) || !Number.isFinite(n)) continue;
    }

    result[key] = data[key];
  }

  // Filter out unserializable values.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.parse(JSON.stringify(result)) as Record<string, any>;
}
