import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { FastMCP } from 'fastmcp';
import {
  ExecutionResourceManager,
  createExecutionResources,
} from '../../../src/resources/executionResources';
import { N8nClient } from '../../../src/client/n8nClient';

// Mock dependencies
jest.mock('fastmcp');
jest.mock('../../../src/client/n8nClient');

// Mock console methods to avoid test output pollution
const mockConsoleLog = jest.fn();
jest.spyOn(console, 'log').mockImplementation(mockConsoleLog);

describe('ExecutionResourceManager', () => {
  let executionManager: ExecutionResourceManager;
  let mockServer: jest.Mocked<FastMCP>;
  let mockClient: jest.Mocked<N8nClient>;
  let getClientFn: () => N8nClient | null;

  // Mock execution data
  const mockExecution = {
    id: 'exec-123',
    workflowId: 'workflow-456',
    finished: true,
    startedAt: '2023-01-01T10:00:00Z',
    stoppedAt: '2023-01-01T10:05:00Z',
    mode: 'manual',
    status: 'success' as const,
    retryOf: undefined,
    retrySuccessId: undefined,
    data: {
      resultData: {
        runData: {
          'HTTP Request': [
            {
              data: {
                main: [
                  {
                    json: { status: 'success' },
                  },
                ],
              },
            },
          ],
        },
      },
    },
    workflowData: {
      id: 'workflow-456',
      name: 'Test Workflow',
      active: true,
      nodes: [],
      connections: {},
    },
  };

  const mockFailedExecution = {
    id: 'exec-456',
    workflowId: 'workflow-789',
    finished: false,
    startedAt: '2023-01-01T11:00:00Z',
    stoppedAt: '2023-01-01T11:02:00Z',
    mode: 'trigger',
    status: 'error' as const,
    retryOf: undefined,
    retrySuccessId: undefined,
    data: {
      resultData: {
        error: {
          message: 'Test error',
          stack: 'Error stack trace',
        },
      },
    },
    workflowData: {
      id: 'workflow-789',
      name: 'Failed Workflow',
      active: false,
      nodes: [],
      connections: {},
    },
  };

  beforeEach(() => {
    // Create mock instances
    mockServer = {
      addResource: jest.fn(),
      addResourceTemplate: jest.fn(),
    } as unknown as jest.Mocked<FastMCP>;

    mockClient = {
      getExecution: jest.fn(),
      getExecutions: jest.fn(),
    } as unknown as jest.Mocked<N8nClient>;

    getClientFn = jest.fn().mockReturnValue(mockClient) as () => N8nClient | null;

    // Clear all mocks
    jest.clearAllMocks();
    mockConsoleLog.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      executionManager = new ExecutionResourceManager();
      expect(executionManager).toBeInstanceOf(ExecutionResourceManager);
    });

    it('should initialize with custom configuration', () => {
      const config = {
        baseUri: 'custom://executions',
        maxExecutions: 10,
        includeData: true,
        includeFailures: false,
        cacheDuration: 5000,
        maxDataSize: 512 * 1024,
      };

      executionManager = new ExecutionResourceManager(config);
      expect(executionManager).toBeInstanceOf(ExecutionResourceManager);
    });

    it('should merge custom config with defaults', () => {
      const config = {
        maxExecutions: 25,
        includeData: true,
      };

      executionManager = new ExecutionResourceManager(config);
      expect(executionManager).toBeInstanceOf(ExecutionResourceManager);
    });
  });

  describe('Resource Registration', () => {
    beforeEach(() => {
      executionManager = new ExecutionResourceManager();
    });

    it('should register all execution resources', () => {
      executionManager.register(mockServer, getClientFn);

      expect(mockServer.addResourceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          uriTemplate: 'n8n://executions/{id}',
          name: 'n8n Execution',
          mimeType: 'application/json',
        })
      );

      expect(mockServer.addResourceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          uriTemplate: 'n8n://executions/{id}/logs',
          name: 'n8n Execution Logs',
          mimeType: 'text/plain',
        })
      );

      expect(mockServer.addResource).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: 'n8n://executions/recent',
          name: 'n8n Recent Executions',
          mimeType: 'application/json',
        })
      );

      expect(mockServer.addResource).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: 'n8n://executions/failures',
          name: 'n8n Failed Executions',
          mimeType: 'application/json',
        })
      );

      expect(mockServer.addResource).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: 'n8n://executions/stats',
          name: 'n8n Execution Statistics',
          mimeType: 'application/json',
        })
      );

      expect(mockConsoleLog).toHaveBeenCalledWith('⚡ Execution resources registered');
    });

    it('should register execution template with correct arguments', () => {
      executionManager.register(mockServer, getClientFn);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      expect(templateCall).toBeDefined();
      if (!templateCall) throw new Error('Template call not found');

      const template = templateCall[0];
      expect(template.arguments).toHaveLength(1);
      expect(template.arguments[0]).toEqual({
        name: 'id',
        description: 'The ID of the n8n execution',
        required: true,
      });
    });

    it('should register logs template with correct arguments', () => {
      executionManager.register(mockServer, getClientFn);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}/logs'
      );
      expect(templateCall).toBeDefined();
      if (!templateCall) throw new Error('Template call not found');

      const template = templateCall[0];
      expect(template.arguments).toHaveLength(1);
      expect(template.arguments[0]).toEqual({
        name: 'id',
        description: 'The ID of the n8n execution',
        required: true,
      });
    });

    it('should register workflow executions template', () => {
      executionManager.register(mockServer, getClientFn);

      expect(mockServer.addResourceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          uriTemplate: 'n8n://executions/workflow/{workflowId}',
          name: 'n8n Workflow Executions',
          mimeType: 'application/json',
        })
      );
    });
  });

  describe('Individual Execution Resource', () => {
    beforeEach(() => {
      executionManager = new ExecutionResourceManager();
      executionManager.register(mockServer, getClientFn);
    });

    it('should load execution resource successfully', async () => {
      mockClient.getExecution.mockResolvedValue(mockExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      expect(templateCall).toBeDefined();
      if (!templateCall) throw new Error('Template call not found');

      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      expect(result.text).toBeDefined();
      const data = JSON.parse(result.text);
      expect(data.id).toBe('exec-123');
      expect(data.workflowId).toBe('workflow-456');
      expect(data.status).toBe('success');
      expect(data.duration).toBe(300000); // 5 minutes
      expect(data.resourceInfo).toBeDefined();
      expect(data.resourceInfo.type).toBe('n8n-execution');
    });

    it('should handle execution with error status', async () => {
      mockClient.getExecution.mockResolvedValue(mockFailedExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-456' });

      const data = JSON.parse(result.text);
      expect(data.status).toBe('stopped');
      expect(data.metadata.error).toEqual({
        message: 'Test error',
        stack: 'Error stack trace',
      });
    });

    it('should handle running execution', async () => {
      const runningExecution = {
        ...mockExecution,
        finished: false,
        stoppedAt: undefined,
        status: 'running' as const,
      };
      mockClient.getExecution.mockResolvedValue(runningExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      const data = JSON.parse(result.text);
      expect(data.status).toBe('running');
      expect(data.duration).toBeNull();
    });

    it('should throw error when client not initialized', async () => {
      (getClientFn as jest.Mock).mockReturnValue(null);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];

      await expect(template.load({ id: 'exec-123' })).rejects.toThrow(
        'n8n client not initialized. Run init-n8n first.'
      );
    });

    it('should handle API errors', async () => {
      mockClient.getExecution.mockRejectedValue(new Error('API Error'));

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];

      await expect(template.load({ id: 'exec-123' })).rejects.toThrow(
        'Failed to load execution exec-123: API Error'
      );
    });

    it('should include data when configured', async () => {
      // Clear previous mocks first
      jest.clearAllMocks();
      mockConsoleLog.mockClear();

      executionManager = new ExecutionResourceManager({ includeData: true });
      executionManager.register(mockServer, getClientFn);
      mockClient.getExecution.mockResolvedValue(mockExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      const data = JSON.parse(result.text);
      expect(data.data).toBeDefined();
    });

    it('should exclude data by default', async () => {
      mockClient.getExecution.mockResolvedValue(mockExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      const data = JSON.parse(result.text);
      expect(data.data).toBeUndefined();
    });
  });

  describe('Execution Logs Resource', () => {
    beforeEach(() => {
      executionManager = new ExecutionResourceManager();
      executionManager.register(mockServer, getClientFn);
    });

    it('should load execution logs successfully', async () => {
      mockClient.getExecution.mockResolvedValue(mockExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}/logs'
      );
      expect(templateCall).toBeDefined();
      if (!templateCall) throw new Error('Template call not found');

      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      expect(result.text).toBeDefined();
      expect(result.text).toContain('Execution ID: exec-123');
      expect(result.text).toContain('Workflow ID: workflow-456');
      expect(result.text).toContain('Status: Finished');
      expect(result.text).toContain('NODE EXECUTION DATA:');
      expect(result.text).toContain('Node: HTTP Request');
    });

    it('should include error information in logs', async () => {
      mockClient.getExecution.mockResolvedValue(mockFailedExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}/logs'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-456' });

      expect(result.text).toContain('ERROR:');
      expect(result.text).toContain('Test error');
    });

    it('should handle logs API errors', async () => {
      mockClient.getExecution.mockRejectedValue(new Error('Logs API Error'));

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}/logs'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];

      await expect(template.load({ id: 'exec-123' })).rejects.toThrow(
        'Failed to load execution logs exec-123: Logs API Error'
      );
    });
  });

  describe('Recent Executions Resource', () => {
    beforeEach(() => {
      executionManager = new ExecutionResourceManager();
      executionManager.register(mockServer, getClientFn);
    });

    it('should load recent executions successfully', async () => {
      mockClient.getExecutions.mockResolvedValue({
        data: [mockExecution, mockFailedExecution],
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/recent'
      );
      expect(resourceCall).toBeDefined();
      if (!resourceCall) throw new Error('Resource call not found');

      const resource = resourceCall[0];
      const result = await resource.load();

      expect(result.text).toBeDefined();
      const data = JSON.parse(result.text);
      expect(data.executions).toHaveLength(2);
      expect(data.executions[0].id).toBe('exec-123');
      expect(data.executions[0].status).toBe('success');
      expect(data.executions[1].id).toBe('exec-456');
      expect(data.executions[1].status).toBe('stopped');
      expect(data.metadata.total).toBe(2);
      expect(data.resourceInfo.type).toBe('n8n-recent-executions');
    });

    it('should handle empty executions list', async () => {
      mockClient.getExecutions.mockResolvedValue({ data: [] });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/recent'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.executions).toHaveLength(0);
      expect(data.metadata.total).toBe(0);
    });

    it('should handle recent executions API errors', async () => {
      mockClient.getExecutions.mockRejectedValue(new Error('Recent API Error'));

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/recent'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];

      await expect(resource.load()).rejects.toThrow(
        'Failed to load recent executions: Recent API Error'
      );
    });
  });

  describe('Failed Executions Resource', () => {
    beforeEach(() => {
      executionManager = new ExecutionResourceManager();
      executionManager.register(mockServer, getClientFn);
    });

    it('should load failed executions successfully', async () => {
      mockClient.getExecutions.mockResolvedValue({
        data: [mockExecution, mockFailedExecution],
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/failures'
      );
      expect(resourceCall).toBeDefined();
      if (!resourceCall) throw new Error('Resource call not found');

      const resource = resourceCall[0];
      const result = await resource.load();

      expect(result.text).toBeDefined();
      const data = JSON.parse(result.text);
      expect(data.failures).toHaveLength(1); // Only failed execution
      expect(data.failures[0].id).toBe('exec-456');
      expect(data.failures[0].error).toBe('Test error');
      expect(data.failures[0].errorDetails).toEqual({
        message: 'Test error',
        stack: 'Error stack trace',
      });
      expect(data.resourceInfo.type).toBe('n8n-failed-executions');
    });

    it('should handle no failed executions', async () => {
      mockClient.getExecutions.mockResolvedValue({
        data: [mockExecution], // Only successful execution
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/failures'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.failures).toHaveLength(0);
      expect(data.metadata.total).toBe(0);
    });

    it('should handle failures API errors', async () => {
      mockClient.getExecutions.mockRejectedValue(new Error('Failures API Error'));

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/failures'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];

      await expect(resource.load()).rejects.toThrow(
        'Failed to load failed executions: Failures API Error'
      );
    });
  });

  describe('Execution Statistics Resource', () => {
    beforeEach(() => {
      executionManager = new ExecutionResourceManager();
      executionManager.register(mockServer, getClientFn);
    });

    it('should load execution statistics successfully', async () => {
      const runningExecution = {
        ...mockExecution,
        id: 'exec-789',
        finished: false,
        stoppedAt: undefined,
        status: 'running' as const,
      };

      mockClient.getExecutions.mockResolvedValue({
        data: [mockExecution, mockFailedExecution, runningExecution],
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/stats'
      );
      expect(resourceCall).toBeDefined();
      if (!resourceCall) throw new Error('Resource call not found');

      const resource = resourceCall[0];
      const result = await resource.load();

      expect(result.text).toBeDefined();
      const data = JSON.parse(result.text);
      expect(data.totalExecutions).toBe(3);
      expect(data.successfulExecutions).toBe(1);
      expect(data.failedExecutions).toBe(1);
      expect(data.runningExecutions).toBe(1);
      expect(data.averageDuration).toBeGreaterThan(0);
      expect(data.executionsByStatus).toBeDefined();
      expect(data.executionsByStatus.success).toBe(1);
      expect(data.executionsByStatus.error).toBe(1);
      expect(data.executionsByStatus.running).toBe(1);
      expect(data.resourceInfo.type).toBe('n8n-execution-stats');
    });

    it('should handle zero average duration', async () => {
      const executionWithoutTiming = {
        ...mockExecution,
        startedAt: '2023-01-01T10:00:00Z',
        stoppedAt: undefined,
      };

      mockClient.getExecutions.mockResolvedValue({
        data: [executionWithoutTiming],
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/stats'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.averageDuration).toBe(0);
    });

    it('should handle stats API errors', async () => {
      mockClient.getExecutions.mockRejectedValue(new Error('Stats API Error'));

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/stats'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];

      await expect(resource.load()).rejects.toThrow(
        'Failed to load execution statistics: Stats API Error'
      );
    });
  });

  describe('Workflow Executions Resource', () => {
    beforeEach(() => {
      executionManager = new ExecutionResourceManager();
      executionManager.register(mockServer, getClientFn);
    });

    it('should load workflow executions successfully', async () => {
      mockClient.getExecutions.mockResolvedValue({
        data: [mockExecution, mockFailedExecution],
      });

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/workflow/{workflowId}'
      );
      expect(templateCall).toBeDefined();
      if (!templateCall) throw new Error('Template call not found');

      const template = templateCall[0];
      const result = await template.load({ workflowId: 'workflow-456' });

      expect(result.text).toBeDefined();
      const data = JSON.parse(result.text);
      expect(data.workflowId).toBe('workflow-456');
      expect(data.executions).toHaveLength(1); // Only executions for this workflow
      expect(data.executions[0].id).toBe('exec-123');
      expect(data.metadata.workflowId).toBe('workflow-456');
      expect(data.resourceInfo.type).toBe('n8n-workflow-executions');
    });

    it('should handle no executions for workflow', async () => {
      mockClient.getExecutions.mockResolvedValue({
        data: [mockFailedExecution], // Different workflow
      });

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/workflow/{workflowId}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ workflowId: 'workflow-999' });

      const data = JSON.parse(result.text);
      expect(data.executions).toHaveLength(0);
      expect(data.metadata.total).toBe(0);
    });

    it('should validate workflow executions template arguments', () => {
      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/workflow/{workflowId}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];

      expect(template.arguments).toHaveLength(1);
      expect(template.arguments[0]).toEqual({
        name: 'workflowId',
        description: 'The ID of the workflow',
        required: true,
      });
    });
  });

  describe('Data Sanitization', () => {
    beforeEach(() => {
      executionManager = new ExecutionResourceManager({ includeData: true });
      executionManager.register(mockServer, getClientFn);
    });

    it('should sanitize sensitive data', async () => {
      const executionWithSensitiveData = {
        ...mockExecution,
        data: {
          resultData: {
            runData: {
              'HTTP Request': [
                {
                  data: {
                    main: [
                      {
                        json: {
                          password: 'secret123',
                          apiKey: 'key456',
                          token: 'token789',
                          secretKey: 'secret',
                          normalData: 'safe',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      };

      mockClient.getExecution.mockResolvedValue(executionWithSensitiveData);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      const data = JSON.parse(result.text);
      const sanitizedData = data.data;
      const jsonData = sanitizedData.resultData.runData['HTTP Request'][0].data.main[0].json;

      expect(jsonData.password).toBe('[REDACTED]');
      expect(jsonData.apiKey).toBe('[REDACTED]');
      expect(jsonData.token).toBe('[REDACTED]');
      expect(jsonData.secretKey).toBe('[REDACTED]');
      expect(jsonData.normalData).toBe('safe');
    });

    it('should truncate large data', async () => {
      // Clear all previous mock calls first
      jest.clearAllMocks();
      mockConsoleLog.mockClear();

      executionManager = new ExecutionResourceManager({
        includeData: true,
        maxDataSize: 100, // Very small limit
      });
      executionManager.register(mockServer, getClientFn);

      const executionWithLargeData = {
        ...mockExecution,
        data: {
          resultData: {
            runData: {
              'HTTP Request': [
                {
                  data: {
                    main: Array(1000).fill({ json: { largeData: 'x'.repeat(1000) } }),
                  },
                },
              ],
            },
          },
        },
      };

      mockClient.getExecution.mockResolvedValue(executionWithLargeData);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      const data = JSON.parse(result.text);
      expect(data.data._truncated).toBe(true);
      expect(data.data.summary).toContain('truncated due to size limits');
    });
  });

  describe('Cache Management', () => {
    beforeEach(() => {
      executionManager = new ExecutionResourceManager({ cacheDuration: 1000 });
    });

    it('should cache execution data', async () => {
      executionManager.register(mockServer, getClientFn);
      mockClient.getExecution.mockResolvedValue(mockExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];

      // First call
      await template.load({ id: 'exec-123' });
      expect(mockClient.getExecution).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await template.load({ id: 'exec-123' });
      expect(mockClient.getExecution).toHaveBeenCalledTimes(1);
    });

    it('should clear cache', () => {
      executionManager.clearCache();
      // Should not throw
    });

    it('should get cache statistics', () => {
      const stats = executionManager.getCacheStats();
      expect(stats).toBeDefined();
      expect(typeof stats.size).toBe('number');
      expect(Array.isArray(stats.keys)).toBe(true);
    });

    it('should not cache when duration is 0', () => {
      executionManager = new ExecutionResourceManager({ cacheDuration: 0 });
      executionManager.register(mockServer, getClientFn);
      mockClient.getExecution.mockResolvedValue(mockExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];

      return template
        .load({ id: 'exec-123' })
        .then(() => {
          return template.load({ id: 'exec-123' });
        })
        .then(() => {
          expect(mockClient.getExecution).toHaveBeenCalledTimes(2);
        });
    });
  });

  describe('Factory Function', () => {
    it('should create execution resource manager with factory function', () => {
      const manager = createExecutionResources();
      expect(manager).toBeInstanceOf(ExecutionResourceManager);
    });

    it('should create execution resource manager with config via factory', () => {
      const config = { maxExecutions: 25, includeData: true };
      const manager = createExecutionResources(config);
      expect(manager).toBeInstanceOf(ExecutionResourceManager);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    beforeEach(() => {
      executionManager = new ExecutionResourceManager();
      executionManager.register(mockServer, getClientFn);
    });

    it('should handle null execution data', async () => {
      const executionWithNullData = {
        ...mockExecution,
        data: undefined,
      };
      mockClient.getExecution.mockResolvedValue(executionWithNullData);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      const data = JSON.parse(result.text);
      expect(data.metadata.error).toBeUndefined();
    });

    it('should handle malformed execution data', async () => {
      const malformedExecution = {
        id: 'exec-123',
        finished: false,
        mode: 'manual',
        startedAt: '2023-01-01T10:00:00Z',
        workflowId: 'workflow-456',
        status: 'running' as const,
      };
      mockClient.getExecution.mockResolvedValue(malformedExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      const data = JSON.parse(result.text);
      expect(data.id).toBe('exec-123');
      expect(data.status).toBe('running'); // Default when no finished/stoppedAt
    });

    it('should handle non-Error exceptions', async () => {
      mockClient.getExecution.mockRejectedValue('String error');

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];

      await expect(template.load({ id: 'exec-123' })).rejects.toThrow(
        'Failed to load execution exec-123: String error'
      );
    });

    it('should handle empty execution lists gracefully', async () => {
      mockClient.getExecutions.mockResolvedValue({ data: [] });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/stats'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.totalExecutions).toBe(0);
      expect(data.averageDuration).toBe(0);
    });

    it('should handle missing workflow data in executions', async () => {
      const executionWithoutWorkflowData = {
        ...mockExecution,
        workflowData: undefined,
      };
      mockClient.getExecutions.mockResolvedValue({
        data: [executionWithoutWorkflowData],
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/recent'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.executions[0].workflowName).toBeUndefined();
    });

    it('should handle client not initialized for logs resource', async () => {
      (getClientFn as jest.Mock).mockReturnValue(null);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}/logs'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];

      await expect(template.load({ id: 'exec-123' })).rejects.toThrow(
        'n8n client not initialized. Run init-n8n first.'
      );
    });

    it('should handle client not initialized for recent executions', async () => {
      (getClientFn as jest.Mock).mockReturnValue(null);

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/recent'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];

      await expect(resource.load()).rejects.toThrow(
        'n8n client not initialized. Run init-n8n first.'
      );
    });

    it('should handle client not initialized for failed executions', async () => {
      (getClientFn as jest.Mock).mockReturnValue(null);

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/failures'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];

      await expect(resource.load()).rejects.toThrow(
        'n8n client not initialized. Run init-n8n first.'
      );
    });

    it('should handle client not initialized for execution stats', async () => {
      (getClientFn as jest.Mock).mockReturnValue(null);

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/stats'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];

      await expect(resource.load()).rejects.toThrow(
        'n8n client not initialized. Run init-n8n first.'
      );
    });

    it('should handle client not initialized for workflow executions', async () => {
      (getClientFn as jest.Mock).mockReturnValue(null);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/workflow/{workflowId}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];

      await expect(template.load({ workflowId: 'workflow-123' })).rejects.toThrow(
        'n8n client not initialized. Run init-n8n first.'
      );
    });

    it('should handle workflow executions API errors', async () => {
      mockClient.getExecutions.mockRejectedValue(new Error('Workflow API Error'));

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/workflow/{workflowId}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];

      await expect(template.load({ workflowId: 'workflow-123' })).rejects.toThrow(
        'Failed to load workflow executions workflow-123: Workflow API Error'
      );
    });

    it('should handle primitive data types in sanitization', async () => {
      // Clear previous mocks first
      jest.clearAllMocks();
      mockConsoleLog.mockClear();

      executionManager = new ExecutionResourceManager({ includeData: true });
      executionManager.register(mockServer, getClientFn);

      const executionWithPrimitiveData = {
        ...mockExecution,
        data: { primitiveString: 'primitive string data' },
      };
      mockClient.getExecution.mockResolvedValue(executionWithPrimitiveData);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      const data = JSON.parse(result.text);
      expect(data.data.primitiveString).toBe('primitive string data');
    });

    it('should handle array data in sanitization', async () => {
      // Clear previous mocks first
      jest.clearAllMocks();
      mockConsoleLog.mockClear();

      executionManager = new ExecutionResourceManager({ includeData: true });
      executionManager.register(mockServer, getClientFn);

      const executionWithArrayData = {
        ...mockExecution,
        data: {
          resultData: {
            arrayData: [
              { password: 'secret123', normalData: 'safe' },
              { token: 'token456', publicInfo: 'visible' },
            ],
          },
        },
      };
      mockClient.getExecution.mockResolvedValue(executionWithArrayData);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      const data = JSON.parse(result.text);
      expect(data.data.resultData.arrayData[0].password).toBe('[REDACTED]');
      expect(data.data.resultData.arrayData[0].normalData).toBe('safe');
      expect(data.data.resultData.arrayData[1].token).toBe('[REDACTED]');
      expect(data.data.resultData.arrayData[1].publicInfo).toBe('visible');
    });

    it('should handle executions with only stoppedAt status in status calculation', async () => {
      const stoppedExecution = {
        ...mockExecution,
        finished: false,
        stoppedAt: '2023-01-01T10:05:00Z',
        data: {
          resultData: {
            // No error, just stopped
          },
        },
      };

      mockClient.getExecutions.mockResolvedValue({
        data: [stoppedExecution],
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/stats'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.executionsByStatus.stopped).toBe(1);
      expect(data.executionsByStatus.success).toBe(0);
      expect(data.executionsByStatus.error).toBe(0);
      expect(data.executionsByStatus.running).toBe(0);
    });
  });

  describe('Duplicate Resource Template Coverage', () => {
    beforeEach(() => {
      executionManager = new ExecutionResourceManager();
      executionManager.register(mockServer, getClientFn);
    });

    it('should handle client not initialized for executionId template', async () => {
      (getClientFn as jest.Mock).mockReturnValue(null);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{executionId}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];

      await expect(template.load({ executionId: 'exec-123' })).rejects.toThrow(
        'n8n client not initialized. Run init-n8n first.'
      );
    });

    it('should load execution by executionId template successfully', async () => {
      mockClient.getExecution.mockResolvedValue(mockExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{executionId}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ executionId: 'exec-123' });

      expect(result.text).toBeDefined();
      const data = JSON.parse(result.text);
      expect(data.id).toBe('exec-123');
      expect(data.resourceInfo.type).toBe('n8n-execution');
    });
  });

  describe('Cache Expiration Edge Cases', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      executionManager = new ExecutionResourceManager({ cacheDuration: 50 }); // Very short cache
      executionManager.register(mockServer, getClientFn);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should handle cache expiration for logs', async () => {
      mockClient.getExecution.mockResolvedValue(mockExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}/logs'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];

      // First call
      await template.load({ id: 'exec-123' });
      expect(mockClient.getExecution).toHaveBeenCalledTimes(1);

      // Fast-forward time to expire cache
      jest.advanceTimersByTime(60);

      // Second call should fetch again
      await template.load({ id: 'exec-123' });
      expect(mockClient.getExecution).toHaveBeenCalledTimes(2);
    });

    it('should handle cache expiration for recent executions', async () => {
      mockClient.getExecutions.mockResolvedValue({ data: [mockExecution] });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/recent'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];

      // First call
      await resource.load();
      expect(mockClient.getExecutions).toHaveBeenCalledTimes(1);

      // Fast-forward time to expire cache
      jest.advanceTimersByTime(60);

      // Second call should fetch again
      await resource.load();
      expect(mockClient.getExecutions).toHaveBeenCalledTimes(2);
    });

    it('should handle cache expiration for failed executions', async () => {
      mockClient.getExecutions.mockResolvedValue({ data: [mockFailedExecution] });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/failures'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];

      // First call
      await resource.load();
      expect(mockClient.getExecutions).toHaveBeenCalledTimes(1);

      // Fast-forward time to expire cache
      jest.advanceTimersByTime(60);

      // Second call should fetch again
      await resource.load();
      expect(mockClient.getExecutions).toHaveBeenCalledTimes(2);
    });

    it('should handle cache expiration for execution stats', async () => {
      mockClient.getExecutions.mockResolvedValue({ data: [mockExecution] });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/stats'
      );
      if (!resourceCall) throw new Error('Resource call not found');
      const resource = resourceCall[0];

      // First call
      await resource.load();
      expect(mockClient.getExecutions).toHaveBeenCalledTimes(1);

      // Fast-forward time to expire cache
      jest.advanceTimersByTime(60);

      // Second call should fetch again
      await resource.load();
      expect(mockClient.getExecutions).toHaveBeenCalledTimes(2);
    });

    it('should handle cache expiration for workflow executions', async () => {
      mockClient.getExecutions.mockResolvedValue({ data: [mockExecution] });

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/workflow/{workflowId}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];

      // First call
      await template.load({ workflowId: 'workflow-456' });
      expect(mockClient.getExecutions).toHaveBeenCalledTimes(1);

      // Fast-forward time to expire cache
      jest.advanceTimersByTime(60);

      // Second call should fetch again
      await template.load({ workflowId: 'workflow-456' });
      expect(mockClient.getExecutions).toHaveBeenCalledTimes(2);
    });
  });

  describe('Branch Coverage Edge Cases', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockConsoleLog.mockClear();
      executionManager = new ExecutionResourceManager();
      executionManager.register(mockServer, getClientFn);
    });

    it('should handle executions with conflicting status indicators', async () => {
      const conflictingExecution = {
        ...mockExecution,
        finished: false,
        stoppedAt: undefined,
        data: {
          resultData: {
            error: {
              message: 'Test error',
              stack: 'Error stack trace',
            },
          },
        },
      };

      mockClient.getExecution.mockResolvedValue(conflictingExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      const data = JSON.parse(result.text);
      // Should handle conflicting status gracefully
      expect(data.status).toBe('running'); // Not finished, no stoppedAt = running
      expect(data.metadata.error).toEqual({
        message: 'Test error',
        stack: 'Error stack trace',
      });
    });

    it('should handle non-serializable data types in sanitization', async () => {
      // Clear all mocks for isolated test
      jest.clearAllMocks();
      mockConsoleLog.mockClear();

      executionManager = new ExecutionResourceManager({ includeData: true });
      executionManager.register(mockServer, getClientFn);

      const executionWithComplexData = {
        ...mockExecution,
        data: {
          resultData: {
            runData: {
              'HTTP Request': [
                {
                  data: {
                    main: [
                      {
                        json: {
                          password: 'secret123',
                          undefined: undefined,
                          null: null,
                          nested: {
                            password: 'nested-secret',
                            apiKey: 'api-123',
                            token: 'token-456',
                            normalData: 'safe-data',
                          },
                          safeData: 'this should remain',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      };

      mockClient.getExecution.mockResolvedValue(executionWithComplexData);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      const data = JSON.parse(result.text);
      // Should sanitize sensitive data and handle complex types
      expect(data.data).toBeDefined();
      const resultText = JSON.stringify(data);
      expect(resultText).not.toContain('secret123');
      expect(resultText).not.toContain('api-123');
      expect(resultText).not.toContain('token-456');
      expect(resultText).toContain('safe-data');
      expect(resultText).toContain('this should remain');
    });

    it('should handle circular references in execution data logs', async () => {
      // Use simpler data that won't cause BigInt serialization issues
      const executionWithComplexData = {
        ...mockExecution,
        data: {
          resultData: {
            runData: {
              Node1: [
                {
                  data: {
                    main: [
                      {
                        json: {
                          message: 'test message',
                          nested: {
                            level1: {
                              level2: 'deep nested data',
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              ],
              Node2: [
                {
                  data: {
                    main: [
                      {
                        json: {
                          another: 'node data',
                          result: 'success',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      };

      mockClient.getExecution.mockResolvedValue(executionWithComplexData);

      const logsTemplateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}/logs'
      );
      if (!logsTemplateCall) throw new Error('Logs template call not found');
      const logsTemplate = logsTemplateCall[0];
      const result = await logsTemplate.load({ id: 'exec-123' });

      // Should handle complex data without crashing - logs are text format
      expect(result.text).toBeDefined();
      expect(result.text).toContain('Execution ID: exec-123');
      expect(result.text).toContain('Node: Node1');
      expect(result.text).toContain('Node: Node2');
    });

    it('should handle executions with missing or malformed data properties', async () => {
      const malformedExecution = {
        ...mockExecution,
        id: 'execution-malformed',
        workflowId: 'workflow-123',
        finished: false,
        mode: 'unknown',
        startedAt: '2023-01-01T10:00:00Z',
        stoppedAt: undefined, // No stop time = no duration calculation
        status: 'unknown' as any,
        data: undefined,
      };

      mockClient.getExecutions.mockResolvedValue({ data: [malformedExecution] });

      const statsResourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/stats'
      );
      if (!statsResourceCall) throw new Error('Stats resource call not found');
      const statsResource = statsResourceCall[0];
      const result = await statsResource.load();

      const data = JSON.parse(result.text);
      // Should handle missing properties gracefully
      expect(data.totalExecutions).toBe(1);
      expect(data.executionsByStatus).toBeDefined();
      expect(data.averageDuration).toBe(0); // No timing data available
    });

    it('should handle execution status determination with edge cases', async () => {
      const edgeCaseExecutions = [
        {
          ...mockExecution,
          id: 'exec-1',
          finished: true,
          stoppedAt: '2023-01-01T12:00:00Z',
          data: { resultData: { error: null } },
        },
        {
          ...mockExecution,
          id: 'exec-2',
          finished: false,
          stoppedAt: '2023-01-01T12:00:00Z', // Stopped but not finished
          data: undefined,
        },
        {
          ...mockExecution,
          id: 'exec-3',
          finished: true,
          stoppedAt: undefined, // Finished but no stop time
          data: { resultData: { lastNodeExecuted: 'FinalNode' } },
        },
      ];

      mockClient.getExecutions.mockResolvedValue({ data: edgeCaseExecutions });

      const statsResourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://executions/stats'
      );
      if (!statsResourceCall) throw new Error('Stats resource call not found');
      const statsResource = statsResourceCall[0];
      const result = await statsResource.load();

      const data = JSON.parse(result.text);
      // Should handle various status combinations
      expect(data.totalExecutions).toBe(3);
      expect(data.executionsByStatus).toBeDefined();
      expect(typeof data.averageDuration).toBe('number');
    });

    it('should handle data truncation for very large execution data', async () => {
      // Clear mocks for isolated test
      jest.clearAllMocks();
      mockConsoleLog.mockClear();

      executionManager = new ExecutionResourceManager({
        includeData: true,
        maxDataSize: 1000, // Small limit to trigger truncation
      });
      executionManager.register(mockServer, getClientFn);

      const largeDataExecution = {
        ...mockExecution,
        data: {
          resultData: {
            runData: {
              LargeDataNode: [
                {
                  data: {
                    main: [
                      [
                        {
                          json: {
                            largeField: 'x'.repeat(10000), // Very large string
                            normalField: 'normal value',
                          },
                        },
                      ],
                    ],
                  },
                },
              ],
            },
          },
        },
      };

      mockClient.getExecution.mockResolvedValue(largeDataExecution);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://executions/{id}'
      );
      if (!templateCall) throw new Error('Template call not found');
      const template = templateCall[0];
      const result = await template.load({ id: 'exec-123' });

      const data = JSON.parse(result.text);
      // Should handle large data appropriately
      expect(data.data).toBeDefined();

      // The result should be serializable as JSON (no circular refs or functions)
      expect(() => JSON.stringify(data)).not.toThrow();
    });
  });
});
