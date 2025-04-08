/**
 * Kafka Consumer Entry Point
 * Initializes telemetry and starts the Kafka consumer service
 * @module consumer
 */
import { startConsumer } from './services/kafka.consumer';
import { initTelemetry } from './services/telemetry.service';

// Initialize OpenTelemetry for monitoring and tracing
initTelemetry();

// Start the Kafka consumer and log when ready
startConsumer().then(() => console.log('Kafka consumer started'));