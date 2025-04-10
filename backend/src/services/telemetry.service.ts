/**
 * OpenTelemetry Telemetry Service
 * 
 * This module provides functionality to initialize and configure OpenTelemetry
 * for distributed tracing and metrics collection in the application.
 * 
 * @module services/telemetry
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

/**
 * Jaeger endpoint URL for trace collection
 * Uses OTLP HTTP protocol for sending traces to Jaeger
 * In production, uses the JAEGER_ENDPOINT environment variable if available
 * In development, defaults to localhost:4318
 */
const JAEGER_ENDPOINT = process.env.NODE_ENV === 'production'
  ? process.env.JAEGER_ENDPOINT || 'http://localhost:4318/v1/traces'
  : 'http://localhost:4318/v1/traces';

/**
 * Prometheus port for metrics collection
 * Uses the PROMETHEUS_PORT environment variable if available
 * Defaults to 9464 if not specified
 */
const PROMETHEUS_PORT = process.env.PROMETHEUS_PORT && parseInt(process.env.PROMETHEUS_PORT, 10) || 9464;

/**
 * Initializes the OpenTelemetry SDK for the application.
 * 
 * This function sets up:
 * - Trace exporter for sending traces to Jaeger via OTLP HTTP
 * - Prometheus exporter for metrics collection
 * - Auto-instrumentations for Node.js
 * - Resource attributes for service identification
 * - Sampling configuration based on environment
 * 
 * @returns {NodeSDK|null} The initialized OpenTelemetry SDK instance or null if initialization fails
 * 
 * @example
 * // Initialize telemetry at application startup
 * const sdk = initTelemetry();
 * if (!sdk) {
 *   console.error('Failed to initialize telemetry');
 * }
 */
export const initTelemetry = () => {
  // Use OTLPTraceExporter with the correct endpoint for Jaeger
  const traceExporter = new OTLPTraceExporter({
    url: JAEGER_ENDPOINT,
    // Add headers if needed for authentication
    headers: {}
  });

  const metricReader = new PrometheusExporter({ port: PROMETHEUS_PORT });

  /**
   * Create a new NodeSDK instance with the tracing and metrics exporters, and auto-instrumentations.
   */
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'trade-backend',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
      'deployment.environment': process.env.NODE_ENV || 'development',
    }),
    traceExporter,
    metricReader,
    instrumentations: [getNodeAutoInstrumentations()],
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(
        process.env.NODE_ENV === 'production' ? 0.1 : 1.0
      )
    }),
  });

  let sdkStarted = false;

  try {
    sdk.start();
    sdkStarted = true;
    console.log('Telemetry initialized successfully');
  } catch (error) {
    console.error('Error initializing telemetry', error);
    // Don't return the SDK if it failed to start
    return null;
  }

  /**
   * Gracefully shuts down the telemetry SDK when the process is terminated.
   * Ensures all pending telemetry data is flushed before exiting.
   */
  const shutdown = () => {
    if (sdkStarted) {
      sdk.shutdown()
        .then(() => console.log('Telemetry shut down'))
        .catch((error) => console.error('Error shutting down telemetry', error))
        .finally(() => process.exit(0));
    } else {
      process.exit(0);
    }
  };

  // Handle different termination signals
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGQUIT', shutdown);

  return sdk;
};