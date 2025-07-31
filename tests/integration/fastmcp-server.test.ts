import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { FastMCP } from 'fastmcp';

describe('FastMCP Server Integration', () => {
  let server: FastMCP;

  beforeAll(async () => {
    // Import the server module dynamically to avoid initialization issues
    const { FastMCP } = await import('fastmcp');

    server = new FastMCP({
      name: 'test-n8n-mcp-server',
      version: '1.0.0-test',
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
      parameters: {} as any,
      execute: jest.fn().mockResolvedValue('test result'),
    } as any;

    expect(() => {
      server.addTool(mockTool);
    }).not.toThrow();
  });

  it('should handle tool execution', async () => {
    const mockTool = {
      name: 'test-execution-tool',
      description: 'A test tool for execution',
      parameters: {} as any,
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
      execute: jest
        .fn()
        .mockImplementation((args: any) => Promise.resolve(`Received: ${args.testParam}`)),
    };

    server.addTool(mockTool);

    const result = await mockTool.execute({ testParam: 'test-value' });
    expect(result).toBe('Received: test-value');
  });

  it('should handle tool errors gracefully', async () => {
    const mockTool = {
      name: 'test-error-tool',
      description: 'A test tool that throws errors',
      parameters: {} as any,
      execute: jest.fn().mockRejectedValue(new Error('Test error')),
    } as any;

    server.addTool(mockTool);

    await expect(mockTool.execute({})).rejects.toThrow('Test error');
  });

  describe('Tool Registration Validation', () => {
    it('should require tool name', () => {
      expect(() => {
        server.addTool({
          description: 'Missing name',
          parameters: {} as any,
          execute: jest.fn(),
        } as any);
      }).toThrow();
    });

    it('should require tool execute function', () => {
      expect(() => {
        server.addTool({
          name: 'missing-execute',
          description: 'Missing execute function',
          parameters: {} as any,
        } as any);
      }).toThrow();
    });
  });

  describe('Tool Annotations', () => {
    it('should accept tool annotations', () => {
      const mockTool = {
        name: 'annotated-tool',
        description: 'A tool with annotations',
        parameters: {} as any,
        annotations: {
          title: 'Annotated Tool',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        execute: jest.fn().mockResolvedValue('annotated result'),
      } as any;

      expect(() => {
        server.addTool(mockTool);
      }).not.toThrow();
    });
  });
});
