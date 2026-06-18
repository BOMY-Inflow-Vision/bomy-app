import { createConnection } from "node:net"

interface Endpoint {
  host: string
  port: number
}

export async function checkPostgres(): Promise<void> {
  const { host, port } = resolvePostgresEndpoint(process.env)
  await tcpProbe(host, port, 2000)
}

export async function checkRedis(): Promise<void> {
  const { host, port } = resolveRedisEndpoint(process.env)
  await tcpProbe(host, port, 2000)
}

export function resolvePostgresEndpoint(env: NodeJS.ProcessEnv): Endpoint {
  const url = env["DATABASE_APP_URL"] ?? env["DATABASE_URL"]
  if (url) return endpointFromUrl(url, 5432)

  return {
    host: env["POSTGRES_HOST"] ?? "localhost",
    port: parsePort(env["POSTGRES_PORT"], 5432),
  }
}

export function resolveRedisEndpoint(env: NodeJS.ProcessEnv): Endpoint {
  const url = env["REDIS_URL"]
  if (url) return endpointFromUrl(url, 6379)

  return {
    host: env["REDIS_HOST"] ?? "localhost",
    port: parsePort(env["REDIS_PORT"], 6379),
  }
}

function endpointFromUrl(rawUrl: string, defaultPort: number): Endpoint {
  const url = new URL(rawUrl)
  return {
    host: url.hostname,
    port: parsePort(url.port, defaultPort),
  }
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const port = parseInt(value, 10)
  return Number.isFinite(port) ? port : fallback
}

function tcpProbe(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`TCP probe timed out after ${timeoutMs}ms — ${host}:${port}`))
    }, timeoutMs)

    socket.once("connect", () => {
      clearTimeout(timer)
      socket.destroy()
      resolve()
    })

    socket.once("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}
