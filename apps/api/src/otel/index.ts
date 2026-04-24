import { NodeSDK } from "@opentelemetry/sdk-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { Resource } from "@opentelemetry/resources"
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions"

let sdk: NodeSDK | undefined

export function startTelemetry() {
  if (process.env["OTEL_ENABLED"] !== "true") return

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: "bomy-api",
      [ATTR_SERVICE_VERSION]: process.env["npm_package_version"] ?? "0.0.1",
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "http://localhost:4318/v1/traces",
    }),
  })

  sdk.start()
}

export async function stopTelemetry() {
  await sdk?.shutdown()
}
