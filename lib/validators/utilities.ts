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
  return value != null || value !== undefined;
}

/**
 * Checks if the string is not empty.
 *
 * @param {string} value - Value to validate if it's not empty.
 * @returns {boolean} Returns true if the value is not empty, returns false otherwise.
 * @remarks If a non-string type is passed, it will return false.
 */
export function isNotEmpty(value: string): boolean {
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
