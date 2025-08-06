/* eslint-disable no-undef */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock all dependencies before any imports
jest.mock('fastmcp', () => ({
  FastMCP: jest.fn().mockImplementation(() => ({
    addTool: jest.fn().mockReturnThis(),
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as void),
    on: jest.fn().mockReturnThis(),
  })),
}));

// Using global Zod mock from tests/__mocks__/zod.js

jest.mock('../../src/client/n8nClient.js', () => ({
  N8nClient: jest.fn(),
}));

jest.mock('../../src/tools/workflow.js', () => ({
  createWorkflowTools: jest.fn(),
}));

jest.mock('../../src/tools/projects.js', () => ({
  createProjectTools: jest.fn(),
}));

jest.mock('../../src/tools/users.js', () => ({
  createUserTools: jest.fn(),
}));

jest.mock('../../src/tools/variables.js', () => ({
  createVariableTools: jest.fn(),
}));

jest.mock('../../src/tools/executions.js', () => ({
  createExecutionTools: jest.fn(),
}));

jest.mock('../../src/tools/tags.js', () => ({
  createTagTools: jest.fn(),
}));

jest.mock('../../src/tools/credentials.js', () => ({
  createCredentialTools: jest.fn(),
}));

jest.mock('../../src/tools/audit.js', () => ({
  createAuditTools: jest.fn(),
}));

jest.mock('../../src/transport/transportConfig.js', () => ({
  detectTransportConfig: jest.fn(),
  validateTransportConfig: jest.fn(),
  getServerUrl: jest.fn(),
}));

jest.mock('../../src/transport/sseTransport.js', () => ({
  createSSETransport: jest.fn(),
  SSEUtils: {
    validateConfig: jest.fn(),
  },
}));

// Mock process methods
const originalProcessExit = process.exit;
const originalProcessOn = process.on;

