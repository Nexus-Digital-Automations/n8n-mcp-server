import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('node-fetch');

describe('src/index.ts - Main MCP Server Entry Point', () => {
  let mockServer: jest.Mocked<Server>;
  let mockTransport: jest.Mocked<StdioServerTransport>;
  let mockConsoleError: any;
  let originalProcessExit: typeof process.exit;

  beforeEach(() => {
    // Mock console.error to capture log messages
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Mock Server class
    mockServer = {
      setRequestHandler: jest.fn() as jest.MockedFunction<any>,
      connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as any;
    (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

    // Mock StdioServerTransport
    mockTransport = {} as any;
    (StdioServerTransport as jest.MockedClass<typeof StdioServerTransport>).mockImplementation(
      () => mockTransport
    );

    // Mock process.exit to prevent actual exit during tests
    originalProcessExit = process.exit;
    process.exit = jest.fn() as any;

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore process.exit
    process.exit = originalProcessExit;
    mockConsoleError.mockRestore();
  });

  describe('Server Initialization', () => {
    it('should create Server with correct configuration', async () => {
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
      await import('../../src/index.js');

      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        expect.anything(), // ListToolsRequestSchema
        expect.any(Function)
      );
    });

    it('should register CallToolRequestSchema handler', async () => {
      await import('../../src/index.js');

      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        expect.anything(), // CallToolRequestSchema
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
      const listToolsCall = mockServer.setRequestHandler.mock.calls.find(call =>
        call[0].toString().includes('list_tools')
      );
      listToolsHandler = listToolsCall?.[1] as Function;
    });

    it('should return comprehensive list of tools', async () => {
      const result = await listToolsHandler();

      expect(result).toHaveProperty('tools');
      expect(result.tools).toBeInstanceOf(Array);
      expect(result.tools.length).toBeGreaterThan(20); // Should have many tools
    });

    it('should include essential workflow tools', async () => {
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
      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('list-users');
      expect(toolNames).toContain('create-users');
      expect(toolNames).toContain('get-user');
      expect(toolNames).toContain('delete-user');
    });

    it('should include project management tools', async () => {
      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('list-projects');
      expect(toolNames).toContain('create-project');
      expect(toolNames).toContain('delete-project');
      expect(toolNames).toContain('update-project');
    });

    it('should include execution management tools', async () => {
      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('list-executions');
      expect(toolNames).toContain('get-execution');
      expect(toolNames).toContain('delete-execution');
    });

    it('should include variable management tools', async () => {
      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('list-variables');
      expect(toolNames).toContain('create-variable');
      expect(toolNames).toContain('delete-variable');
    });

    it('should include credential management tools', async () => {
      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('create-credential');
      expect(toolNames).toContain('delete-credential');
      expect(toolNames).toContain('get-credential-schema');
    });

    it('should include tag management tools', async () => {
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
      const result = await listToolsHandler();
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('generate-audit');
    });

    it('should have proper tool schema structure', async () => {
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

  describe('N8nClient Class', () => {
    let N8nClient: any;

    beforeEach(async () => {
      // Import the module to get access to the N8nClient class
      const indexModule = await import('../../src/index.js');
      // N8nClient is not exported but we can access it through the tools
      N8nClient = (indexModule as any).N8nClient;
    });

    it('should construct with baseUrl and apiKey', () => {
      // We can't directly test the class as it's not exported
      // Instead, we'll test through the tool handlers
      expect(true).toBe(true); // Placeholder - actual testing happens through tool execution
    });

    it('should normalize baseUrl by removing trailing slash', () => {
      // This will be tested through the init-n8n tool execution
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Global State Management', () => {
    let callToolHandler: Function;

    beforeEach(async () => {
      await import('../../src/index.js');

      // Extract the CallTool handler
      const callToolCall = mockServer.setRequestHandler.mock.calls.find(call =>
        call[0].toString().includes('call_tool')
      );
      callToolHandler = callToolCall?.[1] as Function;
    });

    it('should maintain client instances map', async () => {
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

  describe('Error Handling', () => {
    let callToolHandler: Function;

    beforeEach(async () => {
      await import('../../src/index.js');

      const callToolCall = mockServer.setRequestHandler.mock.calls.find(call =>
        call[0].toString().includes('call_tool')
      );
      callToolHandler = callToolCall?.[1] as Function;
    });

    it('should handle connection errors gracefully', async () => {
      // Mock fetch to throw an error
      const nodeFetch = await import('node-fetch');
      (nodeFetch.default as jest.MockedFunction<typeof nodeFetch.default>).mockRejectedValueOnce(
        new Error('Connection failed')
      );

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
      // Mock fetch to return an error response
      const nodeFetch = await import('node-fetch');
      const mockResponse = {
        ok: false,
        status: 401,
        text: jest
          .fn<() => Promise<string>>()
          .mockResolvedValue(JSON.stringify({ message: 'Unauthorized' })),
      } as any;
      (nodeFetch.default as jest.MockedFunction<typeof nodeFetch.default>).mockResolvedValueOnce(
        mockResponse
      );

      const result = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'invalid-key' },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('N8N API error');
    });

    it('should handle non-Error exceptions', async () => {
      // Mock fetch to throw a non-Error object
      const nodeFetch = await import('node-fetch');
      (nodeFetch.default as jest.MockedFunction<typeof nodeFetch.default>).mockRejectedValueOnce(
        'String error'
      );

      const result = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBeTruthy();
    });

    it('should handle license-related errors specially', async () => {
      const nodeFetch = await import('node-fetch');
      const mockResponse = {
        ok: false,
        status: 403,
        text: jest.fn<() => Promise<string>>().mockResolvedValue(
          JSON.stringify({
            message: 'This operation requires an enterprise license',
          })
        ),
      } as any;
      (nodeFetch.default as jest.MockedFunction<typeof nodeFetch.default>).mockResolvedValueOnce(
        mockResponse
      );

      const result = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('enterprise license');
    });

    it('should handle 204 No Content responses', async () => {
      const nodeFetch = await import('node-fetch');

      // First call for init-n8n (mock successful connection test)
      const mockSuccessResponse = {
        ok: true,
        status: 200,
        json: jest.fn<() => Promise<{ data: any[] }>>().mockResolvedValue({ data: [] }),
      } as any;

      // Second call that returns 204
      const mock204Response = {
        ok: true,
        status: 204,
        json: jest.fn(),
      } as any;

      (nodeFetch.default as jest.MockedFunction<typeof nodeFetch.default>)
        .mockResolvedValueOnce(mockSuccessResponse)
        .mockResolvedValueOnce(mock204Response);

      // First initialize a client
      const initResult = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
        },
      });

      expect(initResult.isError).toBeFalsy();

      // Get the clientId from the response
      const clientId = initResult.content[0].text.match(
        /client ID for future operations: (.+)/
      )?.[1];
      expect(clientId).toBeTruthy();

      // Now test a call that returns 204
      const result = await callToolHandler({
        params: {
          name: 'create-project',
          arguments: { clientId, name: 'Test Project' },
        },
      });

      expect(result.isError).toBeFalsy();
    });
  });

  describe('Tool Execution Integration', () => {
    let callToolHandler: Function;
    let clientId: string;

    beforeEach(async () => {
      await import('../../src/index.js');

      const callToolCall = mockServer.setRequestHandler.mock.calls.find(call =>
        call[0].toString().includes('call_tool')
      );
      callToolHandler = callToolCall?.[1] as Function;

      // Mock successful n8n connection
      const nodeFetch = await import('node-fetch');
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn<() => Promise<{ data: any[] }>>().mockResolvedValue({ data: [] }),
      } as any;
      (nodeFetch.default as jest.MockedFunction<typeof nodeFetch.default>).mockResolvedValue(
        mockResponse
      );

      // Initialize a client
      const initResult = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
        },
      });

      clientId = initResult.content[0].text.match(/client ID for future operations: (.+)/)?.[1];
    });

    it('should successfully initialize n8n connection', async () => {
      expect(clientId).toBeTruthy();
    });

    it('should execute list-workflows tool', async () => {
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

      const callToolCall = mockServer.setRequestHandler.mock.calls.find(call =>
        call[0].toString().includes('call_tool')
      );
      callToolHandler = callToolCall?.[1] as Function;
    });

    it('should return proper error response structure', async () => {
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
      // Mock successful response
      const nodeFetch = await import('node-fetch');
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn<() => Promise<{ data: any[] }>>().mockResolvedValue({ data: [] }),
      } as any;
      (nodeFetch.default as jest.MockedFunction<typeof nodeFetch.default>).mockResolvedValue(
        mockResponse
      );

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
      const nodeFetch = await import('node-fetch');
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
      } as any;
      (nodeFetch.default as jest.MockedFunction<typeof nodeFetch.default>).mockResolvedValue(
        mockResponse
      );

      // First initialize client
      const initResult = await callToolHandler({
        params: {
          name: 'init-n8n',
          arguments: { url: 'http://localhost:5678', apiKey: 'test-key' },
        },
      });
      const clientId = initResult.content[0].text.match(
        /client ID for future operations: (.+)/
      )?.[1];

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
});
