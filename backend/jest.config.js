module.exports = {
  // Specifies that we're using ts-jest as our test runner
  preset: "ts-jest",

  // Sets the test environment to Node.js (since this is a backend project)
  testEnvironment: "node",

  // Specifies that our source code is in the 'src' directory
  roots: ["<rootDir>/src"],

  // Tells Jest to look for test files in any __tests__ directory
  // and match files ending with .test.ts
  testMatch: ["**/__tests__/**/*.test.ts"],

  // Configures how Jest should transform TypeScript files
  transform: {
    // This regex matches any .ts or .tsx files
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        // Points to our TypeScript configuration file
        tsconfig: "tsconfig.json",
      },
    ],
  },

  // Specifies which file extensions Jest should look for
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],

  // Enables code coverage reporting
  collectCoverage: true,

  // Specifies where to output coverage reports
  coverageDirectory: "coverage",

  // Specifies which coverage reporters to use
  // 'text' outputs to console, 'lcov' generates HTML reports
  coverageReporters: ["text", "lcov"],

  // Tells Jest to ignore these paths when calculating coverage
  coveragePathIgnorePatterns: ["/node_modules/", "/__tests__/"],

  // Specifies files to run before each test file
  // In this case, it runs our setup.ts file which contains global mocks
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
};