describe('src/index-fastmcp.ts - FastMCP Server Entry Point', () => {
  let mockFastMCP: any;
  let mockN8nClient: any;
  let mockConsoleLog: any;
  let mockConsoleError: any;

  beforeEach(() => {
    // Mock console methods
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process methods
    process.exit = jest.fn() as any;
    process.on = jest.fn() as any;

    // Reset all mocks
    jest.clearAllMocks();

    // Get mock instances
    const { FastMCP } = require('fastmcp');
    const { N8nClient } = require('../../src/client/n8nClient.js');

    mockFastMCP = {
      addTool: jest.fn().mockReturnThis(),
      start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as void),
      on: jest.fn().mockReturnThis(),
    };
    FastMCP.mockImplementation(() => mockFastMCP);

    mockN8nClient = {
      getWorkflows: jest.fn<() => Promise<{ data: any[] }>>().mockResolvedValue({ data: [] }),
    };
    N8nClient.mockImplementation(() => mockN8nClient);

    // Set up default mock behaviors
    const transportConfig = require('../../src/transport/transportConfig.js');
    const sseTransport = require('../../src/transport/sseTransport.js');

    transportConfig.detectTransportConfig.mockReturnValue({ type: 'stdio' });
    transportConfig.validateTransportConfig.mockReturnValue({ type: 'stdio' });
    transportConfig.getServerUrl.mockReturnValue(null);

    sseTransport.createSSETransport.mockReturnValue({
      start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as void),
      stop: jest.fn(),
    });
    sseTransport.SSEUtils.validateConfig.mockReturnValue(true);
  });

  afterEach(() => {
    // Restore original functions
    process.exit = originalProcessExit;
    process.on = originalProcessOn;
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();

    // Clear module cache to ensure fresh imports
    jest.resetModules();
  });

  describe('FastMCP Server Initialization', () => {
    it('should create FastMCP instance with correct configuration', async () => {
      const { FastMCP } = require('fastmcp');

      // Import the module to trigger initialization
      await import('../../src/index-fastmcp.js');

      expect(FastMCP).toHaveBeenCalledWith({
        name: 'n8n-mcp-server',
        version: '2.0.0',
        instructions: expect.stringContaining(
          'This server provides comprehensive access to n8n workflows'
        ),
      });
    });

    it('should include comprehensive instructions in FastMCP config', async () => {
      const { FastMCP } = require('fastmcp');

      await import('../../src/index-fastmcp.js');

      const config = FastMCP.mock.calls[0][0];
      expect(config.instructions).toContain('Key Features:');
      expect(config.instructions).toContain('Complete workflow management');
      expect(config.instructions).toContain('User and project management');
      expect(config.instructions).toContain('Execution monitoring');
      expect(config.instructions).toContain('Getting Started:');
      expect(config.instructions).toContain('init-n8n');
    });
  });

  describe('Tool Registration', () => {
    it('should register all tool categories', async () => {
      const toolMocks = {
        createWorkflowTools: require('../../src/tools/workflow.js').createWorkflowTools,
        createProjectTools: require('../../src/tools/projects.js').createProjectTools,
        createUserTools: require('../../src/tools/users.js').createUserTools,
        createVariableTools: require('../../src/tools/variables.js').createVariableTools,
        createExecutionTools: require('../../src/tools/executions.js').createExecutionTools,
        createTagTools: require('../../src/tools/tags.js').createTagTools,
        createCredentialTools: require('../../src/tools/credentials.js').createCredentialTools,
        createAuditTools: require('../../src/tools/audit.js').createAuditTools,
      };

      await import('../../src/index-fastmcp.js');

      Object.values(toolMocks).forEach(mock => {
        expect(mock).toHaveBeenCalledWith(expect.any(Function), mockFastMCP);
      });
    });

    it('should pass client getter function to all tool creators', async () => {
      const { createWorkflowTools } = require('../../src/tools/workflow.js');

      await import('../../src/index-fastmcp.js');

      // Get the client getter function that was passed
      const clientGetter = createWorkflowTools.mock.calls[0][0];
      expect(typeof clientGetter).toBe('function');

      // Initially should return null (no client set)
      expect(clientGetter()).toBeNull();
    });
  });

  describe('Custom Tools Registration', () => {
    it('should register init-n8n tool', async () => {
      await import('../../src/index-fastmcp.js');

      const initToolCalls = mockFastMCP.addTool.mock.calls.filter(
        (call: any) => call[0].name === 'init-n8n'
      );

      expect(initToolCalls).toHaveLength(1);

      const initTool = initToolCalls[0][0];
      expect(initTool).toHaveProperty('name', 'init-n8n');
      expect(initTool).toHaveProperty('description');
      expect(initTool).toHaveProperty('parameters');
      expect(initTool).toHaveProperty('execute');
      expect(initTool).toHaveProperty('annotations');
    });

    it('should register status tool', async () => {
      await import('../../src/index-fastmcp.js');

      const statusToolCalls = mockFastMCP.addTool.mock.calls.filter(
        (call: any) => call[0].name === 'status'
      );

      expect(statusToolCalls).toHaveLength(1);

      const statusTool = statusToolCalls[0][0];
      expect(statusTool).toHaveProperty('name', 'status');
      expect(statusTool).toHaveProperty('description');
      expect(statusTool).toHaveProperty('parameters');
      expect(statusTool).toHaveProperty('execute');
      expect(statusTool).toHaveProperty('annotations');
    });

    it('should configure init-n8n tool with proper annotations', async () => {
      await import('../../src/index-fastmcp.js');

      const initTool = mockFastMCP.addTool.mock.calls.find(
        (call: any) => call[0].name === 'init-n8n'
      )?.[0];

      expect(initTool).toBeDefined();
      if (initTool) {
        expect(initTool.annotations).toEqual({
          title: 'Initialize n8n Connection',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        });
      }
    });

    it('should configure status tool with proper annotations', async () => {
      await import('../../src/index-fastmcp.js');

      const statusTool = mockFastMCP.addTool.mock.calls.find(
        (call: any) => call[0].name === 'status'
      )?.[0];

      expect(statusTool).toBeDefined();
      if (statusTool) {
        expect(statusTool.annotations).toEqual({
          title: 'Check n8n Connection Status',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        });
      }
    });
  });

  describe('init-n8n Tool Execution', () => {
    it('should successfully initialize n8n connection', async () => {
      await import('../../src/index-fastmcp.js');

      const initTool = mockFastMCP.addTool.mock.calls.find(
        (call: any) => call[0].name === 'init-n8n'
      )?.[0];

      const args = {
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-api-key',
      };

      const result = await initTool.execute(args);

      expect(result).toBe('✅ Successfully connected to n8n instance at http://localhost:5678');
      expect(mockN8nClient.getWorkflows).toHaveBeenCalledWith({ limit: 1 });
    });

    it('should handle connection errors gracefully', async () => {
      mockN8nClient.getWorkflows.mockRejectedValueOnce(new Error('Connection failed'));

      await import('../../src/index-fastmcp.js');

      const initTool = mockFastMCP.addTool.mock.calls.find(
        (call: any) => call[0].name === 'init-n8n'
      )?.[0];

      const args = {
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-api-key',
      };

      await expect(initTool.execute(args)).rejects.toThrow(
        'Failed to connect to n8n: Connection failed'
      );
    });

    it('should handle unknown connection errors', async () => {
      mockN8nClient.getWorkflows.mockRejectedValueOnce('Unknown error');

      await import('../../src/index-fastmcp.js');

      const initTool = mockFastMCP.addTool.mock.calls.find(
        (call: any) => call[0].name === 'init-n8n'
      )?.[0];

      const args = {
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-api-key',
      };

      await expect(initTool.execute(args)).rejects.toThrow(
        'Failed to connect to n8n with unknown error'
      );
    });
  });

  describe('status Tool Execution', () => {
    it('should return not connected message when no client is set', async () => {
      await import('../../src/index-fastmcp.js');

      const statusTool = mockFastMCP.addTool.mock.calls.find(
        (call: any) => call[0].name === 'status'
      )?.[0];

      const result = await statusTool.execute();

      expect(result).toBe("❌ Not connected to n8n. Please run 'init-n8n' first.");
    });

    it('should return connected status when client is working', async () => {
      await import('../../src/index-fastmcp.js');

      // First initialize a client
      const initTool = mockFastMCP.addTool.mock.calls.find(
        (call: any) => call[0].name === 'init-n8n'
      )?.[0];

      await initTool.execute({
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-api-key',
      });

      // Now check status
      const statusTool = mockFastMCP.addTool.mock.calls.find(
        (call: any) => call[0].name === 'status'
      )?.[0];

      const result = await statusTool.execute();

      expect(result).toBe('✅ Connected to n8n and ready to use.');
    });

    it('should return connection error when client fails', async () => {
      await import('../../src/index-fastmcp.js');

      // Initialize a client first
      const initTool = mockFastMCP.addTool.mock.calls.find(
        (call: any) => call[0].name === 'init-n8n'
      )?.[0];

      await initTool.execute({
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-api-key',
      });

      // Make subsequent calls fail
      mockN8nClient.getWorkflows.mockRejectedValueOnce(new Error('API Error'));

      const statusTool = mockFastMCP.addTool.mock.calls.find(
        (call: any) => call[0].name === 'status'
      )?.[0];

      const result = await statusTool.execute();

      expect(result).toBe('⚠️ Connected but unable to communicate with n8n: API Error');
    });
  });

  describe('Server Startup with stdio Transport', () => {
    it('should start server with stdio transport', async () => {
      const {
        detectTransportConfig,
        validateTransportConfig,
      } = require('../../src/transport/transportConfig.js');

      detectTransportConfig.mockReturnValue({ type: 'stdio' });
      validateTransportConfig.mockReturnValue({ type: 'stdio' });

      await import('../../src/index-fastmcp.js');

      // Wait for async operations to complete
      await new Promise(resolve => setImmediate(resolve));

      // For stdio transport, all logging goes to stderr (console.error) to avoid corrupting JSON-RPC communication
      expect(mockConsoleError).toHaveBeenCalledWith('🚀 Starting n8n MCP Server...');
      expect(mockConsoleError).toHaveBeenCalledWith('📡 Transport type: stdio');
      expect(mockFastMCP.start).toHaveBeenCalledWith({ transportType: 'stdio' });
      expect(mockConsoleError).toHaveBeenCalledWith('📟 Server started with stdio transport');
      expect(mockConsoleError).toHaveBeenCalledWith('✅ n8n MCP Server is ready!');
    });

    it('should call transport detection and validation', async () => {
      const {
        detectTransportConfig,
        validateTransportConfig,
      } = require('../../src/transport/transportConfig.js');

      await import('../../src/index-fastmcp.js');

      await new Promise(resolve => setImmediate(resolve));

      expect(detectTransportConfig).toHaveBeenCalled();
      expect(validateTransportConfig).toHaveBeenCalled();
    });
  });

  describe('Server Startup with SSE Transport', () => {
    it('should start server with SSE transport', async () => {
      const {
        detectTransportConfig,
        validateTransportConfig,
        getServerUrl,
      } = require('../../src/transport/transportConfig.js');
      const { createSSETransport, SSEUtils } = require('../../src/transport/sseTransport.js');

      const mockSSETransport = {
        start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as void),
      };

      detectTransportConfig.mockReturnValue({
        type: 'sse',
        port: 3000,
        host: 'localhost',
      });
      validateTransportConfig.mockReturnValue({
        type: 'sse',
        port: 3000,
        host: 'localhost',
      });
      SSEUtils.validateConfig.mockReturnValue(true);
      createSSETransport.mockReturnValue(mockSSETransport);
      getServerUrl.mockReturnValue('http://localhost:3000');

      await import('../../src/index-fastmcp.js');

      await new Promise(resolve => setImmediate(resolve));

      expect(mockConsoleLog).toHaveBeenCalledWith('🚀 Starting n8n MCP Server...');
      expect(mockConsoleLog).toHaveBeenCalledWith('📡 Transport type: sse');
      expect(SSEUtils.validateConfig).toHaveBeenCalled();
      expect(createSSETransport).toHaveBeenCalledWith(mockFastMCP, {
        type: 'sse',
        port: 3000,
        host: 'localhost',
      });
      expect(mockSSETransport.start).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('🌐 Server URL: http://localhost:3000');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ n8n MCP Server is ready!');
    });

    it('should handle invalid SSE configuration', async () => {
      const {
        detectTransportConfig,
        validateTransportConfig,
      } = require('../../src/transport/transportConfig.js');
      const { SSEUtils } = require('../../src/transport/sseTransport.js');

      detectTransportConfig.mockReturnValue({ type: 'sse', port: 3000 });
      validateTransportConfig.mockReturnValue({ type: 'sse', port: 3000 });
      SSEUtils.validateConfig.mockReturnValue(false);

      await import('../../src/index-fastmcp.js');

      await new Promise(resolve => setImmediate(resolve));

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Invalid SSE configuration');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('Server Startup Error Handling', () => {
    it('should handle server startup errors', async () => {
      mockFastMCP.start.mockRejectedValueOnce(new Error('Server startup failed'));

      await import('../../src/index-fastmcp.js');

      await new Promise(resolve => setImmediate(resolve));

      expect(mockConsoleError).toHaveBeenCalledWith(
        '❌ Failed to start server:',
        expect.any(Error)
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('Process Signal Handling', () => {
    it('should register SIGINT and SIGTERM handlers', async () => {
      await import('../../src/index-fastmcp.js');

      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should handle SIGINT gracefully', async () => {
      await import('../../src/index-fastmcp.js');

      const sigintCall = (process.on as jest.Mock).mock.calls.find(call => call[0] === 'SIGINT');

      if (sigintCall) {
        const sigintHandler = sigintCall[1] as () => void;
        sigintHandler();

        expect(mockConsoleError).toHaveBeenCalledWith(
          'Received SIGINT, shutting down gracefully...'
        );
        expect(process.exit).toHaveBeenCalledWith(0);
      }
    });

    it('should handle SIGTERM gracefully', async () => {
      await import('../../src/index-fastmcp.js');

      const sigtermCall = (process.on as jest.Mock).mock.calls.find(call => call[0] === 'SIGTERM');

      if (sigtermCall) {
        const sigtermHandler = sigtermCall[1] as () => void;
        sigtermHandler();

        expect(mockConsoleError).toHaveBeenCalledWith(
          'Received SIGTERM, shutting down gracefully...'
        );
        expect(process.exit).toHaveBeenCalledWith(0);
      }
    });
  });

  describe('Global Client State Management', () => {
    it('should start with null client', async () => {
      const { createWorkflowTools } = require('../../src/tools/workflow.js');

      await import('../../src/index-fastmcp.js');

      const clientGetter = createWorkflowTools.mock.calls[0][0];
      expect(clientGetter()).toBeNull();
    });

    it('should update global client after successful init', async () => {
      const { createWorkflowTools } = require('../../src/tools/workflow.js');

      await import('../../src/index-fastmcp.js');

      const initTool = mockFastMCP.addTool.mock.calls.find(
        (call: any) => call[0].name === 'init-n8n'
      )?.[0];

      await initTool.execute({
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-api-key',
      });

      const clientGetter = createWorkflowTools.mock.calls[0][0];
      expect(clientGetter()).toBe(mockN8nClient);
    });
  });

  describe('Parameter Validation', () => {
    it('should use Zod for tool parameter validation', async () => {
      const z = require('zod').z;

      // Create spies for the Zod methods
      const objectSpy = jest.spyOn(z, 'object');
      const stringSpy = jest.spyOn(z, 'string');

      await import('../../src/index-fastmcp.js');

      // Verify that z.object was called for parameter validation
      expect(objectSpy).toHaveBeenCalled();
      expect(stringSpy).toHaveBeenCalled();

      // Clean up spies
      objectSpy.mockRestore();
      stringSpy.mockRestore();
    });
  });
});
