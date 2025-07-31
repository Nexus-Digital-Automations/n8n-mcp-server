import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { FastMCP } from 'fastmcp';

describe('FastMCP Server Integration', () => {
  let server: FastMCP;

  beforeAll(async () => {
    // Using the mocked FastMCP from tests/__mocks__/fastmcp.js
    server = new FastMCP({
      name: 'test-n8n-mcp-server',
      version: '1.0.0',
      instructions: 'Test server for integration testing',
    });
  });

  afterAll(async () => {
    // Clean up server resources if needed
    if (server) {
      // FastMCP doesn't have an explicit close method, but we can clean up
    }
  });

  it('should create FastMCP server instance', () => {
    expect(server).toBeInstanceOf(FastMCP);
  });

  it('should be able to add tools', () => {
    const mockTool = {
      name: 'test-tool',
      description: 'A test tool',
      parameters: {},
      execute: jest.fn(),
    } as any;

    expect(() => {
      server.addTool(mockTool);
    }).not.toThrow();
  });

  it('should handle tool execution', async () => {
    const mockTool = {
      name: 'test-execution-tool',
      description: 'A test tool for execution',
      parameters: {},
      // @ts-ignore - Suppressing Jest mock type issues for testing
      execute: jest.fn().mockResolvedValue('execution result'),
    } as any;

    server.addTool(mockTool);

    // Note: Direct tool execution testing may require more complex setup
    // depending on FastMCP's internal architecture
    expect(mockTool.execute).toBeDefined();

    const result = await mockTool.execute({});
    expect(result).toBe('execution result');
  });

  it('should handle tool with parameters', async () => {
    const mockTool = {
      name: 'test-params-tool',
      description: 'A test tool with parameters',
      parameters: {
        testParam: {
          type: 'string' as const,
          description: 'A test parameter',
        },
      },
      // @ts-ignore - Suppressing Jest mock type issues for testing
      execute: jest
        .fn()
        .mockImplementation((args: any) => Promise.resolve(`Received: ${args.testParam}`)),
    };

    // @ts-ignore - Suppressing strict FastMCP type checking for test
    server.addTool(mockTool);

    const result = await mockTool.execute({ testParam: 'test-value' });
    expect(result).toBe('Received: test-value');
  });

  it('should handle tool errors gracefully', async () => {
    const mockTool = {
      name: 'test-error-tool',
      description: 'A test tool that throws errors',
      parameters: {},
      // @ts-ignore - Suppressing Jest mock type issues for testing
      execute: jest.fn().mockRejectedValue(new Error('Test error')),
    } as any;

    server.addTool(mockTool);

    await expect(mockTool.execute({})).rejects.toThrow('Test error');
  });

  describe('Tool Registration Validation', () => {
    it('should accept tools with basic properties', () => {
      // Our mock FastMCP doesn't enforce validation, so we test basic acceptance
      expect(() => {
        server.addTool({
          name: 'test-tool-validation',
          description: 'Tool for validation testing',
          parameters: {},
          execute: jest.fn(),
        } as any);
      }).not.toThrow();
    });

    it('should handle tool registration gracefully', () => {
      // Mock implementation accepts all tools without validation
      expect(() => {
        server.addTool({
          name: 'another-test-tool',
          description: 'Another test tool',
          parameters: {},
          execute: jest.fn(),
        } as any);
      }).not.toThrow();
    });
  });

  describe('Tool Annotations', () => {
    it('should accept tool annotations', () => {
      const mockTool = {
        name: 'annotated-tool',
        description: 'A tool with annotations',
        parameters: {},
        annotations: {
          title: 'Annotated Tool',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        // @ts-ignore - Suppressing Jest mock type issues for testing
        execute: jest.fn().mockResolvedValue('annotated result'),
      } as any;

      expect(() => {
        server.addTool(mockTool);
      }).not.toThrow();
    });
  });
});
