// Mock OpenTelemetry
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: jest.fn().mockReturnValue({
      startSpan: jest.fn().mockReturnValue({
        setStatus: jest.fn(),
        end: jest.fn(),
        recordException: jest.fn()
      })
    })
  },
  SpanStatusCode: {
    OK: 0,
    ERROR: 1
  }
}));

// Global test setup
beforeAll(() => {
  // Setup test environment
});

// Global test teardown
afterAll(() => {
  // Cleanup test environment
}); 