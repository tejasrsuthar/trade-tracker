import { Kafka, Consumer } from 'kafkajs';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import retry from 'async-retry';
import dotenv from 'dotenv';
dotenv.config();

import { createLiveTrade, updateLiveTrade, deleteLiveTrade, closeLiveTrade } from './db.service';
import { LiveTrade } from '../types';

/**
 * Kafka instance configured with broker from environment variables or default value
 */
const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'kafka:9092'] });

/**
 * Kafka consumer instance configured with trade-group consumer group
 */
const consumer: Consumer = kafka.consumer({ groupId: 'trade-group' });

/**
 * Starts the Kafka consumer to process trade events
 * 
 * @async
 * @function startConsumer
 * @returns {Promise<void>} A promise that resolves when the consumer is running
 * @throws {Error} If connection or message processing fails after retries
 */
export const startConsumer = async () => {
  /**
   * Connect to Kafka and subscribe to trade-events topic with retry logic
   */
  await retry(
    async () => {
      await consumer.connect();
      await consumer.subscribe({ topic: 'trade-events', fromBeginning: true });
    },
    {
      retries: 5,
      minTimeout: 1000,
      factor: 2,
      onRetry: (err: Error) => console.warn('Retrying consumer connect/subscribe:', err.message),
    }
  );

  await consumer.run({
    /**
     * Process each incoming Kafka message
     * 
     * @async
     * @param {Object} params - Message parameters
     * @param {Object} params.message - The Kafka message
     * @returns {Promise<void>} A promise that resolves when message processing is complete
     */
    eachMessage: async ({ message }) => {
      const tracer = trace.getTracer('kafka-consumer');
      const data = JSON.parse(message.value?.toString() || '{}');

      const span = tracer.startSpan(`kafka_consume_${data.event}`);
      try {
        /**
         * Process the trade event with retry logic
         * Handles different event types: TradeCreated, TradeUpdated, TradeDeleted, TradeClosed
         */
        await retry(
          async () => {
            switch (data.event) {
              case 'TradeCreated':
                await createLiveTrade(data.trade as LiveTrade);
                break;
              case 'TradeUpdated':
                await updateLiveTrade(data.trade.id, data.trade as Partial<LiveTrade>);
                break;
              case 'TradeDeleted':
                await deleteLiveTrade(data.trade.id);
                break;
              case 'TradeClosed':
                await closeLiveTrade(data.trade.id, data.trade.exitPrice, data.trade.fees);
                break;
            }
          },
          {
            retries: 3,
            minTimeout: 500,
            factor: 2,
            onRetry: (err: Error) => console.warn(`Retrying ${data.event} operation:`, err.message),
          }
        );
        /**
         * Set span status to OK when processing succeeds
         */
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        /**
         * Set span status to ERROR with error message when processing fails
         * Then rethrow the error for upstream handling
         */
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        /**
         * End the span regardless of success or failure
         */
        span.end();
      }
    },
  });
};
