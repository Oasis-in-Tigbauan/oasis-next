import {
  createDeterministicRandomBytes,
  getRandomBytes,
  randomInt,
} from '@/lib/generators/password-generator/random';

const VOWELS = 'aeiou';
const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';
const CONSONANT = new RegExp(`[${CONSONANTS}]$`, 'i');
const SYMBOL_PATTERN = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const DEFAULT_PATTERN = /[\w!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const DEFAULT_LENGTH = 12;
const MIN_ENTROPY_BITS = 64;
const MIN_WORD_LENGTH = 3;
const MAX_WORD_LENGTH = 7;
const textEncoder = new TextEncoder();

// Minimum memorable characters needed to reach MIN_ENTROPY_BITS.
const MIN_MEMORABLE_LENGTH = (() => {
  let bits = 0;
  let len = 0;
  let vowel = false;
  while (bits < MIN_ENTROPY_BITS) {
    bits += Math.log2(vowel ? VOWELS.length : CONSONANTS.length);
    vowel = !vowel;
    len += 1;
  }
  return len;
})();

/**
 * Builds the character alphabet for pattern-based password generation.
 *
 * @description
 * Scans printable ASCII characters (code points 33–126) and collects those that match the given `pattern` when tested
 * individually. Patterns must match single characters, not the password string as a whole.
 *
 * On failure, throws an {@link Error} when no characters match the pattern.
 *
 * @function buildValidChars
 * @param {RegExp} pattern - Per-character filter used to build the sampling alphabet.
 * @returns {string[]} Characters that satisfy `pattern`, in ascending code-point order.
 */
const buildValidChars = (pattern: RegExp) => {
  const chars: string[] = [];
  for (let i = 33; i <= 126; i += 1) {
    const char = String.fromCharCode(i);
    if (pattern.test(char)) {
      chars.push(char);
    }
  }
  if (chars.length === 0) {
    throw new Error(
      `Could not find characters that match the password pattern ${pattern}. Patterns must match individual characters, not the password as a whole.`,
    );
  }
  return chars;
};

/**
 * Estimates entropy for pattern-based password generation.
 *
 * @description
 * Computes estimated entropy bits from the alphabet size and the number of randomly generated characters after the
 * fixed prefix. Also derives the minimum total length needed to reach the 64-bit security recommendation when the
 * alphabet has more than one character.
 *
 * @function estimatePatternEntropy
 * @param {number} alphabetSize - Number of characters available for random sampling.
 * @param {number} length - Target total password length including the prefix.
 * @param {number} prefixLength - Number of fixed prefix characters excluded from entropy.
 * @returns {{ entropyBits: number; recommendedLength: number | null }} Estimated entropy and recommended minimum
 *                                                                     length, or `null` when the alphabet is too
 *                                                                     small to reach 64 bits at any length.
 */
const estimatePatternEntropy = (alphabetSize: number, length: number, prefixLength: number) => {
  const bitsPerChar = alphabetSize > 1 ? Math.log2(alphabetSize) : 0;
  return {
    entropyBits: bitsPerChar * Math.max(0, length - prefixLength),
    recommendedLength:
      bitsPerChar > 0 ? prefixLength + Math.ceil(MIN_ENTROPY_BITS / bitsPerChar) : null,
  };
};

/**
 * Estimates entropy for memorable (alternating vowel/consonant) password generation.
 *
 * @description
 * Walks the memorable alphabet model from the end of `prefix` onward, alternating vowel and consonant pools for each
 * generated character. Also computes the minimum total length required to reach the 64-bit security recommendation.
 *
 * @function estimateMemorableEntropy
 * @param {number} length - Target total password length including the prefix.
 * @param {string} prefix - Fixed prefix whose final character determines whether the next generated character is a
 *                          vowel or consonant.
 * @returns {{ entropyBits: number; recommendedLength: number }} Estimated entropy and recommended minimum total
 *                                                               length.
 */
const estimateMemorableEntropy = (length: number, prefix: string) => {
  const effectiveLength = Math.max(0, length - prefix.length);
  let entropyBits = 0;
  let expectsVowel = CONSONANT.test(prefix);
  for (let i = 0; i < effectiveLength; i += 1) {
    entropyBits += Math.log2(expectsVowel ? VOWELS.length : CONSONANTS.length);
    expectsVowel = !expectsVowel;
  }

  let recommendedLength = prefix.length;
  let bits = 0;
  expectsVowel = CONSONANT.test(prefix);
  while (bits < MIN_ENTROPY_BITS) {
    bits += Math.log2(expectsVowel ? VOWELS.length : CONSONANTS.length);
    expectsVowel = !expectsVowel;
    recommendedLength += 1;
  }

  return {entropyBits, recommendedLength};
};

/**
 * Builds a memorable string by alternating vowels and consonants.
 *
 * @description
 * Generates `length` characters by repeatedly sampling from the vowel or consonant alphabet based on the current
 * position, flipping the expected character class after each draw.
 *
 * @async
 * @function buildMemorable
 * @param {number} length - Number of memorable characters to generate.
 * @param {boolean} startsWithVowel - Whether the first generated character should be drawn from the vowel alphabet.
 * @param {(min: number, max: number) => Promise<number>} nextInt - Injected integer sampler used for index selection.
 * @returns {Promise<string>} A memorable substring of the requested length.
 */
const buildMemorable = async (
  length: number,
  startsWithVowel: boolean,
  nextInt: (min: number, max: number) => Promise<number>,
) => {
  let expectsVowel = startsWithVowel;
  let result = '';
  for (let i = 0; i < length; i += 1) {
    const alphabet = expectsVowel ? VOWELS : CONSONANTS;
    result += alphabet[await nextInt(0, alphabet.length)];
    expectsVowel = !expectsVowel;
  }
  return result;
};

/**
 * Picks random word lengths for passphrase generation.
 *
 * @description
 * Assigns each word an initial length between 3 and 7 inclusive. When `targetLength` is provided and the summed
 * lengths are below it, randomly increments word lengths up to the maximum of 7 until the target is met or no word
 * can grow further.
 *
 * @async
 * @function buildWordLengths
 * @param {number} count - Number of words to size.
 * @param {(min: number, max: number) => Promise<number>} nextInt - Injected integer sampler used for length selection.
 * @param {number} [targetLength] - Optional minimum total character count across all words.
 * @returns {Promise<number[]>} Per-word lengths in generation order.
 */
const buildWordLengths = async (
  count: number,
  nextInt: (min: number, max: number) => Promise<number>,
  targetLength?: number,
) => {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const len = await nextInt(MIN_WORD_LENGTH, MAX_WORD_LENGTH + 1);
    lengths.push(len);
    total += len;
  }

  if (targetLength !== undefined && total < targetLength) {
    const adjustable: number[] = [];
    for (let i = 0; i < count; i += 1) {
      if (lengths[i]! < MAX_WORD_LENGTH) adjustable.push(i);
    }
    let remaining = targetLength - total;
    while (remaining > 0 && adjustable.length > 0) {
      const pick = await nextInt(0, adjustable.length);
      const wordIdx = adjustable[pick]!;
      lengths[wordIdx] = lengths[wordIdx]! + 1;
      remaining -= 1;
      if (lengths[wordIdx]! >= MAX_WORD_LENGTH) {
        adjustable.splice(pick, 1);
      }
    }
  }

  return lengths;
};

