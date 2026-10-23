import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface Config {
  env: string
  port: number
  host: string
  mongoUrl: string
  dbName: string
  redisUrl: string
  redisPrefix: string
  smtpHost: string
  smtpPort: number
  mailFrom: string
  appUrl: string
  sessionTtlDays: number
  authRateLimit: number
  /** Directory with the built SPA (served in production), or null. */
  webDist: string | null
  logLevel: string
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  // Works from both src/ and dist/ (one level below apps/api).
  const envFile = resolve(import.meta.dirname, '../../../.env')
  if (existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile)
    } catch {
      /* ignore malformed .env */
    }
  }
  const e = process.env
  const mongoUrl = e.MONGO_URL ?? 'mongodb://localhost:27018/pm?directConnection=true'
  const webDist = resolve(import.meta.dirname, '../../web/dist')
  const config: Config = {
    env: e.NODE_ENV ?? 'development',
    port: Number(e.API_PORT ?? 4000),
    host: e.API_HOST ?? '0.0.0.0',
    mongoUrl,
    dbName: new URL(mongoUrl).pathname.replace(/^\//, '') || 'pm',
    redisUrl: e.REDIS_URL ?? 'redis://localhost:6380',
    redisPrefix: e.REDIS_PREFIX ?? 'pm:',
    smtpHost: e.SMTP_HOST ?? 'localhost',
    smtpPort: Number(e.SMTP_PORT ?? 1026),
    mailFrom: e.MAIL_FROM ?? 'Projects <no-reply@pm.local>',
    appUrl: (e.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
    sessionTtlDays: Number(e.SESSION_TTL_DAYS ?? 30),
    authRateLimit: Number(e.AUTH_RATE_LIMIT ?? 20),
    webDist: existsSync(resolve(webDist, 'index.html')) ? webDist : null,
    logLevel: e.LOG_LEVEL ?? 'info',
  }
  return { ...config, ...overrides }
}
