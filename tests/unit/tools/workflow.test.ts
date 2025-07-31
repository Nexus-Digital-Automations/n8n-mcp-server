import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createWorkflowTools } from '../../../src/tools/workflow.js';
import { N8nClient } from '../../../src/client/n8nClient.js';

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
    expect(mockServer.addTool).toHaveBeenCalledTimes(8);

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
        (global as any).testUtils.createMockWorkflow({ id: '1', name: 'Workflow 1' }),
        (global as any).testUtils.createMockWorkflow({ id: '2', name: 'Workflow 2' }),
      ];

      mockClient.getWorkflows.mockResolvedValue(
        (global as any).testUtils.createMockApiResponse(mockWorkflows)
      );

      const result = await listWorkflowsTool.execute({ limit: 10 });

      expect(mockClient.getWorkflows).toHaveBeenCalledWith({ limit: 10 });
      expect(result).toContain('Found 2 workflow(s)');
      expect(result).toContain('Workflow 1');
      expect(result).toContain('Workflow 2');
    });

    it('should handle empty workflow list', async () => {
      mockClient.getWorkflows.mockResolvedValue(
        (global as any).testUtils.createMockApiResponse([])
      );

      const result = await listWorkflowsTool.execute({});

      expect(result).toBe('No workflows found in the n8n instance.');
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createWorkflowTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-workflows'
      )?.[0];

      await expect(tool?.execute({})).rejects.toThrow(
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

    it('should handle workflow not found error', async () => {
      mockClient.getWorkflow.mockRejectedValue(new Error('Workflow not found'));

      await expect(getWorkflowTool.execute({ workflowId: 'nonexistent' })).rejects.toThrow(
        'Failed to get workflow: Workflow not found'
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
  });
});
