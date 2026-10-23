export type ErrorCode =
  | 'bad_request'
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'email_not_verified'
  | 'not_found'
  | 'conflict'
  | 'unprocessable'
  | 'rate_limited'
  | 'internal'

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown }
}
