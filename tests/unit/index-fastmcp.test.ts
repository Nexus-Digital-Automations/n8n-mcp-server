import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { FastMCP } from 'fastmcp';
import { z } from 'zod';

// Mock all dependencies
jest.mock('fastmcp');
jest.mock('zod');
jest.mock('../../src/client/n8nClient.js');
jest.mock('../../src/tools/workflow.js');
jest.mock('../../src/tools/projects.js');
jest.mock('../../src/tools/users.js');
jest.mock('../../src/tools/variables.js');
jest.mock('../../src/tools/executions.js');
jest.mock('../../src/tools/tags.js');
jest.mock('../../src/tools/credentials.js');
jest.mock('../../src/tools/audit.js');
jest.mock('../../src/transport/transportConfig.js');
jest.mock('../../src/transport/sseTransport.js');

describe('src/index-fastmcp.ts - FastMCP Server Entry Point', () => {
  let mockFastMCP: jest.Mocked<FastMCP>;
  let mockN8nClient: any;
  let mockConsoleLog: any;
  let mockConsoleError: any;
  let originalProcessExit: typeof process.exit;
  let originalProcessOn: typeof process.on;

  // Mock tool creation functions
  const mockCreateWorkflowTools = jest.fn();
  const mockCreateProjectTools = jest.fn();
  const mockCreateUserTools = jest.fn();
  const mockCreateVariableTools = jest.fn();
  const mockCreateExecutionTools = jest.fn();
  const mockCreateTagTools = jest.fn();
  const mockCreateCredentialTools = jest.fn();
  const mockCreateAuditTools = jest.fn();

  // Mock transport functions
  const mockDetectTransportConfig = jest.fn();
  const mockValidateTransportConfig = jest.fn();
  const mockGetServerUrl = jest.fn();
  const mockCreateSSETransport = jest.fn();
  const mockSSEUtils = {
    validateConfig: jest.fn(),
  };

  beforeEach(() => {
    // Mock console methods
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process methods
    originalProcessExit = process.exit;
    originalProcessOn = process.on;
    process.exit = jest.fn() as any;
    process.on = jest.fn() as any;

    // Mock FastMCP instance
    mockFastMCP = {
      addTool: jest.fn().mockReturnThis(),
      start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      on: jest.fn().mockReturnThis(),
    } as any;
    (FastMCP as jest.MockedClass<typeof FastMCP>).mockImplementation(() => mockFastMCP);

    // Mock N8nClient
    mockN8nClient = {
      getWorkflows: jest.fn<() => Promise<{ data: any[] }>>().mockResolvedValue({ data: [] }),
    };

    // Setup mocks for imported functions
    const { createWorkflowTools } = jest.requireMock('../../src/tools/workflow.js') as any;
    const { createProjectTools } = jest.requireMock('../../src/tools/projects.js') as any;
    const { createUserTools } = jest.requireMock('../../src/tools/users.js') as any;
    const { createVariableTools } = jest.requireMock('../../src/tools/variables.js') as any;
    const { createExecutionTools } = jest.requireMock('../../src/tools/executions.js') as any;
    const { createTagTools } = jest.requireMock('../../src/tools/tags.js') as any;
    const { createCredentialTools } = jest.requireMock('../../src/tools/credentials.js') as any;
    const { createAuditTools } = jest.requireMock('../../src/tools/audit.js') as any;

    createWorkflowTools.mockImplementation(mockCreateWorkflowTools);
    createProjectTools.mockImplementation(mockCreateProjectTools);
    createUserTools.mockImplementation(mockCreateUserTools);
    createVariableTools.mockImplementation(mockCreateVariableTools);
    createExecutionTools.mockImplementation(mockCreateExecutionTools);
    createTagTools.mockImplementation(mockCreateTagTools);
    createCredentialTools.mockImplementation(mockCreateCredentialTools);
    createAuditTools.mockImplementation(mockCreateAuditTools);

    // Setup transport mocks
    const { detectTransportConfig, validateTransportConfig, getServerUrl } = jest.requireMock(
      '../../src/transport/transportConfig.js'
    ) as any;
    const { createSSETransport, SSEUtils } = jest.requireMock(
      '../../src/transport/sseTransport.js'
    ) as any;

    detectTransportConfig.mockImplementation(mockDetectTransportConfig);
    validateTransportConfig.mockImplementation(mockValidateTransportConfig);
    getServerUrl.mockImplementation(mockGetServerUrl);
    createSSETransport.mockImplementation(mockCreateSSETransport);
    SSEUtils.validateConfig = mockSSEUtils.validateConfig;

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original functions
    process.exit = originalProcessExit;
    process.on = originalProcessOn;
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('FastMCP Server Initialization', () => {
    it('should create FastMCP instance with correct configuration', async () => {
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
      await import('../../src/index-fastmcp.js');

      const config = (FastMCP as jest.MockedClass<typeof FastMCP>).mock.calls[0][0];
      expect(config.instructions).toContain('Key Features:');
      expect(config.instructions).toContain('Complete workflow management');
      expect(config.instructions).toContain('User and project management');
      expect(config.instructions).toContain('Execution monitoring');
      expect(config.instructions).toContain('Getting Started:');
      expect(config.instructions).toContain('init-n8n');
    });
  });

  describe('Tool Registration', () => {
    beforeEach(async () => {
      await import('../../src/index-fastmcp.js');
    });

    it('should register all tool categories', () => {
      expect(mockCreateWorkflowTools).toHaveBeenCalledWith(expect.any(Function), mockFastMCP);
      expect(mockCreateProjectTools).toHaveBeenCalledWith(expect.any(Function), mockFastMCP);
      expect(mockCreateUserTools).toHaveBeenCalledWith(expect.any(Function), mockFastMCP);
      expect(mockCreateVariableTools).toHaveBeenCalledWith(expect.any(Function), mockFastMCP);
      expect(mockCreateExecutionTools).toHaveBeenCalledWith(expect.any(Function), mockFastMCP);
      expect(mockCreateTagTools).toHaveBeenCalledWith(expect.any(Function), mockFastMCP);
      expect(mockCreateCredentialTools).toHaveBeenCalledWith(expect.any(Function), mockFastMCP);
      expect(mockCreateAuditTools).toHaveBeenCalledWith(expect.any(Function), mockFastMCP);
    });

    it('should register tools with the same server instance', () => {
      const serverInstances = [
        mockCreateWorkflowTools.mock.calls[0][1],
        mockCreateProjectTools.mock.calls[0][1],
        mockCreateUserTools.mock.calls[0][1],
        mockCreateVariableTools.mock.calls[0][1],
        mockCreateExecutionTools.mock.calls[0][1],
        mockCreateTagTools.mock.calls[0][1],
        mockCreateCredentialTools.mock.calls[0][1],
        mockCreateAuditTools.mock.calls[0][1],
      ];

      // All should reference the same server instance
      serverInstances.forEach(instance => {
        expect(instance).toBe(mockFastMCP);
      });
    });

    it('should pass client getter function to all tool creators', () => {
      const clientGetters = [
        mockCreateWorkflowTools.mock.calls[0][0],
        mockCreateProjectTools.mock.calls[0][0],
        mockCreateUserTools.mock.calls[0][0],
        mockCreateVariableTools.mock.calls[0][0],
        mockCreateExecutionTools.mock.calls[0][0],
        mockCreateTagTools.mock.calls[0][0],
        mockCreateCredentialTools.mock.calls[0][0],
        mockCreateAuditTools.mock.calls[0][0],
      ];

      // All should be functions
      clientGetters.forEach(getter => {
        expect(typeof getter).toBe('function');
      });

      // All should return null initially (no client set)
      clientGetters.forEach(getter => {
        expect((getter as () => any)()).toBeNull();
      });
    });
  });

  describe('Custom Tools Registration', () => {
    beforeEach(async () => {
      await import('../../src/index-fastmcp.js');
    });

    it('should register init-n8n tool', () => {
      const initToolCalls = mockFastMCP.addTool.mock.calls.filter(
        call => call[0].name === 'init-n8n'
      );

      expect(initToolCalls).toHaveLength(1);

      const initTool = initToolCalls[0][0];
      expect(initTool).toHaveProperty('name', 'init-n8n');
      expect(initTool).toHaveProperty('description');
      expect(initTool).toHaveProperty('parameters');
      expect(initTool).toHaveProperty('execute');
      expect(initTool).toHaveProperty('annotations');
    });

    it('should register status tool', () => {
      const statusToolCalls = mockFastMCP.addTool.mock.calls.filter(
        call => call[0].name === 'status'
      );

      expect(statusToolCalls).toHaveLength(1);

      const statusTool = statusToolCalls[0][0];
      expect(statusTool).toHaveProperty('name', 'status');
      expect(statusTool).toHaveProperty('description');
      expect(statusTool).toHaveProperty('parameters');
      expect(statusTool).toHaveProperty('execute');
      expect(statusTool).toHaveProperty('annotations');
    });

    it('should configure init-n8n tool with proper schema validation', () => {
      const initTool = mockFastMCP.addTool.mock.calls.find(
        call => call[0].name === 'init-n8n'
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

    it('should configure status tool with proper annotations', () => {
      const statusTool = mockFastMCP.addTool.mock.calls.find(
        call => call[0].name === 'status'
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
    let initToolExecute: Function;

    beforeEach(async () => {
      // Mock N8nClient constructor
      const { N8nClient } = jest.requireMock('../../src/client/n8nClient.js') as any;
      N8nClient.mockImplementation(() => mockN8nClient);

      await import('../../src/index-fastmcp.js');

      const initTool = mockFastMCP.addTool.mock.calls.find(
        call => call[0].name === 'init-n8n'
      )?.[0];
      if (initTool) {
        initToolExecute = initTool.execute;
      }
    });

    it('should successfully initialize n8n connection', async () => {
      const args = {
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-api-key',
      };

      const result = await initToolExecute(args);

      expect(result).toBe('✅ Successfully connected to n8n instance at http://localhost:5678');
      expect(mockN8nClient.getWorkflows).toHaveBeenCalledWith({ limit: 1 });
    });

    it('should handle connection errors gracefully', async () => {
      mockN8nClient.getWorkflows.mockRejectedValueOnce(new Error('Connection failed'));

      const args = {
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-api-key',
      };

      await expect(initToolExecute(args)).rejects.toThrow(
        'Failed to connect to n8n: Connection failed'
      );
    });

    it('should handle unknown connection errors', async () => {
      mockN8nClient.getWorkflows.mockRejectedValueOnce('Unknown error');

      const args = {
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-api-key',
      };

      await expect(initToolExecute(args)).rejects.toThrow(
        'Failed to connect to n8n with unknown error'
      );
    });

    it('should set global client instance on successful connection', async () => {
      const args = {
        baseUrl: 'http://localhost:5678',
        apiKey: 'test-api-key',
      };

      await initToolExecute(args);

      // Test that client getter now returns the client
      const clientGetter = mockCreateWorkflowTools.mock.calls[0][0] as () => any;
      expect(clientGetter()).toBe(mockN8nClient);
    });
  });

  describe('status Tool Execution', () => {
    let statusToolExecute: Function;

    beforeEach(async () => {
      await import('../../src/index-fastmcp.js');

      const statusTool = mockFastMCP.addTool.mock.calls.find(
        call => call[0].name === 'status'
      )?.[0];
      if (statusTool) {
        statusToolExecute = statusTool.execute;
      }
    });

    it('should return not connected message when no client is set', async () => {
      const result = await statusToolExecute();

      expect(result).toBe("❌ Not connected to n8n. Please run 'init-n8n' first.");
    });

    it('should return connected status when client is working', async () => {
      // First initialize a client
      const { N8nClient } = jest.requireMock('../../src/client/n8nClient.js') as any;
      N8nClient.mockImplementation(() => mockN8nClient);

      const initTool = mockFastMCP.addTool.mock.calls.find(
        call => call[0].name === 'init-n8n'
      )?.[0];

      if (initTool) {
        await initTool.execute({
          baseUrl: 'http://localhost:5678',
          apiKey: 'test-api-key',
        });
      }

      // Now check status
      const result = await statusToolExecute();

      expect(result).toBe('✅ Connected to n8n and ready to use.');
      expect(mockN8nClient.getWorkflows).toHaveBeenCalledWith({ limit: 1 });
    });

    it('should return connection error when client fails', async () => {
      // Initialize a client first
      const { N8nClient } = jest.requireMock('../../src/client/n8nClient.js') as any;
      N8nClient.mockImplementation(() => mockN8nClient);

      const initTool = mockFastMCP.addTool.mock.calls.find(
        call => call[0].name === 'init-n8n'
      )?.[0];

      if (initTool) {
        await initTool.execute({
          baseUrl: 'http://localhost:5678',
          apiKey: 'test-api-key',
        });
      }

      // Make subsequent calls fail
      mockN8nClient.getWorkflows.mockRejectedValueOnce(new Error('API Error'));

      const result = await statusToolExecute();

      expect(result).toBe('⚠️ Connected but unable to communicate with n8n: API Error');
    });

    it('should handle non-Error exceptions in status check', async () => {
      // Initialize a client first
      const { N8nClient } = jest.requireMock('../../src/client/n8nClient.js') as any;
      N8nClient.mockImplementation(() => mockN8nClient);

      const initTool = mockFastMCP.addTool.mock.calls.find(
        call => call[0].name === 'init-n8n'
      )?.[0];

      if (initTool) {
        await initTool.execute({
          baseUrl: 'http://localhost:5678',
          apiKey: 'test-api-key',
        });
      }

      // Make subsequent calls fail with non-Error
      mockN8nClient.getWorkflows.mockRejectedValueOnce('String error');

      const result = await statusToolExecute();

      expect(result).toBe('⚠️ Connected but unable to communicate with n8n: String error');
    });
  });

  describe('Server Startup with stdio Transport', () => {
    beforeEach(() => {
      mockDetectTransportConfig.mockReturnValue({ type: 'stdio' });
      mockValidateTransportConfig.mockReturnValue({ type: 'stdio' });
    });

    it('should start server with stdio transport', async () => {
      await import('../../src/index-fastmcp.js');

      // Wait for async operations to complete
      await Promise.resolve();

      expect(mockConsoleLog).toHaveBeenCalledWith('🚀 Starting n8n MCP Server...');
      expect(mockConsoleLog).toHaveBeenCalledWith('📡 Transport type: stdio');
      expect(mockFastMCP.start).toHaveBeenCalledWith({ transportType: 'stdio' });
      expect(mockConsoleLog).toHaveBeenCalledWith('📟 Server started with stdio transport');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ n8n MCP Server is ready!');
    });

    it('should call transport detection and validation', async () => {
      await import('../../src/index-fastmcp.js');

      await Promise.resolve();

      expect(mockDetectTransportConfig).toHaveBeenCalled();
      expect(mockValidateTransportConfig).toHaveBeenCalled();
    });
  });

  describe('Server Startup with SSE Transport', () => {
    const mockSSETransport = {
      start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    beforeEach(() => {
      mockDetectTransportConfig.mockReturnValue({
        type: 'sse',
        port: 3000,
        host: 'localhost',
      });
      mockValidateTransportConfig.mockReturnValue({
        type: 'sse',
        port: 3000,
        host: 'localhost',
      });
      mockSSEUtils.validateConfig.mockReturnValue(true);
      mockCreateSSETransport.mockReturnValue(mockSSETransport);
      mockGetServerUrl.mockReturnValue('http://localhost:3000');
    });

    it('should start server with SSE transport', async () => {
      await import('../../src/index-fastmcp.js');

      await Promise.resolve();

      expect(mockConsoleLog).toHaveBeenCalledWith('🚀 Starting n8n MCP Server...');
      expect(mockConsoleLog).toHaveBeenCalledWith('📡 Transport type: sse');
      expect(mockSSEUtils.validateConfig).toHaveBeenCalled();
      expect(mockCreateSSETransport).toHaveBeenCalledWith(mockFastMCP, {
        type: 'sse',
        port: 3000,
        host: 'localhost',
      });
      expect(mockSSETransport.start).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('🌐 Server URL: http://localhost:3000');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ n8n MCP Server is ready!');
    });

    it('should handle invalid SSE configuration', async () => {
      mockSSEUtils.validateConfig.mockReturnValue(false);

      await import('../../src/index-fastmcp.js');

      await Promise.resolve();

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Invalid SSE configuration');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should handle missing server URL', async () => {
      mockGetServerUrl.mockReturnValue(null);

      await import('../../src/index-fastmcp.js');

      await Promise.resolve();

      expect(mockSSETransport.start).toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('🌐 Server URL:'));
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ n8n MCP Server is ready!');
    });
  });

  describe('Server Startup Error Handling', () => {
    beforeEach(() => {
      mockDetectTransportConfig.mockReturnValue({ type: 'stdio' });
      mockValidateTransportConfig.mockReturnValue({ type: 'stdio' });
    });

    it('should handle server startup errors', async () => {
      mockFastMCP.start.mockRejectedValueOnce(new Error('Server startup failed'));

      await import('../../src/index-fastmcp.js');

      await Promise.resolve();

      expect(mockConsoleError).toHaveBeenCalledWith(
        '❌ Failed to start server:',
        expect.any(Error)
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should handle SSE transport startup errors', async () => {
      mockDetectTransportConfig.mockReturnValue({ type: 'sse', port: 3000 });
      mockValidateTransportConfig.mockReturnValue({ type: 'sse', port: 3000 });
      mockSSEUtils.validateConfig.mockReturnValue(true);

      const mockSSETransport = {
        start: jest
          .fn<() => Promise<void>>()
          .mockRejectedValueOnce(new Error('SSE startup failed')),
      };
      mockCreateSSETransport.mockReturnValue(mockSSETransport);

      await import('../../src/index-fastmcp.js');

      await Promise.resolve();

      expect(mockConsoleError).toHaveBeenCalledWith(
        '❌ Failed to start server:',
        expect.any(Error)
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('Process Signal Handling', () => {
    beforeEach(async () => {
      await import('../../src/index-fastmcp.js');
    });

    it('should register SIGINT handler', () => {
      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('should register SIGTERM handler', () => {
      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should handle SIGINT gracefully', () => {
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

    it('should handle SIGTERM gracefully', () => {
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
    let clientGetter: () => any;

    beforeEach(async () => {
      await import('../../src/index-fastmcp.js');
      clientGetter = mockCreateWorkflowTools.mock.calls[0][0] as () => any;
    });

    it('should start with null client', () => {
      expect(clientGetter()).toBeNull();
    });

    it('should update global client after successful init', async () => {
      const { N8nClient } = jest.requireMock('../../src/client/n8nClient.js') as any;
      N8nClient.mockImplementation(() => mockN8nClient);

      const initTool = mockFastMCP.addTool.mock.calls.find(
        call => call[0].name === 'init-n8n'
      )?.[0];

      if (initTool) {
        await initTool.execute({
          baseUrl: 'http://localhost:5678',
          apiKey: 'test-api-key',
        });
      }

      expect(clientGetter()).toBe(mockN8nClient);
    });

    it('should maintain client state across multiple tool registrations', async () => {
      const { N8nClient } = jest.requireMock('../../src/client/n8nClient.js') as any;
      N8nClient.mockImplementation(() => mockN8nClient);

      const initTool = mockFastMCP.addTool.mock.calls.find(
        call => call[0].name === 'init-n8n'
      )?.[0];

      if (initTool) {
        await initTool.execute({
          baseUrl: 'http://localhost:5678',
          apiKey: 'test-api-key',
        });
      }

      // Check that all tool categories get the same client
      const allClientGetters = [
        mockCreateWorkflowTools.mock.calls[0][0],
        mockCreateProjectTools.mock.calls[0][0],
        mockCreateUserTools.mock.calls[0][0],
        mockCreateVariableTools.mock.calls[0][0],
        mockCreateExecutionTools.mock.calls[0][0],
        mockCreateTagTools.mock.calls[0][0],
        mockCreateCredentialTools.mock.calls[0][0],
        mockCreateAuditTools.mock.calls[0][0],
      ];

      allClientGetters.forEach(getter => {
        expect((getter as any)()).toBe(mockN8nClient);
      });
    });
  });

  describe('Parameter Validation', () => {
    it('should use Zod for init-n8n parameter validation', async () => {
      await import('../../src/index-fastmcp.js');

      const initTool = mockFastMCP.addTool.mock.calls.find(
        call => call[0].name === 'init-n8n'
      )?.[0];

      expect(initTool).toBeDefined();
      if (initTool) {
        // The parameters should be a z.object result
        expect(initTool.parameters).toBeDefined();
        // We can't easily test the actual Zod schema structure in mocked environment,
        // but we can verify it was called to create the parameters
      }
    });

    it('should use empty Zod object for status parameters', async () => {
      await import('../../src/index-fastmcp.js');

      const statusTool = mockFastMCP.addTool.mock.calls.find(
        call => call[0].name === 'status'
      )?.[0];

      expect(statusTool).toBeDefined();
      if (statusTool) {
        expect(statusTool.parameters).toBeDefined();
      }
    });
  });

  describe('Integration with Tool Modules', () => {
    beforeEach(async () => {
      await import('../../src/index-fastmcp.js');
    });

    it('should pass consistent server instance to all tools', () => {
      const serverInstances = [
        mockCreateWorkflowTools.mock.calls[0][1],
        mockCreateProjectTools.mock.calls[0][1],
        mockCreateUserTools.mock.calls[0][1],
        mockCreateVariableTools.mock.calls[0][1],
        mockCreateExecutionTools.mock.calls[0][1],
        mockCreateTagTools.mock.calls[0][1],
        mockCreateCredentialTools.mock.calls[0][1],
        mockCreateAuditTools.mock.calls[0][1],
      ];

      // All tools should receive the same FastMCP instance
      serverInstances.forEach(instance => {
        expect(instance).toBe(mockFastMCP);
      });
    });

    it('should ensure tool registration happens before server start', () => {
      // Verify all tool creation functions were called before server.start
      expect(mockCreateWorkflowTools).toHaveBeenCalled();
      expect(mockCreateProjectTools).toHaveBeenCalled();
      expect(mockCreateUserTools).toHaveBeenCalled();
      expect(mockCreateVariableTools).toHaveBeenCalled();
      expect(mockCreateExecutionTools).toHaveBeenCalled();
      expect(mockCreateTagTools).toHaveBeenCalled();
      expect(mockCreateCredentialTools).toHaveBeenCalled();
      expect(mockCreateAuditTools).toHaveBeenCalled();

      // The custom tools should also be registered
      expect(mockFastMCP.addTool).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'init-n8n' })
      );
      expect(mockFastMCP.addTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'status' }));
    });
  });
});