/**
 * Ensures a generated password contains symbols when the alphabet allows them.
 *
 * @description
 * Counts symbol characters in `password` using {@link SYMBOL_PATTERN}. When the count is below `minSymbols` and
 * `validChars` includes symbol characters, randomly replaces generated positions (after `prefixLength`) with symbols
 * until the minimum is met.
 *
 * @async
 * @function ensureSymbols
 * @param {string} password - Password produced by pattern-mode generation.
 * @param {string[]} validChars - Character alphabet used for pattern-mode sampling.
 * @param {number} prefixLength - Number of leading prefix characters that must not be modified.
 * @param {(min: number, max: number) => Promise<number>} nextInt - Injected integer sampler used for index selection.
 * @param {number} [minSymbols] - Minimum symbol count required; defaults to 1.
 * @returns {Promise<string>} The original password, or a variant with injected symbols when needed.
 *
 * @remarks
 * - Returns `password` unchanged when `validChars` contains no symbols or there are no replaceable positions.
 */
const ensureSymbols = async (
  password: string,
  validChars: string[],
  prefixLength: number,
  nextInt: (min: number, max: number) => Promise<number>,
  minSymbols = 1,
): Promise<string> => {
  const symbolChars = validChars.filter((char) => SYMBOL_PATTERN.test(char));
  if (symbolChars.length === 0) {
    return password;
  }

  const chars = [...password];
  let symbolCount = chars.filter((char) => SYMBOL_PATTERN.test(char)).length;
  if (symbolCount >= minSymbols) {
    return password;
  }

  const replaceableIndices: number[] = [];
  for (let i = prefixLength; i < chars.length; i += 1) {
    replaceableIndices.push(i);
  }
  if (replaceableIndices.length === 0) {
    return password;
  }

  let needed = minSymbols - symbolCount;
  while (needed > 0 && replaceableIndices.length > 0) {
    const pick = await nextInt(0, replaceableIndices.length);
    const idx = replaceableIndices[pick]!;
    chars[idx] = symbolChars[await nextInt(0, symbolChars.length)]!;
    symbolCount += 1;
    needed -= 1;
    replaceableIndices.splice(pick, 1);
  }

  return chars.join('');
};

