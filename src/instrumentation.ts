/**
 * OpenTelemetry initialisation via Next.js instrumentation hook.
 *
 * Must live in src/instrumentation.ts — Next.js loads this before any
 * application module, which is required to correctly patch pg, fetch, and
 * HTTP spans. Initialising OTEL inside payload.config.ts is too late:
 * database connections are already open before config runs.
 *
 * Service name: OTEL_SERVICE_NAME (default: kdigi-cms)
 * Service namespace: kdigi
 */
export async function register() {
  // Only run on the Node.js runtime — not in Edge or browser contexts
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { NodeSDK } = await import('@opentelemetry/sdk-node')
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
    const { resourceFromAttributes } = await import('@opentelemetry/resources')
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_NAMESPACE } = await import(
      '@opentelemetry/semantic-conventions'
    )
    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node'
    )

    const serviceName = process.env.OTEL_SERVICE_NAME ?? 'kdigi-cms'

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_NAMESPACE]: 'kdigi',
      }),
      // Only wire up the exporter when an endpoint is configured.
      // In development (no env var) traces are collected but not exported.
      traceExporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        ? new OTLPTraceExporter({
            url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
          })
        : undefined,
      instrumentations: [getNodeAutoInstrumentations()],
    })

    sdk.start()
    console.log(`[OTEL] ${serviceName} telemetry started`)
  }
}
