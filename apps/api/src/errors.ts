import type { ErrorCode } from '@pm/shared'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export const badRequest = (m: string, d?: unknown) => new HttpError(400, 'bad_request', m, d)
export const unauthorized = (m = 'Authentication required') => new HttpError(401, 'unauthorized', m)
export const forbidden = (m = 'Not allowed') => new HttpError(403, 'forbidden', m)
export const emailNotVerified = () => new HttpError(403, 'email_not_verified', 'Verify your email address first')
export const notFound = (m = 'Not found') => new HttpError(404, 'not_found', m)
export const conflict = (m: string, d?: unknown) => new HttpError(409, 'conflict', m, d)
export const unprocessable = (m: string, d?: unknown) => new HttpError(422, 'unprocessable', m, d)

export function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}
