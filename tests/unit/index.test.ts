import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock all dependencies before imports
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn(),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn(),
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: { type: 'list_tools' },
  CallToolRequestSchema: { type: 'call_tool' },
}));

jest.mock('node-fetch', () => jest.fn());

// Mock process to prevent actual exit
const originalProcessExit = process.exit;

describe('src/index.ts - Main MCP Server Entry Point', () => {
  let mockServer: any;
  let mockTransport: any;
  let mockFetch: any;
  let mockConsoleError: any;

  beforeEach(() => {
    // Mock console.error to capture log messages
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Mock Server class
    mockServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as void),
    };

    const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
    Server.mockImplementation(() => mockServer);

    // Mock StdioServerTransport
    mockTransport = {};
    const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
    StdioServerTransport.mockImplementation(() => mockTransport);

    // Mock node-fetch
    mockFetch = require('node-fetch');

    // Mock process.exit to prevent actual exit during tests
    process.exit = jest.fn() as any;

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original functions
    process.exit = originalProcessExit;
    mockConsoleError.mockRestore();

    // Clear module cache to ensure fresh imports
    jest.resetModules();
  });

  describe('Server Initialization', () => {
    it('should create Server with correct configuration', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');

      // Import the module to trigger initialization
      await import('../../src/index.js');

      expect(Server).toHaveBeenCalledWith(
        {
          name: 'n8n-integration',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );
    });

    it('should create StdioServerTransport', async () => {
      const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

      await import('../../src/index.js');

      expect(StdioServerTransport).toHaveBeenCalledWith();
    });

    it('should connect server to transport', async () => {
      await import('../../src/index.js');

      expect(mockServer.connect).toHaveBeenCalledWith(mockTransport);
    });

    it('should log startup message', async () => {
      await import('../../src/index.js');

      expect(mockConsoleError).toHaveBeenCalledWith('N8N MCP Server running on stdio');
    });
  });

  describe('Request Handlers Registration', () => {
    it('should register ListToolsRequestSchema handler', async () => {
      const { ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

      await import('../../src/index.js');

      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        ListToolsRequestSchema,
        expect.any(Function)
      );
    });

    it('should register CallToolRequestSchema handler', async () => {
      const { CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

      await import('../../src/index.js');

      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        CallToolRequestSchema,
        expect.any(Function)
      );
    });

    it('should register exactly 2 request handlers', async () => {
      await import('../../src/index.js');

      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Tools Registration', () => {
    let listToolsHandler: Function;

    beforeEach(async () => {
      await import('../../src/index.js');

      // Extract the ListTools handler
      const listToolsCalls = mockServer.setRequestHandler.mock.calls.filter(
        (call: any) => call[0].type === 'list_tools'
      );
      if (listToolsCalls.length > 0) {
        listToolsHandler = listToolsCalls[0][1];
      }
    });

    it('should return comprehensive list of tools', async () => {
      if (!listToolsHandler) {
        throw new Error('ListTools handler not found');
      }

      const result = await listToolsHandler();

      expect(result).toHaveProperty('tools');
      expect(result.tools).toBeInstanceOf(Array);
      expect(result.tools.length).toBeGreaterThan(20); // Should have many tools
    });

    it('should include essential workflow tools', async () => {
      if (!listToolsHandler) {
        throw new Error('ListTools handler not found');
      }

      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('init-n8n');
      expect(toolNames).toContain('list-workflows');
      expect(toolNames).toContain('get-workflow');
      expect(toolNames).toContain('create-workflow');
      expect(toolNames).toContain('update-workflow');
      expect(toolNames).toContain('delete-workflow');
      expect(toolNames).toContain('activate-workflow');
      expect(toolNames).toContain('deactivate-workflow');
    });

    it('should include user management tools', async () => {
      if (!listToolsHandler) {
        throw new Error('ListTools handler not found');
      }

      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('list-users');
      expect(toolNames).toContain('create-users');
      expect(toolNames).toContain('get-user');
      expect(toolNames).toContain('delete-user');
    });

    it('should include project management tools', async () => {
      if (!listToolsHandler) {
        throw new Error('ListTools handler not found');
      }

      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('list-projects');
      expect(toolNames).toContain('create-project');
      expect(toolNames).toContain('delete-project');
      expect(toolNames).toContain('update-project');
    });

    it('should include execution management tools', async () => {
      if (!listToolsHandler) {
        throw new Error('ListTools handler not found');
      }

      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('list-executions');
      expect(toolNames).toContain('get-execution');
      expect(toolNames).toContain('delete-execution');
    });

    it('should include variable management tools', async () => {
      if (!listToolsHandler) {
        throw new Error('ListTools handler not found');
      }

      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('list-variables');
      expect(toolNames).toContain('create-variable');
      expect(toolNames).toContain('delete-variable');
    });

    it('should include credential management tools', async () => {
      if (!listToolsHandler) {
        throw new Error('ListTools handler not found');
      }

      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('create-credential');
      expect(toolNames).toContain('delete-credential');
      expect(toolNames).toContain('get-credential-schema');
    });

    it('should include tag management tools', async () => {
      if (!listToolsHandler) {
        throw new Error('ListTools handler not found');
      }

      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('create-tag');
      expect(toolNames).toContain('list-tags');
      expect(toolNames).toContain('get-tag');
      expect(toolNames).toContain('update-tag');
      expect(toolNames).toContain('delete-tag');
      expect(toolNames).toContain('get-workflow-tags');
      expect(toolNames).toContain('update-workflow-tags');
    });

    it('should include audit tool', async () => {
      if (!listToolsHandler) {
        throw new Error('ListTools handler not found');
      }

      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('generate-audit');
    });

    it('should have proper tool schema structure', async () => {
      if (!listToolsHandler) {
        throw new Error('ListTools handler not found');
      }

      const result = await listToolsHandler();
      const initTool = result.tools.find((tool: any) => tool.name === 'init-n8n');

      expect(initTool).toHaveProperty('name', 'init-n8n');
      expect(initTool).toHaveProperty('description');
      expect(initTool).toHaveProperty('inputSchema');
      expect(initTool.inputSchema).toHaveProperty('type', 'object');
      expect(initTool.inputSchema).toHaveProperty('properties');
      expect(initTool.inputSchema).toHaveProperty('required');
    });
  });

  describe('Global State Management', () => {
    let callToolHandler: Function;

    beforeEach(async () => {
      await import('../../src/index.js');

      // Extract the CallTool handler
      const callToolCalls = mockServer.setRequestHandler.mock.calls.filter(
        (call: any) => call[0].type === 'call_tool'
      );
      if (callToolCalls.length > 0) {
        callToolHandler = callToolCalls[0][1];
      }
    });

    it('should maintain client instances map', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      // Test that the clients map is used by trying to use an uninitialized client
      const result = await callToolHandler({
        params: {
          name: 'list-workflows',
          arguments: { clientId: 'non-existent' },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Client not initialized');
    });

    it('should handle invalid tool names', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const result = await callToolHandler({
        params: {
          name: 'invalid-tool',
          arguments: {},
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool: invalid-tool');
    });
  });

  describe('N8nClient Integration', () => {
    let callToolHandler: Function;

    beforeEach(async () => {
      await import('../../src/index.js');

      const callToolCalls = mockServer.setRequestHandler.mock.calls.filter(
        (call: any) => call[0].type === 'call_tool'
      );
      if (callToolCalls.length > 0) {
        callToolHandler = callToolCalls[0][1];
      }
    });

    it('should handle successful n8n connection initialization', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      // Mock successful fetch response
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn<() => Promise<{ data: any[] }>>().mockResolvedValue({ data: [] }),
        text: jest.fn<() => Promise<string>>().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
        },
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Successfully connected to n8n');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5678/api/v1/workflows',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-N8N-API-KEY': 'test-key',
          }),
        })
      );
    });

    it('should handle connection errors gracefully', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      // Mock fetch to throw an error
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to connect to n8n');
    });

    it('should handle API errors with proper error messages', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      // Mock fetch to return an error response
      const mockResponse = {
        ok: false,
        status: 401,
        text: jest
          .fn<() => Promise<string>>()
          .mockResolvedValue(JSON.stringify({ message: 'Unauthorized' })),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'invalid-key' },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('N8N API error');
    });

    it('should handle 204 No Content responses', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      // First call for init-n8n (mock successful connection test)
      const mockSuccessResponse = {
        ok: true,
        status: 200,
        json: jest.fn<() => Promise<{ data: any[] }>>().mockResolvedValue({ data: [] }),
        text: jest.fn<() => Promise<string>>().mockResolvedValue(''),
      };

      // Second call that returns 204
      const mock204Response = {
        ok: true,
        status: 204,
        json: jest.fn(),
        text: jest.fn<() => Promise<string>>().mockResolvedValue(''),
      };

      mockFetch.mockResolvedValueOnce(mockSuccessResponse).mockResolvedValueOnce(mock204Response);

      // First initialize a client
      const initResult = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
        },
      });

      expect(initResult.isError).toBeFalsy();

      // Get the clientId from the response
      const clientIdMatch = initResult.content[0].text.match(
        /client ID for future operations: (.+)/
      );
      expect(clientIdMatch).toBeTruthy();
      const clientId = clientIdMatch?.[1];

      // Now test a call that returns 204
      const result = await callToolHandler({
        params: {
          name: 'create-project',
          arguments: { clientId, name: 'Test Project' },
        },
      });

      expect(result.isError).toBeFalsy();
    });

    it('should handle license-related errors specially', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const mockResponse = {
        ok: false,
        status: 403,
        text: jest.fn<() => Promise<string>>().mockResolvedValue(
          JSON.stringify({
            message: 'This operation requires an enterprise license',
          })
        ),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('enterprise license');
    });

    it('should handle non-Error exceptions', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      // Mock fetch to throw a non-Error object
      mockFetch.mockRejectedValueOnce('String error');

      const result = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBeTruthy();
    });
  });

  describe('Tool Execution Integration', () => {
    let callToolHandler: Function;
    let clientId: string;

    beforeEach(async () => {
      await import('../../src/index.js');

      const callToolCalls = mockServer.setRequestHandler.mock.calls.filter(
        (call: any) => call[0].type === 'call_tool'
      );
      if (callToolCalls.length > 0) {
        callToolHandler = callToolCalls[0][1];
      }

      // Mock successful n8n connection
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn<() => Promise<{ data: any[] }>>().mockResolvedValue({ data: [] }),
        text: jest.fn<() => Promise<string>>().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      // Initialize a client
      if (callToolHandler) {
        const initResult = await callToolHandler({
          params: {
            name: 'init-n8n',
            arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
          },
        });

        const clientIdMatch = initResult.content[0].text.match(
          /client ID for future operations: (.+)/
        );
        clientId = clientIdMatch?.[1] || '';
      }
    });

    it('should successfully initialize n8n connection', () => {
      expect(clientId).toBeTruthy();
    });

    it('should execute list-workflows tool', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const result = await callToolHandler({
        params: {
          name: 'list-workflows',
          arguments: { clientId },
        },
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toBeTruthy();
    });

    it('should execute workflow creation with proper parameters', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const result = await callToolHandler({
        params: {
          name: 'create-workflow',
          arguments: {
            clientId,
            name: 'Test Workflow',
            nodes: [],
            connections: {},
          },
        },
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Successfully created workflow');
    });

    it('should handle workflow activation/deactivation', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const activateResult = await callToolHandler({
        params: {
          name: 'activate-workflow',
          arguments: { clientId, id: 'test-workflow-id' },
        },
      });

      expect(activateResult.isError).toBeFalsy();
      expect(activateResult.content[0].text).toContain('Successfully activated workflow');

      const deactivateResult = await callToolHandler({
        params: {
          name: 'deactivate-workflow',
          arguments: { clientId, id: 'test-workflow-id' },
        },
      });

      expect(deactivateResult.isError).toBeFalsy();
      expect(deactivateResult.content[0].text).toContain('Successfully deactivated workflow');
    });

    it('should execute user management operations', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const listResult = await callToolHandler({
        params: {
          name: 'list-users',
          arguments: { clientId },
        },
      });

      expect(listResult.isError).toBeFalsy();

      const createResult = await callToolHandler({
        params: {
          name: 'create-users',
          arguments: {
            clientId,
            users: [{ email: 'test@example.com', role: 'global:member' }],
          },
        },
      });

      expect(createResult.isError).toBeFalsy();
    });

    it('should execute variable management operations', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const listResult = await callToolHandler({
        params: {
          name: 'list-variables',
          arguments: { clientId },
        },
      });

      expect(listResult.isError).toBeFalsy();

      const createResult = await callToolHandler({
        params: {
          name: 'create-variable',
          arguments: { clientId, key: 'TEST_VAR', value: 'test-value' },
        },
      });

      expect(createResult.isError).toBeFalsy();
    });

    it('should execute execution management operations', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const listResult = await callToolHandler({
        params: {
          name: 'list-executions',
          arguments: { clientId, limit: 10 },
        },
      });

      expect(listResult.isError).toBeFalsy();

      const getResult = await callToolHandler({
        params: {
          name: 'get-execution',
          arguments: { clientId, id: 123, includeData: true },
        },
      });

      expect(getResult.isError).toBeFalsy();
    });

    it('should execute tag management operations', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const createResult = await callToolHandler({
        params: {
          name: 'create-tag',
          arguments: { clientId, name: 'Test Tag' },
        },
      });

      expect(createResult.isError).toBeFalsy();

      const listResult = await callToolHandler({
        params: {
          name: 'list-tags',
          arguments: { clientId },
        },
      });

      expect(listResult.isError).toBeFalsy();
    });

    it('should execute audit generation', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const result = await callToolHandler({
        params: {
          name: 'generate-audit',
          arguments: {
            clientId,
            categories: ['credentials', 'database'],
            daysAbandonedWorkflow: 30,
          },
        },
      });

      expect(result.isError).toBeFalsy();
    });

    it('should execute credential management operations', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const schemaResult = await callToolHandler({
        params: {
          name: 'get-credential-schema',
          arguments: { clientId, credentialTypeName: 'httpBasicAuth' },
        },
      });

      expect(schemaResult.isError).toBeFalsy();

      const createResult = await callToolHandler({
        params: {
          name: 'create-credential',
          arguments: {
            clientId,
            name: 'Test Credential',
            type: 'httpBasicAuth',
            data: { username: 'test', password: 'pass' },
          },
        },
      });

      expect(createResult.isError).toBeFalsy();
    });
  });

  describe('Response Format Validation', () => {
    let callToolHandler: Function;

    beforeEach(async () => {
      await import('../../src/index.js');

      const callToolCalls = mockServer.setRequestHandler.mock.calls.filter(
        (call: any) => call[0].type === 'call_tool'
      );
      if (callToolCalls.length > 0) {
        callToolHandler = callToolCalls[0][1];
      }
    });

    it('should return proper error response structure', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const result = await callToolHandler({
        params: {
          name: 'list-workflows',
          arguments: { clientId: 'invalid' },
        },
      });

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('isError', true);
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should return proper success response structure', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      // Mock successful response
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn<() => Promise<{ data: any[] }>>().mockResolvedValue({ data: [] }),
        text: jest.fn<() => Promise<string>>().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
        },
      });

      expect(result).toHaveProperty('content');
      expect(result.isError).toBeFalsy();
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should format JSON responses properly', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const mockWorkflows = [
        {
          id: 1,
          name: 'Test Workflow',
          active: true,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          tags: [],
        },
      ];
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn<() => Promise<{ data: any[] }>>().mockResolvedValue({ data: mockWorkflows }),
        text: jest.fn<() => Promise<string>>().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      // First initialize client
      const initResult = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
        },
      });
      const clientIdMatch = initResult.content[0].text.match(
        /client ID for future operations: (.+)/
      );
      const clientId = clientIdMatch?.[1];

      // Then list workflows
      const result = await callToolHandler({
        params: {
          name: 'list-workflows',
          arguments: { clientId },
        },
      });

      expect(result.isError).toBeFalsy();
      const responseText = result.content[0].text;
      expect(() => JSON.parse(responseText)).not.toThrow();

      const parsedResponse = JSON.parse(responseText);
      expect(parsedResponse).toBeInstanceOf(Array);
      expect(parsedResponse[0]).toHaveProperty('id');
      expect(parsedResponse[0]).toHaveProperty('name');
      expect(parsedResponse[0]).toHaveProperty('active');
    });
  });

  describe('N8nClient Class Functionality', () => {
    let callToolHandler: Function;

    beforeEach(async () => {
      await import('../../src/index.js');

      const callToolCalls = mockServer.setRequestHandler.mock.calls.filter(
        (call: any) => call[0].type === 'call_tool'
      );
      if (callToolCalls.length > 0) {
        callToolHandler = callToolCalls[0][1];
      }
    });

    it('should normalize baseUrl by removing trailing slash', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn<() => Promise<{ data: any[] }>>().mockResolvedValue({ data: [] }),
        text: jest.fn<() => Promise<string>>().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678/', apiKey: 'test-key' },
        },
      });

      expect(result.isError).toBeFalsy();
      // Verify the API call was made without trailing slash
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5678/api/v1/workflows',
        expect.any(Object)
      );
    });

    it('should handle malformed JSON error responses', async () => {
      if (!callToolHandler) {
        throw new Error('CallTool handler not found');
      }

      const mockResponse = {
        ok: false,
        status: 500,
        text: jest.fn<() => Promise<string>>().mockResolvedValue('Internal Server Error'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('N8N API error: Internal Server Error');
    });
  });
});
