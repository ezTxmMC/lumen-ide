/** DAP transport across the preload bridge, `window.lumen.dap`. */

import type { DapTransport } from './client'
import type { DapMessage } from './protocol'

type OutputListener = (stream: 'stderr' | 'stdout', text: string) => void

interface Route {
  message: Set<(message: DapMessage) => void>
  close: Set<(reason: string) => void>
  output: Set<OutputListener>
}

const routes = new Map<string, Route>()
let wired = false
let counter = 0

function wire() {
  if (wired) return
  wired = true
  window.lumen.dap.onMessage(({ id, message }) => {
    for (const cb of routes.get(id)?.message ?? []) cb(message as unknown as DapMessage)
  })
  window.lumen.dap.onOutput(({ id, stream, text }) => {
    for (const cb of routes.get(id)?.output ?? []) cb(stream, text)
  })
  window.lumen.dap.onClosed(({ id, reason }) => {
    const route = routes.get(id)
    routes.delete(id)
    for (const cb of route?.close ?? []) cb(reason)
  })
}

export interface IpcTransport extends DapTransport {
  id: string
  onOutput(cb: OutputListener): () => void
}

/** Sets up the route before the adapter starts, so no early message is lost. */
export function createIpcTransport(): IpcTransport {
  wire()
  const id = `dap-${Date.now().toString(36)}-${++counter}`
  const route: Route = { message: new Set(), close: new Set(), output: new Set() }
  routes.set(id, route)
  return {
    id,
    send: (message) => {
      void window.lumen.dap.send(id, message).then((ok) => {
        if (ok) return
        const current = routes.get(id)
        routes.delete(id)
        for (const cb of current?.close ?? []) cb('Adapter nicht erreichbar')
      })
    },
    onMessage: (cb) => {
      route.message.add(cb)
      return () => { route.message.delete(cb) }
    },
    onClose: (cb) => {
      route.close.add(cb)
      return () => { route.close.delete(cb) }
    },
    onOutput: (cb) => {
      route.output.add(cb)
      return () => { route.output.delete(cb) }
    },
    close: () => {
      routes.delete(id)
      void window.lumen.dap.stop(id)
    },
  }
}
