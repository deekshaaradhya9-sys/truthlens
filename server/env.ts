import 'dotenv/config';
import crypto from 'node:crypto';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  GEMINI_API_KEY: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  APP_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const isProd = parsed.data.NODE_ENV === 'production';

let resolvedSessionSecret = parsed.data.SESSION_SECRET?.trim() ?? '';
if (isProd && resolvedSessionSecret.length < 32) {
  console.error('FATAL: SESSION_SECRET must be set (min 32 chars) in production.');
  process.exit(1);
}

if (!resolvedSessionSecret) {
  resolvedSessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[security] SESSION_SECRET not set in environment; generated ephemeral runtime secret.');
}

if (!parsed.data.GEMINI_API_KEY || parsed.data.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
  console.warn('[ai] GEMINI_API_KEY is not configured; Gemini multimodal endpoints will report unavailable.');
}

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  isProd,
  port: parsed.data.PORT,
  geminiApiKey:
    parsed.data.GEMINI_API_KEY && parsed.data.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ? parsed.data.GEMINI_API_KEY.trim()
      : '',
  sessionSecret: resolvedSessionSecret,
  appUrl: parsed.data.APP_URL ?? '',
} as const;
