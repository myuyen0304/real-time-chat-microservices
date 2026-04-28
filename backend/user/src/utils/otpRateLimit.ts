type OtpRedisClient = {
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: string,
    options?: { EX?: number },
  ) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
};

const RATE_LIMIT_TTL_SECONDS = 60;
const VERIFY_ATTEMPT_TTL_SECONDS = 300;
const MAX_VERIFY_ATTEMPTS = 5;

export const getOtpKey = (email: string): string => `otp:${email}`;

export const getOtpRateLimitKey = (email: string): string =>
  `otp:ratelimit:${email}`;

export const getOtpVerifyAttemptsKey = (email: string): string =>
  `otp:verify:attempts:${email}`;

export const hasOtpRateLimit = async (
  client: OtpRedisClient,
  email: string,
): Promise<boolean> => {
  const rateLimit = await client.get(getOtpRateLimitKey(email));
  return Boolean(rateLimit);
};

export const setOtpRateLimit = async (
  client: OtpRedisClient,
  email: string,
): Promise<void> => {
  await client.set(getOtpRateLimitKey(email), "true", {
    EX: RATE_LIMIT_TTL_SECONDS,
  });
};

export const hasExceededOtpVerifyAttempts = async (
  client: OtpRedisClient,
  email: string,
): Promise<boolean> => {
  const attempts = Number.parseInt(
    (await client.get(getOtpVerifyAttemptsKey(email))) ?? "0",
    10,
  );

  return attempts >= MAX_VERIFY_ATTEMPTS;
};

export const recordFailedOtpVerifyAttempt = async (
  client: OtpRedisClient,
  email: string,
): Promise<void> => {
  const attempts = Number.parseInt(
    (await client.get(getOtpVerifyAttemptsKey(email))) ?? "0",
    10,
  );

  await client.set(getOtpVerifyAttemptsKey(email), String(attempts + 1), {
    EX: VERIFY_ATTEMPT_TTL_SECONDS,
  });
};

export const clearOtpVerifyAttempts = async (
  client: OtpRedisClient,
  email: string,
): Promise<void> => {
  await client.del(getOtpVerifyAttemptsKey(email));
};
