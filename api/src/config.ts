import "dotenv/config";

export const isProd = process.env.NODE_ENV === "production";
export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-not-for-production",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  holdMinutes: 5,
};
if (isProd && !process.env.JWT_SECRET) throw new Error("JWT_SECRET is required in production");
