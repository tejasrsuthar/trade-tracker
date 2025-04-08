import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';

const JAEGER_ENDPOINT = process.env.JAEGER_ENDPOINT || 'http://jaeger:14268/api/traces';
const PROMETHEUS_PORT = process.env.PROMETHEUS_PORT && parseInt(process.env.PROMETHEUS_PORT, 10) || 9464;

/**
 * Initialize the OpenTelemetry SDK for the application.
 * This function sets up the tracing and metrics exporters, and returns the SDK instance.
 *
 * @returns {NodeSDK} The initialized OpenTelemetry SDK instance.
 */
export const initTelemetry = () => {
  const traceExporter = new OTLPTraceExporter({ url: JAEGER_ENDPOINT });
  const metricReader = new PrometheusExporter({ port: PROMETHEUS_PORT });

  /**
   * Create a new NodeSDK instance with the tracing and metrics exporters, and auto-instrumentations.
   */
  const sdk = new NodeSDK({
    resource: new Resource({ 'service.name': 'trade-backend' }),
    traceExporter,
    metricReader,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  /**
  * Set up a SIGTERM handler to shut down the telemetry SDK when the process is terminated.
  */
  process.on('SIGTERM', () => {
    sdk.shutdown().then(() => console.log('Telemetry shut down')).catch((error) => console.error('Error shutting down telemetry', error)).finally(() => process.exit(0));
  });

  return sdk;
};