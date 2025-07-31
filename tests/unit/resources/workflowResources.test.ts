import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { FastMCP } from 'fastmcp';
import {
  WorkflowResourceManager,
  createWorkflowResources,
} from '../../../src/resources/workflowResources';
import { N8nClient } from '../../../src/client/n8nClient';

// Mock dependencies
jest.mock('fastmcp');
jest.mock('../../../src/client/n8nClient');

// Mock console methods to avoid test output pollution
const mockConsoleLog = jest.fn();
jest.spyOn(console, 'log').mockImplementation(mockConsoleLog);

describe('WorkflowResourceManager', () => {
  let workflowManager: WorkflowResourceManager;
  let mockServer: jest.Mocked<FastMCP>;
  let mockClient: jest.Mocked<N8nClient>;
  let getClientFn: () => N8nClient | null;

  // Mock workflow data
  const mockWorkflow = {
    id: 'workflow-123',
    name: 'Test Workflow',
    active: true,
    tags: ['test', 'automation'],
    createdAt: '2023-01-01T10:00:00Z',
    updatedAt: '2023-01-01T12:00:00Z',
    nodes: [
      { id: 'node1', type: 'n8n-nodes-base.httpRequest', name: 'HTTP Request' },
      { id: 'node2', type: 'n8n-nodes-base.code', name: 'Code' },
    ] as Array<Record<string, unknown>>,
    connections: {
      'HTTP Request': {
        main: [
          [
            {
              node: 'Code',
              type: 'main',
              index: 0,
            },
          ],
        ],
      },
    },
  };

  const mockInactiveWorkflow = {
    id: 'workflow-456',
    name: 'Inactive Workflow',
    active: false,
    tags: ['draft'],
    createdAt: '2023-01-02T10:00:00Z',
    updatedAt: '2023-01-02T11:00:00Z',
    nodes: [{ id: 'node3', type: 'n8n-nodes-base.webhook', name: 'Webhook' }] as Array<
      Record<string, unknown>
    >,
    connections: {},
  };

  beforeEach(() => {
    // Create mock instances
    mockServer = {
      addResource: jest.fn(),
      addResourceTemplate: jest.fn(),
    } as unknown as jest.Mocked<FastMCP>;

    mockClient = {
      getWorkflow: jest.fn(),
      getWorkflows: jest.fn(),
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
      workflowManager = new WorkflowResourceManager();
      expect(workflowManager).toBeInstanceOf(WorkflowResourceManager);
    });

    it('should initialize with custom configuration', () => {
      const config = {
        baseUri: 'custom://workflows',
        maxWorkflows: 25,
        includeInactive: false,
        includeExecutions: true,
        cacheDuration: 10000,
      };

      workflowManager = new WorkflowResourceManager(config);
      expect(workflowManager).toBeInstanceOf(WorkflowResourceManager);
    });

    it('should merge custom config with defaults', () => {
      const config = {
        maxWorkflows: 200,
        includeExecutions: true,
      };

      workflowManager = new WorkflowResourceManager(config);
      expect(workflowManager).toBeInstanceOf(WorkflowResourceManager);
    });
  });

  describe('Resource Registration', () => {
    beforeEach(() => {
      workflowManager = new WorkflowResourceManager();
    });

    it('should register all workflow resources', () => {
      workflowManager.register(mockServer, getClientFn);

      expect(mockServer.addResourceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          uriTemplate: 'n8n://workflows/{id}',
          name: 'n8n Workflow',
          mimeType: 'application/json',
        })
      );

      expect(mockServer.addResourceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          uriTemplate: 'n8n://workflows/{workflowId}',
          name: 'n8n Workflow by ID',
          mimeType: 'application/json',
        })
      );

      expect(mockServer.addResource).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: 'n8n://workflows/list',
          name: 'n8n Workflow List',
          mimeType: 'application/json',
        })
      );

      expect(mockServer.addResource).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: 'n8n://workflows/active',
          name: 'n8n Active Workflows',
          mimeType: 'application/json',
        })
      );

      expect(mockServer.addResource).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: 'n8n://workflows/stats',
          name: 'n8n Workflow Statistics',
          mimeType: 'application/json',
        })
      );

      expect(mockConsoleLog).toHaveBeenCalledWith('📄 Workflow resources registered');
    });

    it('should register workflow template with correct arguments', () => {
      workflowManager.register(mockServer, getClientFn);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{id}'
      );
      expect(templateCall).toBeDefined();
      if (!templateCall) throw new Error('Template call not found');

      const template = templateCall[0];
      expect(template.arguments).toHaveLength(1);
      expect(template.arguments[0]).toEqual({
        name: 'id',
        description: 'The ID of the n8n workflow',
        required: true,
      });
    });

    it('should register duplicate workflow template with workflowId parameter', () => {
      workflowManager.register(mockServer, getClientFn);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{workflowId}'
      );
      expect(templateCall).toBeDefined();
      if (!templateCall) throw new Error('Template call not found');

      const template = templateCall[0];
      expect(template.arguments).toHaveLength(1);
      expect(template.arguments[0]).toEqual({
        name: 'workflowId',
        description: 'The ID of the n8n workflow',
        required: true,
      });
    });
  });

  describe('Individual Workflow Resource', () => {
    beforeEach(() => {
      workflowManager = new WorkflowResourceManager();
      workflowManager.register(mockServer, getClientFn);
    });

    it('should load workflow resource successfully', async () => {
      mockClient.getWorkflow.mockResolvedValue(mockWorkflow);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{id}'
      );
      expect(templateCall).toBeDefined();
      if (!templateCall) throw new Error('Template call not found');

      const template = templateCall[0];
      const result = await template.load({ id: 'workflow-123' });

      expect(result.text).toBeDefined();
      const data = JSON.parse(result.text);
      expect(data.id).toBe('workflow-123');
      expect(data.name).toBe('Test Workflow');
      expect(data.active).toBe(true);
      expect(data.metadata).toBeDefined();
      expect(data.metadata.id).toBe('workflow-123');
      expect(data.metadata.nodeCount).toBe(2);
      expect(data.metadata.connectionCount).toBe(1);
      expect(data.resourceInfo).toBeDefined();
      expect(data.resourceInfo.type).toBe('n8n-workflow');
    });

    it('should handle workflow with no nodes or connections', async () => {
      const emptyWorkflow = {
        ...mockWorkflow,
        nodes: [] as Array<Record<string, unknown>>,
        connections: {},
      };
      mockClient.getWorkflow.mockResolvedValue(emptyWorkflow);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{id}'
      );
      const template = templateCall[0];
      const result = await template.load({ id: 'workflow-123' });

      const data = JSON.parse(result.text);
      expect(data.metadata.nodeCount).toBe(0);
      expect(data.metadata.connectionCount).toBe(0);
    });

    it('should load workflow using workflowId template', async () => {
      mockClient.getWorkflow.mockResolvedValue(mockWorkflow);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{workflowId}'
      );
      expect(templateCall).toBeDefined();
      if (!templateCall) throw new Error('Template call not found');

      const template = templateCall[0];
      const result = await template.load({ workflowId: 'workflow-123' });

      expect(result.text).toBeDefined();
      const data = JSON.parse(result.text);
      expect(data.id).toBe('workflow-123');
    });

    it('should throw error when client not initialized', async () => {
      getClientFn = jest.fn().mockReturnValue(null) as () => N8nClient | null;

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{id}'
      );
      const template = templateCall[0];

      await expect(template.load({ id: 'workflow-123' })).rejects.toThrow(
        'n8n client not initialized. Run init-n8n first.'
      );
    });

    it('should handle API errors', async () => {
      mockClient.getWorkflow.mockRejectedValue(new Error('Workflow not found'));

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{id}'
      );
      const template = templateCall[0];

      await expect(template.load({ id: 'workflow-123' })).rejects.toThrow(
        'Failed to load workflow workflow-123: Workflow not found'
      );
    });

    it('should handle workflow with no tags', async () => {
      const workflowWithoutTags = {
        ...mockWorkflow,
        tags: [],
      };
      mockClient.getWorkflow.mockResolvedValue(workflowWithoutTags);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{id}'
      );
      const template = templateCall[0];
      const result = await template.load({ id: 'workflow-123' });

      const data = JSON.parse(result.text);
      expect(data.metadata.tags).toEqual([]);
    });
  });

  describe('Workflow List Resource', () => {
    beforeEach(() => {
      workflowManager = new WorkflowResourceManager();
      workflowManager.register(mockServer, getClientFn);
    });

    it('should load workflow list successfully', async () => {
      mockClient.getWorkflows.mockResolvedValue({
        data: [mockWorkflow, mockInactiveWorkflow],
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/list'
      );
      expect(resourceCall).toBeDefined();
      if (!resourceCall) throw new Error('Resource call not found');

      const resource = resourceCall[0];
      const result = await resource.load();

      expect(result.text).toBeDefined();
      const data = JSON.parse(result.text);
      expect(data.workflows).toHaveLength(2);
      expect(data.workflows[0].id).toBe('workflow-123');
      expect(data.workflows[0].name).toBe('Test Workflow');
      expect(data.workflows[0].active).toBe(true);
      expect(data.workflows[0].uri).toBe('n8n://workflows/workflow-123');
      expect(data.workflows[1].id).toBe('workflow-456');
      expect(data.workflows[1].active).toBe(false);
      expect(data.metadata.total).toBe(2);
      expect(data.resourceInfo.type).toBe('n8n-workflow-list');
    });

    it('should handle empty workflow list', async () => {
      mockClient.getWorkflows.mockResolvedValue({ data: [] });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/list'
      );
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.workflows).toHaveLength(0);
      expect(data.metadata.total).toBe(0);
    });

    it('should handle workflow list API errors', async () => {
      mockClient.getWorkflows.mockRejectedValue(new Error('List API Error'));

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/list'
      );
      const resource = resourceCall[0];

      await expect(resource.load()).rejects.toThrow('Failed to load workflow list: List API Error');
    });

    it('should handle workflows with missing tags', async () => {
      const workflowsWithMixedTags = [
        { ...mockWorkflow, tags: undefined },
        { ...mockInactiveWorkflow, tags: undefined },
      ];
      mockClient.getWorkflows.mockResolvedValue({ data: workflowsWithMixedTags });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/list'
      );
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.workflows[0].tags).toEqual([]);
      expect(data.workflows[1].tags).toEqual([]);
    });
  });

  describe('Active Workflows Resource', () => {
    beforeEach(() => {
      workflowManager = new WorkflowResourceManager();
      workflowManager.register(mockServer, getClientFn);
    });

    it('should load active workflows successfully', async () => {
      mockClient.getWorkflows.mockResolvedValue({
        data: [mockWorkflow, mockInactiveWorkflow],
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/active'
      );
      expect(resourceCall).toBeDefined();
      if (!resourceCall) throw new Error('Resource call not found');

      const resource = resourceCall[0];
      const result = await resource.load();

      expect(result.text).toBeDefined();
      const data = JSON.parse(result.text);
      expect(data.activeWorkflows).toHaveLength(1); // Only active workflow
      expect(data.activeWorkflows[0].id).toBe('workflow-123');
      expect(data.activeWorkflows[0].name).toBe('Test Workflow');
      expect(data.activeWorkflows[0].lastExecution).toBe('2023-01-01T12:00:00Z');
      expect(data.metadata.total).toBe(1);
      expect(data.metadata.activeOnly).toBe(true);
      expect(data.resourceInfo.type).toBe('n8n-active-workflows');
    });

    it('should handle no active workflows', async () => {
      mockClient.getWorkflows.mockResolvedValue({
        data: [mockInactiveWorkflow], // Only inactive workflow
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/active'
      );
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.activeWorkflows).toHaveLength(0);
      expect(data.metadata.total).toBe(0);
    });

    it('should handle active workflows API errors', async () => {
      mockClient.getWorkflows.mockRejectedValue(new Error('Active API Error'));

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/active'
      );
      const resource = resourceCall[0];

      await expect(resource.load()).rejects.toThrow(
        'Failed to load active workflows: Active API Error'
      );
    });
  });

  describe('Workflow Statistics Resource', () => {
    beforeEach(() => {
      workflowManager = new WorkflowResourceManager();
      workflowManager.register(mockServer, getClientFn);
    });

    it('should load workflow statistics successfully', async () => {
      const recentWorkflow = {
        ...mockWorkflow,
        id: 'workflow-789',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        tags: ['test', 'recent'],
      };

      mockClient.getWorkflows.mockResolvedValue({
        data: [mockWorkflow, mockInactiveWorkflow, recentWorkflow],
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/stats'
      );
      expect(resourceCall).toBeDefined();
      if (!resourceCall) throw new Error('Resource call not found');

      const resource = resourceCall[0];
      const result = await resource.load();

      expect(result.text).toBeDefined();
      const data = JSON.parse(result.text);
      expect(data.totalWorkflows).toBe(3);
      expect(data.activeWorkflows).toBe(2); // mockWorkflow and recentWorkflow are active
      expect(data.inactiveWorkflows).toBe(1);
      expect(data.tagUsage).toBeDefined();
      expect(data.tagUsage.test).toBe(2); // Present in mockWorkflow and recentWorkflow
      expect(data.tagUsage.automation).toBe(1);
      expect(data.tagUsage.draft).toBe(1);
      expect(data.tagUsage.recent).toBe(1);
      expect(data.creationStats).toBeDefined();
      expect(data.creationStats.createdLastWeek).toBeGreaterThanOrEqual(0);
      expect(data.creationStats.updatedLastWeek).toBeGreaterThanOrEqual(0);
      expect(data.resourceInfo.type).toBe('n8n-workflow-stats');
    });

    it('should handle empty workflows for statistics', async () => {
      mockClient.getWorkflows.mockResolvedValue({ data: [] });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/stats'
      );
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.totalWorkflows).toBe(0);
      expect(data.activeWorkflows).toBe(0);
      expect(data.inactiveWorkflows).toBe(0);
      expect(data.tagUsage).toEqual({});
    });

    it('should handle stats API errors', async () => {
      mockClient.getWorkflows.mockRejectedValue(new Error('Stats API Error'));

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/stats'
      );
      const resource = resourceCall[0];

      await expect(resource.load()).rejects.toThrow(
        'Failed to load workflow statistics: Stats API Error'
      );
    });

    it('should handle workflows with string tags', async () => {
      const workflowWithStringTags = {
        ...mockWorkflow,
        tags: ['string-tag-1', 'string-tag-2'],
      };

      mockClient.getWorkflows.mockResolvedValue({
        data: [workflowWithStringTags],
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/stats'
      );
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.tagUsage['string-tag-1']).toBe(1);
      expect(data.tagUsage['string-tag-2']).toBe(1);
    });

    it('should handle workflows with mixed tag formats', async () => {
      const workflowWithMixedTags = {
        ...mockWorkflow,
        tags: ['object-tag', 'string-tag'],
      };

      mockClient.getWorkflows.mockResolvedValue({
        data: [workflowWithMixedTags],
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/stats'
      );
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.tagUsage['object-tag']).toBe(1);
      expect(data.tagUsage['string-tag']).toBe(1);
    });
  });

  describe('Cache Management', () => {
    beforeEach(() => {
      workflowManager = new WorkflowResourceManager({ cacheDuration: 1000 });
    });

    it('should cache workflow data', async () => {
      workflowManager.register(mockServer, getClientFn);
      mockClient.getWorkflow.mockResolvedValue(mockWorkflow);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{id}'
      );
      const template = templateCall[0];

      // First call
      await template.load({ id: 'workflow-123' });
      expect(mockClient.getWorkflow).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await template.load({ id: 'workflow-123' });
      expect(mockClient.getWorkflow).toHaveBeenCalledTimes(1);
    });

    it('should cache workflow list data', async () => {
      workflowManager.register(mockServer, getClientFn);
      mockClient.getWorkflows.mockResolvedValue({
        data: [mockWorkflow],
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/list'
      );
      const resource = resourceCall[0];

      // First call
      await resource.load();
      expect(mockClient.getWorkflows).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await resource.load();
      expect(mockClient.getWorkflows).toHaveBeenCalledTimes(1);
    });

    it('should clear cache', () => {
      workflowManager.clearCache();
      // Should not throw
    });

    it('should get cache statistics', () => {
      const stats = workflowManager.getCacheStats();
      expect(stats).toBeDefined();
      expect(typeof stats.size).toBe('number');
      expect(Array.isArray(stats.keys)).toBe(true);
    });

    it('should not cache when duration is 0', () => {
      workflowManager = new WorkflowResourceManager({ cacheDuration: 0 });
      workflowManager.register(mockServer, getClientFn);
      mockClient.getWorkflow.mockResolvedValue(mockWorkflow);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{id}'
      );
      const template = templateCall[0];

      return template
        .load({ id: 'workflow-123' })
        .then(() => {
          return template.load({ id: 'workflow-123' });
        })
        .then(() => {
          expect(mockClient.getWorkflow).toHaveBeenCalledTimes(2);
        });
    });

    it('should handle cache expiration', async () => {
      jest.useFakeTimers();

      workflowManager = new WorkflowResourceManager({ cacheDuration: 1 }); // 1ms cache
      workflowManager.register(mockServer, getClientFn);
      mockClient.getWorkflow.mockResolvedValue(mockWorkflow);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{id}'
      );
      const template = templateCall[0];

      // First call
      await template.load({ id: 'workflow-123' });
      expect(mockClient.getWorkflow).toHaveBeenCalledTimes(1);

      // Fast-forward time to expire cache
      jest.advanceTimersByTime(10);

      // Second call should not use expired cache
      await template.load({ id: 'workflow-123' });
      expect(mockClient.getWorkflow).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe('Factory Function', () => {
    it('should create workflow resource manager with factory function', () => {
      const manager = createWorkflowResources();
      expect(manager).toBeInstanceOf(WorkflowResourceManager);
    });

    it('should create workflow resource manager with config via factory', () => {
      const config = { maxWorkflows: 50, includeInactive: false };
      const manager = createWorkflowResources(config);
      expect(manager).toBeInstanceOf(WorkflowResourceManager);
    });
  });

  describe('Tag Usage Calculation', () => {
    beforeEach(() => {
      workflowManager = new WorkflowResourceManager();
      workflowManager.register(mockServer, getClientFn);
    });

    it('should calculate tag usage correctly with object tags', async () => {
      const workflowsWithObjectTags = [
        {
          ...mockWorkflow,
          tags: ['production', 'api'],
        },
        {
          ...mockInactiveWorkflow,
          tags: ['production', 'webhook'],
        },
      ];

      mockClient.getWorkflows.mockResolvedValue({
        data: workflowsWithObjectTags,
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/stats'
      );
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.tagUsage.production).toBe(2);
      expect(data.tagUsage.api).toBe(1);
      expect(data.tagUsage.webhook).toBe(1);
    });

    it('should handle workflows with no tags gracefully', async () => {
      const workflowsWithNoTags = [
        { ...mockWorkflow, tags: undefined },
        { ...mockInactiveWorkflow, tags: undefined },
        { ...mockWorkflow, id: 'workflow-789', tags: [] },
      ];

      mockClient.getWorkflows.mockResolvedValue({
        data: workflowsWithNoTags,
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/stats'
      );
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.tagUsage).toEqual({});
    });

    it('should handle workflows with non-array tags', async () => {
      const workflowsWithInvalidTags = [
        { ...mockWorkflow, tags: 'invalid' as any },
        { ...mockInactiveWorkflow, tags: { invalid: true } as any },
      ];

      mockClient.getWorkflows.mockResolvedValue({
        data: workflowsWithInvalidTags,
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/stats'
      );
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.tagUsage).toEqual({});
    });
  });

  describe('Creation Statistics', () => {
    beforeEach(() => {
      workflowManager = new WorkflowResourceManager();
      workflowManager.register(mockServer, getClientFn);
    });

    it('should calculate creation statistics correctly', async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const workflowsWithDifferentDates = [
        {
          ...mockWorkflow,
          createdAt: oneDayAgo.toISOString(),
          updatedAt: oneDayAgo.toISOString(),
        },
        {
          ...mockInactiveWorkflow,
          createdAt: oneWeekAgo.toISOString(),
          updatedAt: oneDayAgo.toISOString(),
        },
        {
          ...mockWorkflow,
          id: 'workflow-789',
          createdAt: oneMonthAgo.toISOString(),
          updatedAt: oneMonthAgo.toISOString(),
        },
      ];

      mockClient.getWorkflows.mockResolvedValue({
        data: workflowsWithDifferentDates,
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/stats'
      );
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.creationStats.createdLastWeek).toBeGreaterThanOrEqual(1);
      expect(data.creationStats.createdLastMonth).toBeGreaterThanOrEqual(1);
      expect(data.creationStats.updatedLastWeek).toBeGreaterThanOrEqual(2);
      expect(data.creationStats.updatedLastMonth).toBeGreaterThanOrEqual(2);
    });

    it('should handle invalid date formats', async () => {
      const workflowsWithInvalidDates = [
        {
          ...mockWorkflow,
          createdAt: 'invalid-date',
          updatedAt: null,
        },
      ];

      mockClient.getWorkflows.mockResolvedValue({
        data: workflowsWithInvalidDates,
      });

      const resourceCall = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/stats'
      );
      const resource = resourceCall[0];
      const result = await resource.load();

      const data = JSON.parse(result.text);
      expect(data.creationStats.createdLastWeek).toBe(0);
      expect(data.creationStats.updatedLastWeek).toBe(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    beforeEach(() => {
      workflowManager = new WorkflowResourceManager();
      workflowManager.register(mockServer, getClientFn);
    });

    it('should handle non-Error exceptions', async () => {
      mockClient.getWorkflow.mockRejectedValue('String error');

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{id}'
      );
      const template = templateCall[0];

      await expect(template.load({ id: 'workflow-123' })).rejects.toThrow(
        'Failed to load workflow workflow-123: String error'
      );
    });

    it('should handle malformed workflow data', async () => {
      const malformedWorkflow = {
        id: 'workflow-123',
        // Missing required fields
        name: undefined,
        active: undefined,
      };
      mockClient.getWorkflow.mockResolvedValue(malformedWorkflow);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{id}'
      );
      const template = templateCall[0];
      const result = await template.load({ id: 'workflow-123' });

      const data = JSON.parse(result.text);
      expect(data.id).toBe('workflow-123');
      expect(data.metadata.tags).toEqual([]);
    });

    it('should handle workflows with complex connection objects', async () => {
      const workflowWithComplexConnections = {
        ...mockWorkflow,
        connections: {
          'HTTP Request': {
            main: [
              [
                { node: 'Code', type: 'main', index: 0 },
                { node: 'Another Node', type: 'main', index: 1 },
              ],
            ],
            secondary: [[{ node: 'Error Handler', type: 'main', index: 0 }]],
          },
          Code: {
            main: [[{ node: 'Final Node', type: 'main', index: 0 }]],
          },
        },
      };
      mockClient.getWorkflow.mockResolvedValue(workflowWithComplexConnections);

      const templateCall = mockServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'n8n://workflows/{id}'
      );
      const template = templateCall[0];
      const result = await template.load({ id: 'workflow-123' });

      const data = JSON.parse(result.text);
      expect(data.metadata.connectionCount).toBe(2); // HTTP Request and Code have connections
    });

    it('should handle empty workflow list gracefully in all resources', async () => {
      mockClient.getWorkflows.mockResolvedValue({ data: [] });

      // Test list resource
      const listResource = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/list'
      )[0];
      const listResult = await listResource.load();
      const listData = JSON.parse(listResult.text);
      expect(listData.workflows).toHaveLength(0);

      // Test active resource
      const activeResource = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/active'
      )[0];
      const activeResult = await activeResource.load();
      const activeData = JSON.parse(activeResult.text);
      expect(activeData.activeWorkflows).toHaveLength(0);

      // Test stats resource
      const statsResource = mockServer.addResource.mock.calls.find(
        call => call[0].uri === 'n8n://workflows/stats'
      )[0];
      const statsResult = await statsResource.load();
      const statsData = JSON.parse(statsResult.text);
      expect(statsData.totalWorkflows).toBe(0);
    });
  });
});