/**
 * Generates a password from positional arguments.
 *
 * @description
 * Maps the provided positional parameters into a {@link GenerateOptions} object and delegates to
 * {@link generatePasswordWithOptions}. Omitted arguments fall back to that function's defaults.
 *
 * On invalid input or insufficient entropy, throws the same errors as {@link generatePasswordWithOptions}.
 *
 * @async
 * @function generatePassword
 * @param {number} [length] - Target password length; defaults to 12 when omitted.
 * @param {boolean} [memorable] - When true, uses alternating vowel/consonant generation instead of pattern mode.
 * @param {RegExp} [pattern] - Per-character filter for pattern mode; defaults to letters, digits, underscore, and symbols.
 * @param {string} [prefix] - Fixed prefix prepended before randomly generated characters.
 * @returns {Promise<string>} The generated password.
 *
 * @remarks
 * - Passphrase mode (`words`) is only available through {@link generatePasswordWithOptions}.
 */
export const generatePassword = async (
  length?: number,
  memorable?: boolean,
  pattern?: RegExp,
  prefix?: string,
): Promise<string> => {
  const opts: GenerateOptions = {};
  if (length !== undefined) opts.length = length;
  if (memorable !== undefined) opts.memorable = memorable;
  if (pattern !== undefined) opts.pattern = pattern;
  if (prefix !== undefined) opts.prefix = prefix;
  return generatePasswordWithOptions(opts);
};

/**
 * Generates a password using the provided options.
 *
 * @description
 * Validates inputs, selects one of passphrase, memorable, or pattern generation mode, enforces a minimum entropy
 * recommendation unless overridden, then returns the generated string. When `entropy` is supplied, randomness is
 * derived deterministically from the seed for reproducible output.
 *
 * On invalid input, throws a {@link RangeError} or {@link TypeError}. When estimated entropy is below 64 bits and
 * security recommendations are enabled, throws an {@link Error} describing the recommended length, word count, or
 * pattern change.
 *
 * @async
 * @function generatePasswordWithOptions
 * @param {GenerateOptions} [options] - Generation options; omitted fields use secure defaults.
 * @returns {Promise<string>} The generated password or passphrase.
 *
 * @remarks
 * - Passphrase mode (`words`) produces space-separated memorable words (3–7 letters each).
 * - Memorable mode alternates consonants and vowels after an optional prefix.
 * - Pattern mode samples from printable characters matching `pattern` per character and injects a symbol when none are present.
 * - `words` and `prefix` cannot be used together.
 * - Supply `entropy` for deterministic output in tests.
 */
