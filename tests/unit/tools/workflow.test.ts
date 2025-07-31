import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createWorkflowTools } from '../../../src/tools/workflow';
import { N8nClient } from '../../../src/client/n8nClient';

describe('Workflow Tools', () => {
  let mockClient: jest.Mocked<N8nClient>;
  let mockServer: any;
  let getClient: () => N8nClient | null;

  beforeEach(() => {
    mockClient = (global as any).testUtils.createMockClient() as jest.Mocked<N8nClient>;
    getClient = jest.fn(() => mockClient);
    mockServer = {
      addTool: jest.fn(),
    };

    // Register workflow tools
    createWorkflowTools(getClient, mockServer);
  });

  it('should register all workflow tools', () => {
    expect(mockServer.addTool).toHaveBeenCalledTimes(7);

    const toolNames = mockServer.addTool.mock.calls.map((call: any) => call[0].name);
    expect(toolNames).toContain('list-workflows');
    expect(toolNames).toContain('get-workflow');
    expect(toolNames).toContain('create-workflow');
    expect(toolNames).toContain('update-workflow');
    expect(toolNames).toContain('delete-workflow');
    expect(toolNames).toContain('activate-workflow');
    expect(toolNames).toContain('deactivate-workflow');
  });

  describe('list-workflows tool', () => {
    let listWorkflowsTool: any;

    beforeEach(() => {
      listWorkflowsTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-workflows'
      )[0];
    });

    it('should list workflows successfully', async () => {
      const mockWorkflows = [
        (global as any).testUtils.createMockWorkflow({ id: '1', name: 'Workflow 1', active: true }),
        (global as any).testUtils.createMockWorkflow({
          id: '2',
          name: 'Workflow 2',
          active: false,
        }),
      ];

      mockClient.getWorkflows.mockResolvedValue(
        (global as any).testUtils.createMockApiResponse(mockWorkflows)
      );

      const result = await listWorkflowsTool.execute({ limit: 10 });

      expect(mockClient.getWorkflows).toHaveBeenCalledWith({ limit: 10 });
      expect(result).toContain('Found 2 workflow(s)');
      expect(result).toContain('Workflow 1');
      expect(result).toContain('Workflow 2');
      expect(result).toContain('🟢 Active');
      expect(result).toContain('🔴 Inactive');
    });

    it('should list workflows with tags and pagination', async () => {
      const mockWorkflows = [
        (global as any).testUtils.createMockWorkflow({
          id: '1',
          name: 'Tagged Workflow',
          tags: ['production', 'automation'],
          createdAt: '2023-01-01T00:00:00.000Z',
        }),
      ];

      mockClient.getWorkflows.mockResolvedValue({
        ...(global as any).testUtils.createMockApiResponse(mockWorkflows),
        nextCursor: 'next-page-cursor',
      });

      const result = await listWorkflowsTool.execute({ cursor: 'current-cursor' });

      expect(mockClient.getWorkflows).toHaveBeenCalledWith({ cursor: 'current-cursor' });
      expect(result).toContain('Tagged Workflow');
      expect(result).toContain('Tags: production, automation');
      expect(result).toContain('📄 Use cursor "next-page-cursor" to get the next page.');
    });

    it('should handle empty workflow list', async () => {
      mockClient.getWorkflows.mockResolvedValue(
        (global as any).testUtils.createMockApiResponse([])
      );

      const result = await listWorkflowsTool.execute({});

      expect(result).toBe('No workflows found in the n8n instance.');
    });

    it('should handle API errors with Error instance', async () => {
      mockClient.getWorkflows.mockRejectedValue(new Error('API connection failed'));

      await expect(listWorkflowsTool.execute({})).rejects.toThrow(
        'Failed to list workflows: API connection failed'
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getWorkflows.mockRejectedValue('Unknown error type');

      await expect(listWorkflowsTool.execute({})).rejects.toThrow(
        'Failed to list workflows with unknown error'
      );
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createWorkflowTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-workflows'
      )?.[0];

      expect(tool).toBeDefined();
      expect(tool).toHaveProperty('execute');
      await expect((tool as any).execute({})).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });
  });

  describe('get-workflow tool', () => {
    let getWorkflowTool: any;

    beforeEach(() => {
      getWorkflowTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-workflow'
      )[0];
    });

    it('should get workflow details successfully', async () => {
      const mockWorkflow = (global as any).testUtils.createMockWorkflow({
        id: 'workflow-123',
        name: 'Test Workflow',
        active: true,
      });

      mockClient.getWorkflow.mockResolvedValue(mockWorkflow);

      const result = await getWorkflowTool.execute({ workflowId: 'workflow-123' });

      expect(mockClient.getWorkflow).toHaveBeenCalledWith('workflow-123');
      expect(result).toContain('# Workflow: Test Workflow');
      expect(result).toContain('**ID:** workflow-123');
      expect(result).toContain('**Status:** 🟢 Active');
    });

    it('should get workflow details with tags and dates', async () => {
      const mockWorkflow = (global as any).testUtils.createMockWorkflow({
        id: 'workflow-456',
        name: 'Complex Workflow',
        active: false,
        tags: ['test', 'automation'],
        createdAt: '2023-01-01T12:00:00.000Z',
        updatedAt: '2023-01-02T15:30:00.000Z',
        nodes: [
          { name: 'Start Node', type: 'manual' },
          { name: undefined, type: undefined }, // Test fallback values
        ],
      });

      mockClient.getWorkflow.mockResolvedValue(mockWorkflow);

      const result = await getWorkflowTool.execute({ workflowId: 'workflow-456' });

      expect(result).toContain('**Tags:** test, automation');
      expect(result).toContain('**Created:**');
      expect(result).toContain('**Updated:**');
      expect(result).toContain('**Status:** 🔴 Inactive');
      expect(result).toContain('Start Node');
      expect(result).toContain('Unnamed Node');
      expect(result).toContain('Unknown Type');
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createWorkflowTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-workflow'
      )?.[0];

      await expect((tool as any).execute({ workflowId: 'test' })).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should handle workflow not found error', async () => {
      mockClient.getWorkflow.mockRejectedValue(new Error('Workflow not found'));

      await expect(getWorkflowTool.execute({ workflowId: 'nonexistent' })).rejects.toThrow(
        'Failed to get workflow: Workflow not found'
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getWorkflow.mockRejectedValue('Unknown error type');

      await expect(getWorkflowTool.execute({ workflowId: 'test' })).rejects.toThrow(
        'Failed to get workflow with unknown error'
      );
    });
  });

  describe('create-workflow tool', () => {
    let createWorkflowTool: any;

    beforeEach(() => {
      createWorkflowTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-workflow'
      )[0];
    });

    it('should create workflow successfully', async () => {
      const mockWorkflow = (global as any).testUtils.createMockWorkflow({
        id: 'new-workflow-123',
        name: 'New Workflow',
        active: false,
      });

      mockClient.createWorkflow.mockResolvedValue(mockWorkflow);

      const workflowData = {
        name: 'New Workflow',
        nodes: [{ name: 'Start', type: 'manual' }],
        connections: {},
        active: false,
      };

      const result = await createWorkflowTool.execute(workflowData);

      expect(mockClient.createWorkflow).toHaveBeenCalledWith(workflowData);
      expect(result).toContain('✅ Successfully created workflow "New Workflow"');
      expect(result).toContain('ID: new-workflow-123');
      expect(result).toContain('🔴 Inactive');
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createWorkflowTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-workflow'
      )?.[0];

      const workflowData = {
        name: 'Test Workflow',
        nodes: [{ name: 'Start', type: 'manual' }],
        connections: {},
      };

      await expect((tool as any).execute(workflowData)).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should handle creation errors with Error instance', async () => {
      mockClient.createWorkflow.mockRejectedValue(new Error('Invalid workflow data'));

      const workflowData = {
        name: 'Invalid Workflow',
        nodes: [{ name: 'Start', type: 'manual' }],
        connections: {},
      };

      await expect(createWorkflowTool.execute(workflowData)).rejects.toThrow(
        'Failed to create workflow: Invalid workflow data'
      );
    });

    it('should handle unknown creation errors', async () => {
      mockClient.createWorkflow.mockRejectedValue('Unknown error type');

      const workflowData = {
        name: 'Test Workflow',
        nodes: [{ name: 'Start', type: 'manual' }],
        connections: {},
      };

      await expect(createWorkflowTool.execute(workflowData)).rejects.toThrow(
        'Failed to create workflow with unknown error'
      );
    });

    it('should create active workflow successfully', async () => {
      const mockWorkflow = (global as any).testUtils.createMockWorkflow({
        id: 'active-workflow-123',
        name: 'Active Workflow',
        active: true,
      });

      mockClient.createWorkflow.mockResolvedValue(mockWorkflow);

      const workflowData = {
        name: 'Active Workflow',
        nodes: [{ name: 'Start', type: 'manual' }],
        connections: {},
        active: true,
      };

      const result = await createWorkflowTool.execute(workflowData);

      expect(result).toContain('✅ Successfully created workflow "Active Workflow"');
      expect(result).toContain('🟢 Active');
    });
  });

  describe('update-workflow tool', () => {
    let updateWorkflowTool: any;

    beforeEach(() => {
      updateWorkflowTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-workflow'
      )[0];
    });

    it('should update workflow successfully', async () => {
      const mockWorkflow = (global as any).testUtils.createMockWorkflow({
        id: 'workflow-123',
        name: 'Updated Workflow',
        active: false,
      });

      mockClient.updateWorkflow.mockResolvedValue(mockWorkflow);

      const updateData = {
        workflowId: 'workflow-123',
        name: 'Updated Workflow',
        active: false,
      };

      const result = await updateWorkflowTool.execute(updateData);

      expect(mockClient.updateWorkflow).toHaveBeenCalledWith('workflow-123', {
        name: 'Updated Workflow',
        active: false,
      });
      expect(result).toContain('✅ Successfully updated workflow "Updated Workflow"');
      expect(result).toContain('ID: workflow-123');
      expect(result).toContain('Status: 🔴 Inactive');
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createWorkflowTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-workflow'
      )?.[0];

      const updateData = {
        workflowId: 'test-id',
        name: 'Test Update',
      };

      await expect((tool as any).execute(updateData)).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should handle update errors with Error instance', async () => {
      mockClient.updateWorkflow.mockRejectedValue(new Error('Workflow not found'));

      const updateData = {
        workflowId: 'nonexistent-id',
        name: 'Updated Name',
      };

      await expect(updateWorkflowTool.execute(updateData)).rejects.toThrow(
        'Failed to update workflow: Workflow not found'
      );
    });

    it('should handle unknown update errors', async () => {
      mockClient.updateWorkflow.mockRejectedValue('Unknown error type');

      const updateData = {
        workflowId: 'test-id',
        name: 'Test Update',
      };

      await expect(updateWorkflowTool.execute(updateData)).rejects.toThrow(
        'Failed to update workflow with unknown error'
      );
    });

    it('should update workflow to active status successfully', async () => {
      const mockWorkflow = (global as any).testUtils.createMockWorkflow({
        id: 'workflow-456',
        name: 'Activated Workflow',
        active: true,
      });

      mockClient.updateWorkflow.mockResolvedValue(mockWorkflow);

      const updateData = {
        workflowId: 'workflow-456',
        name: 'Activated Workflow',
        active: true,
      };

      const result = await updateWorkflowTool.execute(updateData);

      expect(result).toContain('✅ Successfully updated workflow "Activated Workflow"');
      expect(result).toContain('Status: 🟢 Active');
    });
  });

  describe('delete-workflow tool', () => {
    let deleteWorkflowTool: any;

    beforeEach(() => {
      deleteWorkflowTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-workflow'
      )[0];
    });

    it('should delete workflow successfully', async () => {
      mockClient.deleteWorkflow.mockResolvedValue(undefined);

      const result = await deleteWorkflowTool.execute({ workflowId: 'workflow-123' });

      expect(mockClient.deleteWorkflow).toHaveBeenCalledWith('workflow-123');
      expect(result).toContain('✅ Successfully deleted workflow with ID: workflow-123');
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createWorkflowTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-workflow'
      )?.[0];

      await expect((tool as any).execute({ workflowId: 'test-id' })).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should handle delete errors with Error instance', async () => {
      mockClient.deleteWorkflow.mockRejectedValue(new Error('Workflow not found'));

      await expect(deleteWorkflowTool.execute({ workflowId: 'nonexistent' })).rejects.toThrow(
        'Failed to delete workflow: Workflow not found'
      );
    });

    it('should handle unknown delete errors', async () => {
      mockClient.deleteWorkflow.mockRejectedValue('Unknown error type');

      await expect(deleteWorkflowTool.execute({ workflowId: 'test-id' })).rejects.toThrow(
        'Failed to delete workflow with unknown error'
      );
    });
  });

  describe('workflow activation tools', () => {
    let activateWorkflowTool: any;
    let deactivateWorkflowTool: any;

    beforeEach(() => {
      activateWorkflowTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'activate-workflow'
      )[0];
      deactivateWorkflowTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'deactivate-workflow'
      )[0];
    });

    it('should activate workflow successfully', async () => {
      const mockWorkflow = (global as any).testUtils.createMockWorkflow({
        id: 'workflow-123',
        name: 'Test Workflow',
        active: true,
      });

      mockClient.activateWorkflow.mockResolvedValue(mockWorkflow);

      const result = await activateWorkflowTool.execute({ workflowId: 'workflow-123' });

      expect(mockClient.activateWorkflow).toHaveBeenCalledWith('workflow-123');
      expect(result).toContain('✅ Successfully activated workflow "Test Workflow"');
      expect(result).toContain('Status: 🟢 Active');
    });

    it('should throw UserError when client is not initialized for activation', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createWorkflowTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'activate-workflow'
      )?.[0];

      await expect((tool as any).execute({ workflowId: 'test-id' })).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should handle activation errors with Error instance', async () => {
      mockClient.activateWorkflow.mockRejectedValue(new Error('Workflow activation failed'));

      await expect(activateWorkflowTool.execute({ workflowId: 'broken-workflow' })).rejects.toThrow(
        'Failed to activate workflow: Workflow activation failed'
      );
    });

    it('should handle unknown activation errors', async () => {
      mockClient.activateWorkflow.mockRejectedValue('Unknown error type');

      await expect(activateWorkflowTool.execute({ workflowId: 'test-id' })).rejects.toThrow(
        'Failed to activate workflow with unknown error'
      );
    });

    it('should deactivate workflow successfully', async () => {
      const mockWorkflow = (global as any).testUtils.createMockWorkflow({
        id: 'workflow-123',
        name: 'Test Workflow',
        active: false,
      });

      mockClient.deactivateWorkflow.mockResolvedValue(mockWorkflow);

      const result = await deactivateWorkflowTool.execute({ workflowId: 'workflow-123' });

      expect(mockClient.deactivateWorkflow).toHaveBeenCalledWith('workflow-123');
      expect(result).toContain('✅ Successfully deactivated workflow "Test Workflow"');
      expect(result).toContain('Status: 🔴 Inactive');
    });

    it('should throw UserError when client is not initialized for deactivation', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createWorkflowTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'deactivate-workflow'
      )?.[0];

      await expect((tool as any).execute({ workflowId: 'test-id' })).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should handle deactivation errors with Error instance', async () => {
      mockClient.deactivateWorkflow.mockRejectedValue(new Error('Workflow deactivation failed'));

      await expect(
        deactivateWorkflowTool.execute({ workflowId: 'broken-workflow' })
      ).rejects.toThrow('Failed to deactivate workflow: Workflow deactivation failed');
    });

    it('should handle unknown deactivation errors', async () => {
      mockClient.deactivateWorkflow.mockRejectedValue('Unknown error type');

      await expect(deactivateWorkflowTool.execute({ workflowId: 'test-id' })).rejects.toThrow(
        'Failed to deactivate workflow with unknown error'
      );
    });
  });
});
