type OtpRedisClient = {
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: string,
    options?: { EX?: number },
  ) => Promise<unknown>;
};

const RATE_LIMIT_TTL_SECONDS = 60;

export const getOtpKey = (email: string): string => `otp:${email}`;

export const getOtpRateLimitKey = (email: string): string =>
  `otp:ratelimit:${email}`;

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
