/** An error the HTTP and WebSocket layers both know how to say out loud. */
import type { ErrorCode } from '../../shared/protocol.ts'

export class HttpError extends Error {
  readonly status: number
  readonly code: ErrorCode
  constructor(status: number, code: ErrorCode, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

export const unauthorized = () => new HttpError(401, 'unauthorized', 'Sin autorizar')
export const forbidden = (why: string) => new HttpError(403, 'forbidden', why)
export const notFound = (what = 'No existe') => new HttpError(404, 'not-found', what)
export const conflict = (why: string) => new HttpError(409, 'conflict', why)
export const stale = () => new HttpError(409, 'stale', 'La mesa ha cambiado; vuelve a mirar')
export const badRequest = (why: string) => new HttpError(400, 'bad-request', why)
export const badSheet = (why: string) => new HttpError(422, 'bad-sheet', why)
