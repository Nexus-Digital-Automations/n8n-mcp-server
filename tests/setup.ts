// Test setup file - runs before all tests
import '@testing-library/jest-dom';

// Mock console methods to reduce noise in tests
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  // Reset console mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up any test artifacts
  jest.clearAllTimers();
});

// Global test utilities
global.testUtils = {
  // Create a mock n8n client
  createMockClient: () => ({
    getWorkflows: jest.fn(),
    getWorkflow: jest.fn(),
    createWorkflow: jest.fn(),
    updateWorkflow: jest.fn(),
    deleteWorkflow: jest.fn(),
    activateWorkflow: jest.fn(),
    deactivateWorkflow: jest.fn(),
    getUsers: jest.fn(),
    getUser: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    getProjects: jest.fn(),
    createProject: jest.fn(),
    updateProject: jest.fn(),
    deleteProject: jest.fn(),
    getVariables: jest.fn(),
    createVariable: jest.fn(),
    deleteVariable: jest.fn(),
    getExecutions: jest.fn(),
    getExecution: jest.fn(),
    deleteExecution: jest.fn(),
    getTags: jest.fn(),
    getTag: jest.fn(),
    createTag: jest.fn(),
    updateTag: jest.fn(),
    deleteTag: jest.fn(),
    getWorkflowTags: jest.fn(),
    updateWorkflowTags: jest.fn(),
    getCredentials: jest.fn(),
    getCredential: jest.fn(),
    createCredential: jest.fn(),
    deleteCredential: jest.fn(),
    getCredentialSchema: jest.fn(),
    generateAuditReport: jest.fn(),
  }),

  // Create mock n8n API responses
  createMockApiResponse: <T>(data: T, nextCursor?: string) => ({
    data,
    nextCursor,
  }),

  // Create mock workflow data
  createMockWorkflow: (overrides = {}) => ({
    id: 'workflow-123',
    name: 'Test Workflow',
    active: false,
    nodes: [
      { name: 'Start', type: 'manual' },
      { name: 'End', type: 'set' },
    ],
    connections: {},
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    tags: [],
    ...overrides,
  }),

  // Create mock user data
  createMockUser: (overrides = {}) => ({
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'member',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }),

  // Create mock execution data
  createMockExecution: (overrides = {}) => ({
    id: 'execution-123',
    finished: true,
    mode: 'manual',
    startedAt: '2024-01-01T00:00:00Z',
    stoppedAt: '2024-01-01T00:01:00Z',
    workflowId: 'workflow-123',
    status: 'success' as const,
    ...overrides,
  }),

  // Create mock credential data
  createMockCredential: (overrides = {}) => ({
    id: 'credential-123',
    name: 'Test Credential',
    type: 'httpBasicAuth',
    data: { username: 'test', password: 'pass' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }),

  // Create mock project data
  createMockProject: (overrides = {}) => ({
    id: 'project-123',
    name: 'Test Project',
    type: 'team',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }),

  // Create mock variable data
  createMockVariable: (overrides = {}) => ({
    id: 'variable-123',
    key: 'TEST_VAR',
    value: 'test-value',
    type: 'string',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }),

  // Create mock tag data
  createMockTag: (overrides = {}) => ({
    id: 'tag-123',
    name: 'Test Tag',
    color: '#ff0000',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }),

  // Create mock audit report data
  createMockAuditReport: (overrides = {}) => ({
    riskLevel: 'medium',
    categories: [
      {
        name: 'security',
        score: 75,
        issues: [
          {
            level: 'warning',
            message: 'Some credentials are not encrypted',
            location: 'credentials',
          },
        ],
      },
    ],
    generatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }),

  // Suppress console output in tests
  suppressConsole: () => {
    console.error = jest.fn();
    console.warn = jest.fn();
    console.log = jest.fn();
  },

  // Restore console output
  restoreConsole: () => {
    console.error = originalError;
    console.warn = originalWarn;
  },
};

// Type definitions for test utilities
interface TestUtils {
  createMockClient: () => any;
  createMockApiResponse: <T>(data: T, nextCursor?: string) => { data: T; nextCursor?: string };
  createMockWorkflow: (overrides?: any) => any;
  createMockUser: (overrides?: any) => any;
  createMockExecution: (overrides?: any) => any;
  createMockCredential: (overrides?: any) => any;
  createMockProject: (overrides?: any) => any;
  createMockVariable: (overrides?: any) => any;
  createMockTag: (overrides?: any) => any;
  createMockAuditReport: (overrides?: any) => any;
  suppressConsole: () => void;
  restoreConsole: () => void;
}

// Extend Jest matchers and global types
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidWorkflow(): R;
      toBeValidUser(): R;
      toBeValidExecution(): R;
    }
  }

  namespace NodeJS {
    interface Global {
      testUtils: TestUtils;
    }
  }
}

// Type assertion for global object
declare const global: typeof globalThis & {
  testUtils: TestUtils;
};

// Custom Jest matchers
expect.extend({
  toBeValidWorkflow(received) {
    const pass =
      received &&
      typeof received.id === 'string' &&
      typeof received.name === 'string' &&
      typeof received.active === 'boolean' &&
      Array.isArray(received.nodes);

    return {
      message: () => `expected ${received} to be a valid workflow object`,
      pass,
    };
  },

  toBeValidUser(received) {
    const pass =
      received &&
      typeof received.id === 'string' &&
      typeof received.email === 'string' &&
      typeof received.firstName === 'string' &&
      typeof received.lastName === 'string';

    return {
      message: () => `expected ${received} to be a valid user object`,
      pass,
    };
  },

  toBeValidExecution(received) {
    const pass =
      received &&
      typeof received.id === 'string' &&
      typeof received.workflowId === 'string' &&
      typeof received.finished === 'boolean' &&
      typeof received.startedAt === 'string';

    return {
      message: () => `expected ${received} to be a valid execution object`,
      pass,
    };
  },
});
