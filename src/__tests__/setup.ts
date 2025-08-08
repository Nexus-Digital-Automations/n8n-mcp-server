// Jest test setup for MCP conversion utilities
import { jest } from '@jest/globals';

// Mock node-fetch for HTTP testing
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Global test timeout
jest.setTimeout(10000);

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};