export const generatePasswordWithOptions = async (options?: GenerateOptions): Promise<string> => {
  const length = options?.length ?? DEFAULT_LENGTH;
  const memorable = options?.memorable ?? false;
  const pattern = options?.pattern ?? DEFAULT_PATTERN;
  const prefix = String(options?.prefix ?? '');
  const ignoreSecurityRecommendations = options?.ignoreSecurityRecommendations ?? false;
  const entropy = options?.entropy;
  const words = options?.words;

  if (!Number.isSafeInteger(length)) {
    throw new RangeError('length must be a safe integer');
  }
  if (length < 0) {
    throw new RangeError('length must be a non-negative integer');
  }
  if (!(pattern instanceof RegExp)) {
    throw new TypeError('pattern must be a RegExp');
  }
  if (words !== undefined) {
    if (!Number.isSafeInteger(words)) {
      throw new RangeError('words must be a safe integer');
    }
    if (words <= 0) {
      throw new RangeError('words must be a positive integer');
    }
  }
  if (words !== undefined && prefix !== '') {
    throw new Error('prefix is not supported when words are enabled');
  }

  let entropyBytes: Uint8Array | undefined;
  if (entropy !== undefined) {
    if (typeof entropy === 'string') {
      entropyBytes = textEncoder.encode(entropy);
    } else if (entropy instanceof Uint8Array) {
      entropyBytes = entropy;
    } else {
      throw new TypeError('entropy must be a Uint8Array or string');
    }
  }

  const randomBytes = entropyBytes
    ? await createDeterministicRandomBytes(entropyBytes)
    : getRandomBytes;
  const nextInt = (min: number, max: number) => randomInt(min, max, randomBytes);

  // Passphrase mode
  if (words !== undefined) {
    if (!ignoreSecurityRecommendations && words * MAX_WORD_LENGTH < MIN_MEMORABLE_LENGTH) {
      const recommendedWords = Math.ceil(MIN_MEMORABLE_LENGTH / MAX_WORD_LENGTH);
      throw new Error(
        `Security recommendation: word count ${words} cannot reach ${MIN_ENTROPY_BITS} bits with ${MIN_WORD_LENGTH}-${MAX_WORD_LENGTH} letter words. Use words >= ${recommendedWords}. To override, pass { ignoreSecurityRecommendations: true }.`,
      );
    }

    const targetLength = ignoreSecurityRecommendations ? undefined : MIN_MEMORABLE_LENGTH;
    const lengths = await buildWordLengths(words, nextInt, targetLength);
    const wordsList: string[] = [];
    for (const wordLength of lengths) {
      wordsList.push(await buildMemorable(wordLength, false, nextInt));
    }
    return wordsList.join(' ');
  }

  // Memorable mode: direct alphabet indexing
  if (memorable) {
    if (!ignoreSecurityRecommendations) {
      const estimate = estimateMemorableEntropy(length, prefix);
      if (estimate.entropyBits < MIN_ENTROPY_BITS) {
        throw new Error(
          `Security recommendation: estimated entropy ${estimate.entropyBits.toFixed(1)} bits is below ${MIN_ENTROPY_BITS} bits. Use length >= ${estimate.recommendedLength} or set memorable: false. To override, pass { ignoreSecurityRecommendations: true }.`,
        );
      }
    }
    const charCount = Math.max(0, length - prefix.length);
    return prefix + (await buildMemorable(charCount, CONSONANT.test(prefix), nextInt));
  }

  // Pattern mode
  const validChars = buildValidChars(pattern);
  if (!ignoreSecurityRecommendations) {
    const estimate = estimatePatternEntropy(validChars.length, length, prefix.length);
    if (estimate.entropyBits < MIN_ENTROPY_BITS) {
      const recommendation =
        estimate.recommendedLength === null
          ? 'Use a broader pattern to increase the character set.'
          : `Use length >= ${estimate.recommendedLength} or broaden the pattern.`;
      throw new Error(
        `Security recommendation: estimated entropy ${estimate.entropyBits.toFixed(1)} bits is below ${MIN_ENTROPY_BITS} bits. ${recommendation} To override, pass { ignoreSecurityRecommendations: true }.`,
      );
    }
  }

  let result = prefix;
  while (result.length < length) {
    result += validChars[await nextInt(0, validChars.length)];
  }
  return ensureSymbols(result, validChars, prefix.length, nextInt);
};

/**
 * Options for {@link generatePasswordWithOptions}.
 *
 * @description
 * Controls password length, generation mode, entropy source, and security recommendation enforcement. Unspecified
 * fields use defaults: `length` 12, `memorable` false, `pattern` including letters, digits, and symbols, `prefix` empty
 * string, and security
 * recommendations enabled.
 *
 * @remarks
 * - `length` — Total output length for memorable and pattern modes; ignored as a direct cap in passphrase mode.
 * - `memorable` — Enables alternating vowel/consonant generation when `words` is not set.
 * - `pattern` — Per-character `RegExp` filter for pattern mode; must match individual characters.
 * - `prefix` — Fixed leading characters excluded from random generation; not supported with `words`.
 * - `ignoreSecurityRecommendations` — When true, skips the 64-bit minimum entropy check.
 * - `entropy` — Seed as a string or {@link Uint8Array} for deterministic generation via HMAC expansion.
 * - `words` — When set, enables passphrase mode with the given number of memorable words.
 */
export type GenerateOptions = {
  length?: number;
  memorable?: boolean;
  pattern?: RegExp;
  prefix?: string;
  ignoreSecurityRecommendations?: boolean;
  entropy?: Uint8Array | string;
  words?: number;
};
