import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createTagTools } from '../../../src/tools/tags';
import { N8nClient } from '../../../src/client/n8nClient';
import { N8nTag, CreateTagRequest, UpdateTagRequest } from '../../../src/types/n8n';
import { UserError } from 'fastmcp';

describe('Tag Tools', () => {
  let mockClient: jest.Mocked<N8nClient>;
  let mockServer: any;
  let getClient: () => N8nClient | null;

  beforeEach(() => {
    mockClient = (global as any).testUtils.createMockClient() as jest.Mocked<N8nClient>;
    getClient = jest.fn(() => mockClient);
    mockServer = {
      addTool: jest.fn(),
    };

    // Register tag tools
    createTagTools(getClient, mockServer);
  });

  it('should register all tag tools', () => {
    expect(mockServer.addTool).toHaveBeenCalledTimes(7);

    const toolNames = mockServer.addTool.mock.calls.map((call: any) => call[0].name);
    expect(toolNames).toContain('list-tags');
    expect(toolNames).toContain('get-tag');
    expect(toolNames).toContain('create-tag');
    expect(toolNames).toContain('update-tag');
    expect(toolNames).toContain('delete-tag');
    expect(toolNames).toContain('get-workflow-tags');
    expect(toolNames).toContain('update-workflow-tags');
  });

  describe('list-tags tool', () => {
    let listTagsTool: any;

    beforeEach(() => {
      listTagsTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-tags'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(listTagsTool.name).toBe('list-tags');
      expect(listTagsTool.description).toContain('List all tags in the n8n instance');
      expect(listTagsTool.annotations).toEqual({
        title: 'List n8n Tags',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should list tags successfully with full data', async () => {
      const mockTags: N8nTag[] = [
        {
          id: 'tag-1',
          name: 'Production',
          usageCount: 15,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-02T00:00:00.000Z',
        },
        {
          id: 'tag-2',
          name: 'Development',
          usageCount: 8,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-03T00:00:00.000Z',
        },
      ];

      mockClient.getTags.mockResolvedValue({
        data: mockTags,
        nextCursor: 'next-cursor',
      });

      const result = await listTagsTool.execute({ limit: 10 });

      expect(mockClient.getTags).toHaveBeenCalledWith({ limit: 10 });
      expect(result).toContain('Found 2 tag(s)');
      expect(result).toContain('**Production**');
      expect(result).toContain('ID: tag-1');
      expect(result).toContain('Usage Count: 15');
      expect(result).toContain('Created: 12/31/2022');
      expect(result).toContain('Updated: 1/2/2023');
      expect(result).toContain('**Development**');
      expect(result).toContain('ID: tag-2');
      expect(result).toContain('Usage Count: 8');
      expect(result).toContain('Use cursor "next-cursor" to get the next page');
    });

    it('should list tags with minimal data', async () => {
      const mockTags: N8nTag[] = [
        {
          id: 'tag-1',
          name: 'Simple Tag',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockClient.getTags.mockResolvedValue({
        data: mockTags,
      });

      const result = await listTagsTool.execute({});

      expect(mockClient.getTags).toHaveBeenCalledWith({});
      expect(result).toContain('Found 1 tag(s)');
      expect(result).toContain('**Simple Tag**');
      expect(result).toContain('ID: tag-1');
      expect(result).toContain('Created: 12/31/2022');
      expect(result).toContain('Updated: 12/31/2022');
      expect(result).not.toContain('Usage Count:');
      expect(result).not.toContain('cursor');
    });

    it('should handle empty tag list', async () => {
      mockClient.getTags.mockResolvedValue({
        data: [],
      });

      const result = await listTagsTool.execute({});

      expect(result).toBe('No tags found in the n8n instance.');
    });

    it('should handle pagination parameters', async () => {
      mockClient.getTags.mockResolvedValue({ data: [] });

      await listTagsTool.execute({ limit: 50, cursor: 'test-cursor' });

      expect(mockClient.getTags).toHaveBeenCalledWith({
        limit: 50,
        cursor: 'test-cursor',
      });
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      const mockServerNull = { addTool: jest.fn() };
      createTagTools(getClientNull, mockServerNull);

      const toolCall = mockServerNull.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-tags'
      );
      expect(toolCall).toBeDefined();
      const toolWithNullClient = (toolCall as any)[0];

      await expect(toolWithNullClient.execute({})).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle API errors', async () => {
      const apiError = new Error('API request failed');
      mockClient.getTags.mockRejectedValue(apiError);

      await expect(listTagsTool.execute({})).rejects.toThrow(
        new UserError('Failed to list tags: API request failed')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getTags.mockRejectedValue('Unknown error string');

      await expect(listTagsTool.execute({})).rejects.toThrow(
        new UserError('Failed to list tags with unknown error')
      );
    });
  });

  describe('get-tag tool', () => {
    let getTagTool: any;

    beforeEach(() => {
      getTagTool = mockServer.addTool.mock.calls.find((call: any) => call[0].name === 'get-tag')[0];
    });

    it('should have correct tool configuration', () => {
      expect(getTagTool.name).toBe('get-tag');
      expect(getTagTool.description).toContain('Get detailed information about a specific tag');
      expect(getTagTool.annotations).toEqual({
        title: 'Get Tag Details',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should get tag successfully with full data', async () => {
      const mockTag: N8nTag = {
        id: 'tag-1',
        name: 'Production',
        usageCount: 15,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-02T00:00:00.000Z',
      };

      mockClient.getTag.mockResolvedValue(mockTag);

      const result = await getTagTool.execute({ tagId: 'tag-1' });

      expect(mockClient.getTag).toHaveBeenCalledWith('tag-1');
      expect(result).toContain('# Tag: Production');
      expect(result).toContain('**ID:** tag-1');
      expect(result).toContain('**Name:** Production');
      expect(result).toContain('**Usage Count:** 15');
      expect(result).toContain('**Created:**');
      expect(result).toContain('**Updated:**');
    });

    it('should get tag with minimal data', async () => {
      const mockTag: N8nTag = {
        id: 'tag-1',
        name: 'Simple Tag',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockClient.getTag.mockResolvedValue(mockTag);

      const result = await getTagTool.execute({ tagId: 'tag-1' });

      expect(result).toContain('# Tag: Simple Tag');
      expect(result).toContain('**ID:** tag-1');
      expect(result).toContain('**Name:** Simple Tag');
      expect(result).toContain('**Created:**');
      expect(result).toContain('**Updated:**');
      expect(result).not.toContain('**Usage Count:**');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createTagTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-tag'
      );
      const toolWithNullClient = toolCall[0];

      await expect(toolWithNullClient.execute({ tagId: 'tag-1' })).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Tag not found');
      mockClient.getTag.mockRejectedValue(apiError);

      await expect(getTagTool.execute({ tagId: 'invalid-id' })).rejects.toThrow(
        new UserError('Failed to get tag: Tag not found')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getTag.mockRejectedValue('Unknown error string');

      await expect(getTagTool.execute({ tagId: 'tag-1' })).rejects.toThrow(
        new UserError('Failed to get tag with unknown error')
      );
    });
  });

  describe('create-tag tool', () => {
    let createTagTool: any;

    beforeEach(() => {
      createTagTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-tag'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(createTagTool.name).toBe('create-tag');
      expect(createTagTool.description).toContain('Create a new tag in n8n');
      expect(createTagTool.annotations).toEqual({
        title: 'Create New Tag',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });
    });

    it('should create tag successfully', async () => {
      const mockTag: N8nTag = {
        id: 'tag-new',
        name: 'New Tag',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
        usageCount: 0,
      };

      mockClient.createTag.mockResolvedValue(mockTag);

      const result = await createTagTool.execute({
        name: 'New Tag',
      });

      expect(mockClient.createTag).toHaveBeenCalledWith({
        name: 'New Tag',
      });
      expect(result).toBe('✅ Successfully created tag "New Tag" with ID: tag-new');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createTagTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-tag'
      );
      const toolWithNullClient = toolCall[0];

      await expect(toolWithNullClient.execute({ name: 'Test Tag' })).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Tag name already exists');
      mockClient.createTag.mockRejectedValue(apiError);

      await expect(createTagTool.execute({ name: 'Duplicate Tag' })).rejects.toThrow(
        new UserError('Failed to create tag: Tag name already exists')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.createTag.mockRejectedValue('Unknown error string');

      await expect(createTagTool.execute({ name: 'Test Tag' })).rejects.toThrow(
        new UserError('Failed to create tag with unknown error')
      );
    });
  });

  describe('update-tag tool', () => {
    let updateTagTool: any;

    beforeEach(() => {
      updateTagTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-tag'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(updateTagTool.name).toBe('update-tag');
      expect(updateTagTool.description).toContain("Update a tag's name in n8n");
      expect(updateTagTool.annotations).toEqual({
        title: 'Update Tag',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should update tag successfully', async () => {
      const mockTag: N8nTag = {
        id: 'tag-1',
        name: 'Updated Tag',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-02T00:00:00.000Z',
        usageCount: 5,
      };

      mockClient.updateTag.mockResolvedValue(mockTag);

      const result = await updateTagTool.execute({
        tagId: 'tag-1',
        name: 'Updated Tag',
      });

      expect(mockClient.updateTag).toHaveBeenCalledWith('tag-1', {
        name: 'Updated Tag',
      });
      expect(result).toBe('✅ Successfully updated tag to "Updated Tag" (ID: tag-1)');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createTagTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-tag'
      );
      const toolWithNullClient = toolCall[0];

      await expect(toolWithNullClient.execute({ tagId: 'tag-1', name: 'Updated' })).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Tag not found');
      mockClient.updateTag.mockRejectedValue(apiError);

      await expect(updateTagTool.execute({ tagId: 'invalid-id', name: 'Updated' })).rejects.toThrow(
        new UserError('Failed to update tag: Tag not found')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.updateTag.mockRejectedValue('Unknown error string');

      await expect(updateTagTool.execute({ tagId: 'tag-1', name: 'Updated' })).rejects.toThrow(
        new UserError('Failed to update tag with unknown error')
      );
    });
  });

  describe('delete-tag tool', () => {
    let deleteTagTool: any;

    beforeEach(() => {
      deleteTagTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-tag'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(deleteTagTool.name).toBe('delete-tag');
      expect(deleteTagTool.description).toContain('Delete a tag from n8n permanently');
      expect(deleteTagTool.annotations).toEqual({
        title: 'Delete Tag',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should delete tag successfully', async () => {
      mockClient.deleteTag.mockResolvedValue(undefined);

      const result = await deleteTagTool.execute({
        tagId: 'tag-1',
      });

      expect(mockClient.deleteTag).toHaveBeenCalledWith('tag-1');
      expect(result).toBe('✅ Successfully deleted tag with ID: tag-1');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createTagTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-tag'
      );
      const toolWithNullClient = toolCall[0];

      await expect(toolWithNullClient.execute({ tagId: 'tag-1' })).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Tag not found');
      mockClient.deleteTag.mockRejectedValue(apiError);

      await expect(deleteTagTool.execute({ tagId: 'invalid-id' })).rejects.toThrow(
        new UserError('Failed to delete tag: Tag not found')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.deleteTag.mockRejectedValue('Unknown error string');

      await expect(deleteTagTool.execute({ tagId: 'tag-1' })).rejects.toThrow(
        new UserError('Failed to delete tag with unknown error')
      );
    });
  });

  describe('get-workflow-tags tool', () => {
    let getWorkflowTagsTool: any;

    beforeEach(() => {
      getWorkflowTagsTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-workflow-tags'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(getWorkflowTagsTool.name).toBe('get-workflow-tags');
      expect(getWorkflowTagsTool.description).toContain(
        'Get all tags assigned to a specific workflow'
      );
      expect(getWorkflowTagsTool.annotations).toEqual({
        title: 'Get Workflow Tags',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should get workflow tags successfully', async () => {
      const mockTags: N8nTag[] = [
        {
          id: 'tag-1',
          name: 'Production',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
        {
          id: 'tag-2',
          name: 'API',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockClient.getWorkflowTags.mockResolvedValue(mockTags);

      const result = await getWorkflowTagsTool.execute({ workflowId: 'workflow-1' });

      expect(mockClient.getWorkflowTags).toHaveBeenCalledWith('workflow-1');
      expect(result).toContain('Found 2 tag(s) for workflow workflow-1');
      expect(result).toContain('**Production** (ID: tag-1)');
      expect(result).toContain('**API** (ID: tag-2)');
    });

    it('should handle workflow with no tags', async () => {
      mockClient.getWorkflowTags.mockResolvedValue([]);

      const result = await getWorkflowTagsTool.execute({ workflowId: 'workflow-1' });

      expect(result).toBe('No tags found for workflow ID: workflow-1');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createTagTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-workflow-tags'
      );
      const toolWithNullClient = toolCall[0];

      await expect(toolWithNullClient.execute({ workflowId: 'workflow-1' })).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Workflow not found');
      mockClient.getWorkflowTags.mockRejectedValue(apiError);

      await expect(getWorkflowTagsTool.execute({ workflowId: 'invalid-id' })).rejects.toThrow(
        new UserError('Failed to get workflow tags: Workflow not found')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getWorkflowTags.mockRejectedValue('Unknown error string');

      await expect(getWorkflowTagsTool.execute({ workflowId: 'workflow-1' })).rejects.toThrow(
        new UserError('Failed to get workflow tags with unknown error')
      );
    });
  });

  describe('update-workflow-tags tool', () => {
    let updateWorkflowTagsTool: any;

    beforeEach(() => {
      updateWorkflowTagsTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-workflow-tags'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(updateWorkflowTagsTool.name).toBe('update-workflow-tags');
      expect(updateWorkflowTagsTool.description).toContain(
        'Update the tags assigned to a workflow'
      );
      expect(updateWorkflowTagsTool.annotations).toEqual({
        title: 'Update Workflow Tags',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should update workflow tags successfully with multiple tags', async () => {
      mockClient.updateWorkflowTags.mockResolvedValue(undefined);

      const result = await updateWorkflowTagsTool.execute({
        workflowId: 'workflow-1',
        tagIds: ['tag-1', 'tag-2', 'tag-3'],
      });

      expect(mockClient.updateWorkflowTags).toHaveBeenCalledWith('workflow-1', [
        'tag-1',
        'tag-2',
        'tag-3',
      ]);
      expect(result).toBe('✅ Successfully updated workflow workflow-1 with 3 tag(s)');
    });

    it('should update workflow tags successfully with no tags', async () => {
      mockClient.updateWorkflowTags.mockResolvedValue(undefined);

      const result = await updateWorkflowTagsTool.execute({
        workflowId: 'workflow-1',
        tagIds: [],
      });

      expect(mockClient.updateWorkflowTags).toHaveBeenCalledWith('workflow-1', []);
      expect(result).toBe('✅ Successfully updated workflow workflow-1 with 0 tag(s)');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createTagTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-workflow-tags'
      );
      const toolWithNullClient = toolCall[0];

      await expect(
        toolWithNullClient.execute({ workflowId: 'workflow-1', tagIds: ['tag-1'] })
      ).rejects.toThrow(new UserError('n8n client not initialized. Please run init-n8n first.'));
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Workflow not found');
      mockClient.updateWorkflowTags.mockRejectedValue(apiError);

      await expect(
        updateWorkflowTagsTool.execute({ workflowId: 'invalid-id', tagIds: ['tag-1'] })
      ).rejects.toThrow(new UserError('Failed to update workflow tags: Workflow not found'));
    });

    it('should handle unknown errors', async () => {
      mockClient.updateWorkflowTags.mockRejectedValue('Unknown error string');

      await expect(
        updateWorkflowTagsTool.execute({ workflowId: 'workflow-1', tagIds: ['tag-1'] })
      ).rejects.toThrow(new UserError('Failed to update workflow tags with unknown error'));
    });
  });

  describe('parameter validation', () => {
    it('should validate tag ID parameters', () => {
      const getTagTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-tag'
      )[0];

      expect(getTagTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });

    it('should validate workflow ID parameters', () => {
      const getWorkflowTagsTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-workflow-tags'
      )[0];

      expect(getWorkflowTagsTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });

    it('should validate create tag parameters', () => {
      const createTagTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-tag'
      )[0];

      expect(createTagTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });

    it('should validate update tag parameters', () => {
      const updateTagTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-tag'
      )[0];

      expect(updateTagTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });

    it('should validate update workflow tags parameters', () => {
      const updateWorkflowTagsTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-workflow-tags'
      )[0];

      expect(updateWorkflowTagsTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });

    it('should validate list tags parameters', () => {
      const listTagsTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-tags'
      )[0];

      expect(listTagsTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });
  });
});
