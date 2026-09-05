/**
 * A socket that stays up.
 *
 * Reconnects with backoff, says hello again with the last revision it saw so
 * a reconnect that missed nothing costs one small message, pings inside
 * Cloudflare's idle window, and wakes on `visibilitychange` because a phone
 * that went to a pocket dropped the socket without saying so.
 */
import type { ClientHello, ClientMsg, ServerMsg } from '../../../shared/protocol.ts'

export type SocketStatus = 'conectando' | 'conectada' | 'sin-conexion' | 'sin-autorizar' | 'cerrada'

const PING_MS = 30_000
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000]

export class LiveSocket {
  #ws: WebSocket | null = null
  #status: SocketStatus = 'cerrada'
  #attempt = 0
  #retry: ReturnType<typeof setTimeout> | null = null
  #ping: ReturnType<typeof setInterval> | null = null
  #closed = false
  #since: number | undefined

  constructor(
    private readonly url: string,
    private readonly hello: () => ClientHello,
    private readonly onMessage: (msg: ServerMsg) => void,
    private readonly onStatus: (status: SocketStatus) => void,
  ) {}

  get status(): SocketStatus {
    return this.#status
  }

  /** The last revision the owner saw; sent with the next hello. */
  saw(rev: number): void {
    this.#since = rev
  }

  open(): void {
    this.#closed = false
    document.addEventListener('visibilitychange', this.#wake)
    window.addEventListener('online', this.#wake)
    this.#connect()
  }

  close(): void {
    this.#closed = true
    document.removeEventListener('visibilitychange', this.#wake)
    window.removeEventListener('online', this.#wake)
    this.#stopTimers()
    this.#ws?.close()
    this.#ws = null
    this.#set('cerrada')
  }

  /** False when there is no open socket to send on. */
  send(msg: ClientMsg): boolean {
    if (this.#ws?.readyState !== WebSocket.OPEN) return false
    this.#ws.send(JSON.stringify(msg))
    return true
  }

  #set(status: SocketStatus): void {
    if (this.#status === status) return
    this.#status = status
    this.onStatus(status)
  }

  #wake = (): void => {
    if (this.#closed || document.visibilityState === 'hidden') return
    if (this.#ws?.readyState === WebSocket.OPEN) return
    if (this.#retry) clearTimeout(this.#retry)
    this.#retry = null
    this.#attempt = 0
    this.#connect()
  }

  #connect(): void {
    if (this.#closed || this.#status === 'sin-autorizar') return
    this.#set('conectando')
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url)
    } catch {
      this.#scheduleRetry()
      return
    }
    this.#ws = ws
    ws.onopen = () => {
      this.#attempt = 0
      ws.send(JSON.stringify({ ...this.hello(), since: this.#since }))
      this.#ping = setInterval(() => this.send({ type: 'ping' }), PING_MS)
    }
    ws.onmessage = (ev) => {
      let msg: ServerMsg
      try {
        msg = JSON.parse(String(ev.data)) as ServerMsg
      } catch {
        return
      }
      if (msg.type === 'welcome') this.#set('conectada')
      if (msg.type === 'pong') return
      this.onMessage(msg)
    }
    ws.onclose = (ev) => {
      this.#stopTimers()
      if (this.#ws !== ws) return
      this.#ws = null
      if (this.#closed) return
      // 4401 is the server saying the credentials are wrong; no retry fixes that.
      if (ev.code === 4401) {
        this.#set('sin-autorizar')
        return
      }
      this.#set('sin-conexion')
      this.#scheduleRetry()
    }
    ws.onerror = () => {
      /* onclose follows and decides */
    }
  }

  #scheduleRetry(): void {
    if (this.#closed || this.#retry) return
    const delay = BACKOFF_MS[Math.min(this.#attempt, BACKOFF_MS.length - 1)]!
    this.#attempt++
    this.#retry = setTimeout(() => {
      this.#retry = null
      this.#connect()
    }, delay)
  }

  #stopTimers(): void {
    if (this.#ping) clearInterval(this.#ping)
    this.#ping = null
  }
}
