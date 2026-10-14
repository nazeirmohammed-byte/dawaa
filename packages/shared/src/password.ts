/** OWASP argon2id baseline. Shared so the API and the seed use the same parameters. */
export const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
