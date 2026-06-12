import { createHmac, randomBytes } from "node:crypto";

type RandomBytes = (length: number) => Promise<Uint8Array>;

/**
 * Fills a byte buffer with cryptographically secure random values.
 *
 * @description
 * Allocates a {@link Uint8Array} of the requested size and populates it via Node.js {@link randomBytes}.
 *
 * On invalid input, throws a {@link RangeError} when `length` is not a non-negative finite number.
 *
 * @async
 * @function getRandomBytes
 * @param {number} length - Number of random bytes to generate.
 * @returns {Promise<Uint8Array>} A buffer containing `length` random bytes.
 */
export const getRandomBytes: RandomBytes = async (
  length: number,
): Promise<Uint8Array> => {
  if (!Number.isFinite(length) || length < 0) {
    throw new RangeError("length must be a non-negative finite number");
  }

  return new Uint8Array(randomBytes(length));
};

/**
 * Creates a deterministic random-byte source seeded from the given entropy.
 *
 * @description
 * Uses the entropy as an HMAC-SHA-256 key, then returns a reusable function that expands output by signing an
 * incrementing 64-bit counter. Intended for reproducible password generation in tests rather than production secrets.
 *
 * On invalid input, throws a {@link RangeError} when `entropy` is empty.
 *
 * @async
 * @function createDeterministicRandomBytes
 * @param {Uint8Array} entropy - Seed bytes used to derive the HMAC key; must not be empty.
 * @returns {Promise<RandomBytes>} An async function that produces deterministic pseudo-random bytes for a given length.
 *
 * @remarks
 * - The returned function throws a {@link RangeError} for invalid length values, matching {@link getRandomBytes}.
 */
export const createDeterministicRandomBytes = async (
  entropy: Uint8Array,
): Promise<RandomBytes> => {
  if (entropy.length === 0) {
    throw new RangeError("entropy must not be empty");
  }

  const key = Buffer.from(entropy);

  let counter = 0n;
  const counterBytes = Buffer.alloc(8);
  const deterministicRandomBytes: RandomBytes = async (length: number) => {
    if (!Number.isFinite(length) || length < 0) {
      throw new RangeError("length must be a non-negative finite number");
    }

    const buffer = new Uint8Array(length);
    let offset = 0;

    while (offset < length) {
      counterBytes.writeBigUInt64LE(counter);
      counter += 1n;
      const block = createHmac("sha256", key).update(counterBytes).digest();
      const take = Math.min(block.length, length - offset);
      buffer.set(block.subarray(0, take), offset);
      offset += take;
    }

    return buffer;
  };

  return deterministicRandomBytes;
};

/**
 * Returns a uniformly distributed random integer in the half-open range `[min, max)`.
 *
 * @description
 * Draws enough random bytes to cover the requested range and applies rejection sampling so that every value in
 * `[min, max)` has equal probability. Avoids modulo bias that would skew results when the range does not divide the
 * byte space evenly.
 *
 * On invalid input, throws a {@link RangeError} when `min` or `max` is not finite, or when `max` is not greater than
 * `min`.
 *
 * @async
 * @function randomInt
 * @param {number} min - Inclusive lower bound.
 * @param {number} max - Exclusive upper bound.
 * @param {RandomBytes} [randomBytes] - Byte source used for sampling; defaults to {@link getRandomBytes}.
 * @returns {Promise<number>} A random integer `n` where `min <= n < max`.
 *
 * @remarks
 * - When `max - min === 1`, returns `min` without drawing random bytes.
 */
export const randomInt = async (
  min: number,
  max: number,
  randomBytesFn: RandomBytes = getRandomBytes,
): Promise<number> => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new RangeError("min and max must be finite numbers");
  }
  if (max <= min) {
    throw new RangeError("max must be greater than min");
  }

  const range = max - min;
  if (range === 1) {
    return min;
  }

  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValue = 256 ** bytesNeeded;
  const limit = maxValue - (maxValue % range);

  let value = limit;
  while (value >= limit) {
    const bytes = await randomBytesFn(bytesNeeded);
    value = 0;
    for (const byte of bytes) {
      value = value * 256 + byte;
    }
  }

  return min + (value % range);
};
