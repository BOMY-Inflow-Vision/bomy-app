import { startTelemetry, stopTelemetry } from "./otel/index.js"
import { createApp } from "./server.js"

startTelemetry()

const app = await createApp()

const port = parseInt(process.env["PORT"] ?? "3001", 10)
const host = process.env["HOST"] ?? "0.0.0.0"

try {
  await app.listen({ port, host })
} catch (err) {
  app.log.error(err)
  await stopTelemetry()
  process.exit(1)
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app
      .close()
      .then(stopTelemetry)
      .catch((err: unknown) => app.log.error(err))
  })
}
