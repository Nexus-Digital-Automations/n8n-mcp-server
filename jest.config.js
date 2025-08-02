/** @type {import('jest').Config} */
export default {
  // Test environment
  testEnvironment: 'node',
  
  // TypeScript support
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  
  // Module resolution and transformation
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'esnext',
        target: 'es2022',
        moduleResolution: 'bundler',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        lib: ['es2022', 'dom'],
        allowImportingTsExtensions: false
      }
    }]
  },
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
    '**/__tests__/**/*.ts',
    '**/*.test.ts',
    '**/*.spec.ts'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/dist/'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  
  // Coverage thresholds - production-ready standards
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // More lenient thresholds for specific directories/files
    './src/auth/': {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    },
    './src/resources/': {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    },
    './src/transport/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './src/tools/': {
      branches: 65,
      functions: 65,
      lines: 65,
      statements: 65
    },
    // Higher thresholds for core production tools
    './src/tools/audit.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/tools/credentials.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/tools/executions.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/tools/projects.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/tools/tags.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/tools/users.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/tools/variables.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/tools/workflow.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    // Lower thresholds for AI/analytics tools (optional features)
    './src/tools/ai-config.ts': {
      branches: 15,
      functions: 15,
      lines: 15,
      statements: 15
    },
    './src/tools/ai-models.ts': {
      branches: 10,
      functions: 10,
      lines: 10,
      statements: 10
    },
    './src/tools/ai-testing.ts': {
      branches: 15,
      functions: 15,
      lines: 15,
      statements: 15
    },
    './src/tools/analytics.ts': {
      branches: 5,
      functions: 5,
      lines: 5,
      statements: 5
    },
    './src/tools/monitoring.ts': {
      branches: 10,
      functions: 10,
      lines: 10,
      statements: 10
    },
    './src/tools/templates.ts': {
      branches: 5,
      functions: 5,
      lines: 5,
      statements: 5
    },
    './src/client/': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },
  
  // Transform ignore patterns for ES modules
  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch|fastmcp|@modelcontextprotocol|zod)/)'
  ],
  
  // Module name mapping - mock ES modules and handle TypeScript .js imports
  moduleNameMapper: {
    '^node-fetch$': '<rootDir>/tests/__mocks__/node-fetch.js',
    '^fastmcp$': '<rootDir>/tests/__mocks__/fastmcp.js',
    '^zod$': '<rootDir>/tests/__mocks__/zod.js',
    // Handle TypeScript .js imports by mapping them to .ts files
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  
  // Additional TypeScript configuration
  modulePathIgnorePatterns: [
    '<rootDir>/node_modules/'
  ],
  
  // Files to include in coverage
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.ts'
  ],
  
  // Test timeout
  testTimeout: 10000,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Verbose output - conditional based on CI environment
  verbose: !process.env.CI,
  
  // Performance optimizations
  maxWorkers: process.env.CI ? 2 : '50%',
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // CI optimizations
  silent: !!process.env.CI,
  
  // Detect open handles
  detectOpenHandles: !process.env.CI,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Fail fast in CI environments
  bail: process.env.CI ? 1 : 0,
  
  // Coverage reporting optimizations
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/coverage/',
    '/tests/',
    '.d.ts$',
    'jest.config.js',
    '.*\\.config\\.(js|ts)$'
  ],
  
  // Reporter configuration for CI
  reporters: process.env.CI ? [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-results',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true
    }]
  ] : ['default'],
  
  // Watch mode optimizations
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/coverage/',
    '/.git/'
  ]
};