import { createConnection } from "node:net"

export async function checkPostgres(): Promise<void> {
  const host = process.env["POSTGRES_HOST"] ?? "localhost"
  const port = parseInt(process.env["POSTGRES_PORT"] ?? "5432", 10)
  await tcpProbe(host, port, 2000)
}

export async function checkRedis(): Promise<void> {
  const host = process.env["REDIS_HOST"] ?? "localhost"
  const port = parseInt(process.env["REDIS_PORT"] ?? "6379", 10)
  await tcpProbe(host, port, 2000)
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
