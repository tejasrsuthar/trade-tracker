/**
 * Kafka Producer Service
 * 
 * This module provides functionality to connect to a Kafka broker and send messages
 * to Kafka topics with OpenTelemetry tracing and retry capabilities.
 */
import { Kafka, Producer } from 'kafkajs';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import retry from 'async-retry';
import dotenv from 'dotenv';
import { createLogger } from '../lib/logger';

dotenv.config();

/** Kafka instance configured with broker from environment or default */
const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'kafka:9092'] });
/** Kafka producer instance */
const producer: Producer = kafka.producer();
/** Logger instance for Kafka producer */
const logger = createLogger({ module: 'kafka', component: 'producer' });

/**
 * Connects to the Kafka broker with retry logic
 * 
 * @async
 * @returns {Promise<void>} A promise that resolves when successfully connected
 * @throws {Error} If connection fails after all retries
 */
export const connectProducer = async () => {
  const tracer = trace.getTracer('kafka-producer');
  const span = tracer.startSpan('kafka_producer_connect');

  try {
    await retry(
      async () => {
        await producer.connect();
      },
      {
        retries: 5,
        minTimeout: 1000,
        factor: 2,
        onRetry: (err: Error) => {
          logger.warn({ error: err }, 'Retrying producer connect');
          span.recordException(err);
        },
      }
    );
    span.setStatus({ code: SpanStatusCode.OK });
    logger.info('Successfully connected to Kafka broker');
  } catch (error) {
    const errorMessage = (error as Error).message;
    logger.error({ error }, 'Failed to connect to Kafka broker after all retries');
    span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
    throw error;
  } finally {
    span.end();
  }
};

/**
 * Sends a message to a specified Kafka topic with OpenTelemetry tracing
 * 
 * @async
 * @param {string} topic - The Kafka topic to send the message to
 * @param {any} message - The message payload to be sent (will be JSON stringified)
 * @returns {Promise<void>} A promise that resolves when the message is successfully sent
 * @throws {Error} If sending fails after all retries
 */
export const sendMessage = async (topic: string, message: any) => {
  const tracer = trace.getTracer('kafka-producer');
  const span = tracer.startSpan(`kafka_producer_${topic}`);

  try {
    await retry(
      async () => {
        await producer.send({
          topic,
          messages: [{ value: JSON.stringify(message) }],
        });
      },
      {
        retries: 3,
        minTimeout: 500,
        factor: 2,
        onRetry: (err: Error) => {
          logger.warn({ error: err, topic }, 'Retrying send to topic');
          span.recordException(err);
        },
      }
    );
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    throw error;
  } finally {
    span.end();
  }
};
