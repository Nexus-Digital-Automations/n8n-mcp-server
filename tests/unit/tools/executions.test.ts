import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createExecutionTools } from '../../../src/tools/executions';
import { N8nClient } from '../../../src/client/n8nClient';
import { N8nExecution } from '../../../src/types/n8n';

describe('Execution Tools', () => {
  let mockClient: jest.Mocked<N8nClient>;
  let mockServer: any;
  let getClient: () => N8nClient | null;

  beforeEach(() => {
    mockClient = (global as any).testUtils.createMockClient() as jest.Mocked<N8nClient>;
    getClient = jest.fn(() => mockClient);
    mockServer = {
      addTool: jest.fn(),
    };

    // Register execution tools
    createExecutionTools(getClient, mockServer);
  });

  it('should register all execution tools', () => {
    expect(mockServer.addTool).toHaveBeenCalledTimes(3);

    const toolNames = mockServer.addTool.mock.calls.map((call: any) => call[0].name);
    expect(toolNames).toContain('list-executions');
    expect(toolNames).toContain('get-execution');
    expect(toolNames).toContain('delete-execution');
  });

  describe('list-executions tool', () => {
    let listExecutionsTool: any;

    beforeEach(() => {
      listExecutionsTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-executions'
      )[0];
    });

    it('should list executions successfully with full data', async () => {
      const mockExecutions: N8nExecution[] = [
        {
          id: 'exec-1',
          finished: true,
          mode: 'manual',
          status: 'success',
          workflowId: 'wf-1',
          startedAt: '2024-01-01T10:00:00.000Z',
          stoppedAt: '2024-01-01T10:05:00.000Z',
          retryOf: 'exec-0',
        },
        {
          id: 'exec-2',
          finished: false,
          mode: 'webhook',
          status: 'running',
          workflowId: 'wf-2',
          startedAt: '2024-01-01T11:00:00.000Z',
        },
        {
          id: 'exec-3',
          finished: true,
          mode: 'trigger',
          status: 'error',
          workflowId: 'wf-3',
          startedAt: '2024-01-01T12:00:00.000Z',
          stoppedAt: '2024-01-01T12:02:00.000Z',
        },
        {
          id: 'exec-4',
          finished: false,
          mode: 'manual',
          status: 'waiting',
          workflowId: 'wf-4',
          startedAt: '2024-01-01T13:00:00.000Z',
        },
      ];

      mockClient.getExecutions.mockResolvedValue({
        data: mockExecutions,
        nextCursor: 'next-cursor-456',
      });

      const result = await listExecutionsTool.execute({});

      expect(mockClient.getExecutions).toHaveBeenCalledWith({});
      expect(result).toContain('Found 4 execution(s):');

      // Check success execution formatting
      expect(result).toContain('**Execution exec-1**');
      expect(result).toContain('Status: ✅ success');
      expect(result).toContain('Workflow ID: wf-1');
      expect(result).toContain('Mode: manual');
      expect(result).toContain('Started: 1/1/2024');
      expect(result).toContain('Stopped: 1/1/2024');
      expect(result).toContain('Finished: Yes');
      expect(result).toContain('Retry Of: exec-0');

      // Check running execution formatting
      expect(result).toContain('**Execution exec-2**');
      expect(result).toContain('Status: 🔄 running');
      expect(result).toContain('Mode: webhook');
      expect(result).toContain('Finished: No');

      // Check error execution formatting
      expect(result).toContain('**Execution exec-3**');
      expect(result).toContain('Status: ❌ error');
      expect(result).toContain('Mode: trigger');

      // Check waiting execution formatting
      expect(result).toContain('**Execution exec-4**');
      expect(result).toContain('Status: ⏳ waiting');

      // Check pagination cursor
      expect(result).toContain('Use cursor "next-cursor-456" to get the next page');
    });

    it('should list executions with pagination options', async () => {
      const mockExecutions: N8nExecution[] = [
        {
          id: 'exec-1',
          finished: true,
          mode: 'manual',
          status: 'success',
          workflowId: 'wf-1',
          startedAt: '2024-01-01T10:00:00.000Z',
        },
      ];

      mockClient.getExecutions.mockResolvedValue({
        data: mockExecutions,
      });

      await listExecutionsTool.execute({ limit: 25, cursor: 'test-cursor' });

      expect(mockClient.getExecutions).toHaveBeenCalledWith({
        limit: 25,
        cursor: 'test-cursor',
      });
    });

    it('should handle empty executions list', async () => {
      mockClient.getExecutions.mockResolvedValue({
        data: [],
      });

      const result = await listExecutionsTool.execute({});

      expect(result).toBe('No executions found in the n8n instance.');
    });

    it('should handle executions without optional fields', async () => {
      const mockExecutions: N8nExecution[] = [
        {
          id: 'exec-minimal',
          finished: true,
          mode: 'manual',
          status: 'success',
          workflowId: 'wf-minimal',
          startedAt: '2024-01-01T10:00:00.000Z',
        },
      ];

      mockClient.getExecutions.mockResolvedValue({
        data: mockExecutions,
      });

      const result = await listExecutionsTool.execute({});

      expect(result).toContain('**Execution exec-minimal**');
      expect(result).toContain('Status: ✅ success');
      expect(result).toContain('Workflow ID: wf-minimal');
      expect(result).toContain('Mode: manual');
      expect(result).toContain('Started: 1/1/2024');
      expect(result).toContain('Finished: Yes');
      expect(result).not.toContain('Stopped:');
      expect(result).not.toContain('Retry Of:');
    });

    it('should handle executions without nextCursor', async () => {
      const mockExecutions: N8nExecution[] = [
        {
          id: 'exec-1',
          finished: true,
          mode: 'manual',
          status: 'success',
          workflowId: 'wf-1',
          startedAt: '2024-01-01T10:00:00.000Z',
        },
      ];

      mockClient.getExecutions.mockResolvedValue({
        data: mockExecutions,
      });

      const result = await listExecutionsTool.execute({});

      expect(result).toContain('Found 1 execution(s):');
      expect(result).not.toContain('Use cursor');
    });

    it('should handle API errors', async () => {
      mockClient.getExecutions.mockRejectedValue(new Error('API connection failed'));

      await expect(listExecutionsTool.execute({})).rejects.toThrow(
        'Failed to list executions: API connection failed'
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getExecutions.mockRejectedValue('Unknown error');

      await expect(listExecutionsTool.execute({})).rejects.toThrow(
        'Failed to list executions with unknown error'
      );
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createExecutionTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-executions'
      )?.[0];

      expect(tool).toBeDefined();
      await expect((tool as any).execute({})).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should have correct tool annotations', () => {
      expect(listExecutionsTool.annotations).toEqual({
        title: 'List n8n Executions',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should validate parameters with Zod schema', () => {
      // Valid parameters
      expect(() => listExecutionsTool.parameters.parse({})).not.toThrow();
      expect(() => listExecutionsTool.parameters.parse({ limit: 50 })).not.toThrow();
      expect(() => listExecutionsTool.parameters.parse({ cursor: 'test' })).not.toThrow();
      expect(() =>
        listExecutionsTool.parameters.parse({ limit: 25, cursor: 'test' })
      ).not.toThrow();

      // Invalid parameters
      expect(() => listExecutionsTool.parameters.parse({ limit: 0 })).toThrow();
      expect(() => listExecutionsTool.parameters.parse({ limit: 101 })).toThrow();
      expect(() => listExecutionsTool.parameters.parse({ limit: 'invalid' })).toThrow();
    });
  });

  describe('get-execution tool', () => {
    let getExecutionTool: any;

    beforeEach(() => {
      getExecutionTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-execution'
      )[0];
    });

    it('should get execution successfully with full data', async () => {
      const mockExecution: N8nExecution = {
        id: 'exec-1',
        finished: true,
        mode: 'manual',
        status: 'success',
        workflowId: 'wf-1',
        startedAt: '2024-01-01T10:00:00.000Z',
        stoppedAt: '2024-01-01T10:05:00.000Z',
        retryOf: 'exec-0',
        retrySuccessId: 'exec-1-retry',
        waitTill: new Date('2024-01-01T10:10:00.000Z'),
        workflowData: {
          id: 'wf-1',
          name: 'Test Workflow',
          active: true,
          nodes: [
            {
              id: 'node1',
              name: 'Start Node',
              type: 'Start',
              typeVersion: 1,
              position: [100, 200] as [number, number],
            },
            {
              id: 'node2',
              name: 'End Node',
              type: 'End',
              typeVersion: 1,
              position: [300, 200] as [number, number],
            },
          ],
          connections: {},
          settings: {},
          staticData: {},
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      };

      mockClient.getExecution.mockResolvedValue(mockExecution);

      const result = await getExecutionTool.execute({ executionId: 'exec-1' });

      expect(mockClient.getExecution).toHaveBeenCalledWith('exec-1');
      expect(result).toContain('# Execution: exec-1');
      expect(result).toContain('**Status:** ✅ success');
      expect(result).toContain('**Workflow ID:** wf-1');
      expect(result).toContain('**Mode:** manual');
      expect(result).toContain('**Started At:** 1/1/2024');
      expect(result).toContain('**Stopped At:** 1/1/2024');
      expect(result).toContain('**Finished:** Yes');
      expect(result).toContain('**Retry Of:** exec-0');
      expect(result).toContain('**Retry Success ID:** exec-1-retry');
      expect(result).toContain('**Wait Until:** 1/1/2024');
      expect(result).toContain('## Workflow Information:');
      expect(result).toContain('**Name:** Test Workflow');
      expect(result).toContain('**Active:** Yes');
      expect(result).toContain('**Nodes:** 2');
    });

    it('should get execution with minimal data', async () => {
      const mockExecution: N8nExecution = {
        id: 'exec-minimal',
        finished: false,
        mode: 'webhook',
        status: 'running',
        workflowId: 'wf-minimal',
        startedAt: '2024-01-01T10:00:00.000Z',
      };

      mockClient.getExecution.mockResolvedValue(mockExecution);

      const result = await getExecutionTool.execute({ executionId: 'exec-minimal' });

      expect(result).toContain('# Execution: exec-minimal');
      expect(result).toContain('**Status:** 🔄 running');
      expect(result).toContain('**Workflow ID:** wf-minimal');
      expect(result).toContain('**Mode:** webhook');
      expect(result).toContain('**Started At:** 1/1/2024');
      expect(result).toContain('**Finished:** No');
      expect(result).not.toContain('**Stopped At:**');
      expect(result).not.toContain('**Retry Of:**');
      expect(result).not.toContain('**Retry Success ID:**');
      expect(result).not.toContain('**Wait Until:**');
      expect(result).not.toContain('## Workflow Information:');
    });

    it('should handle different status icons correctly', async () => {
      const statuses: Array<{ status: N8nExecution['status']; icon: string }> = [
        { status: 'success', icon: '✅' },
        { status: 'error', icon: '❌' },
        { status: 'running', icon: '🔄' },
        { status: 'waiting', icon: '⏳' },
      ];

      for (const { status, icon } of statuses) {
        const mockExecution: N8nExecution = {
          id: `exec-${status}`,
          finished: status === 'success' || status === 'error',
          mode: 'manual',
          status,
          workflowId: 'wf-1',
          startedAt: '2024-01-01T10:00:00.000Z',
        };

        mockClient.getExecution.mockResolvedValue(mockExecution);

        const result = await getExecutionTool.execute({ executionId: `exec-${status}` });

        expect(result).toContain(`**Status:** ${icon} ${status}`);
      }
    });

    it('should format execution with workflow data having inactive workflow', async () => {
      const mockExecution: N8nExecution = {
        id: 'exec-1',
        finished: true,
        mode: 'manual',
        status: 'success',
        workflowId: 'wf-1',
        startedAt: '2024-01-01T10:00:00.000Z',
        workflowData: {
          id: 'wf-1',
          name: 'Inactive Workflow',
          active: false,
          nodes: [],
          connections: {},
          settings: {},
          staticData: {},
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      };

      mockClient.getExecution.mockResolvedValue(mockExecution);

      const result = await getExecutionTool.execute({ executionId: 'exec-1' });

      expect(result).toContain('**Name:** Inactive Workflow');
      expect(result).toContain('**Active:** No');
      expect(result).toContain('**Nodes:** 0');
    });

    it('should handle API errors', async () => {
      mockClient.getExecution.mockRejectedValue(new Error('Execution not found'));

      await expect(getExecutionTool.execute({ executionId: 'invalid' })).rejects.toThrow(
        'Failed to get execution: Execution not found'
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getExecution.mockRejectedValue({ error: 'Unknown' });

      await expect(getExecutionTool.execute({ executionId: 'test' })).rejects.toThrow(
        'Failed to get execution with unknown error'
      );
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createExecutionTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-execution'
      )?.[0];

      expect(tool).toBeDefined();
      await expect((tool as any).execute({ executionId: 'test' })).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should have correct tool annotations', () => {
      expect(getExecutionTool.annotations).toEqual({
        title: 'Get Execution Details',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should validate parameters with Zod schema', () => {
      // Valid parameters
      expect(() => getExecutionTool.parameters.parse({ executionId: 'test-id' })).not.toThrow();

      // Invalid parameters
      expect(() => getExecutionTool.parameters.parse({})).toThrow();
      expect(() => getExecutionTool.parameters.parse({ executionId: '' })).toThrow();
      expect(() => getExecutionTool.parameters.parse({ executionId: 123 })).toThrow();
    });
  });

  describe('delete-execution tool', () => {
    let deleteExecutionTool: any;

    beforeEach(() => {
      deleteExecutionTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-execution'
      )[0];
    });

    it('should delete execution successfully', async () => {
      mockClient.deleteExecution.mockResolvedValue(undefined);

      const result = await deleteExecutionTool.execute({ executionId: 'exec-to-delete' });

      expect(mockClient.deleteExecution).toHaveBeenCalledWith('exec-to-delete');
      expect(result).toBe('✅ Successfully deleted execution with ID: exec-to-delete');
    });

    it('should handle API errors', async () => {
      mockClient.deleteExecution.mockRejectedValue(new Error('Execution not found'));

      await expect(deleteExecutionTool.execute({ executionId: 'invalid' })).rejects.toThrow(
        'Failed to delete execution: Execution not found'
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.deleteExecution.mockRejectedValue('Network error');

      await expect(deleteExecutionTool.execute({ executionId: 'test' })).rejects.toThrow(
        'Failed to delete execution with unknown error'
      );
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createExecutionTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-execution'
      )?.[0];

      expect(tool).toBeDefined();
      await expect((tool as any).execute({ executionId: 'test' })).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should have correct tool annotations', () => {
      expect(deleteExecutionTool.annotations).toEqual({
        title: 'Delete Execution',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should validate parameters with Zod schema', () => {
      // Valid parameters
      expect(() => deleteExecutionTool.parameters.parse({ executionId: 'test-id' })).not.toThrow();

      // Invalid parameters
      expect(() => deleteExecutionTool.parameters.parse({})).toThrow();
      expect(() => deleteExecutionTool.parameters.parse({ executionId: '' })).toThrow();
      expect(() => deleteExecutionTool.parameters.parse({ executionId: 123 })).toThrow();
    });
  });
});
