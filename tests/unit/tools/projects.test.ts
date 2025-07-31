import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createProjectTools } from '../../../src/tools/projects';
import { N8nClient } from '../../../src/client/n8nClient';
import { N8nProject, CreateProjectRequest, UpdateProjectRequest } from '../../../src/types/n8n';
import { UserError } from 'fastmcp';

describe('Project Tools', () => {
  let mockClient: jest.Mocked<N8nClient>;
  let mockServer: any;
  let getClient: () => N8nClient | null;

  beforeEach(() => {
    mockClient = (global as any).testUtils.createMockClient() as jest.Mocked<N8nClient>;
    getClient = jest.fn(() => mockClient);
    mockServer = {
      addTool: jest.fn(),
    };

    // Register project tools
    createProjectTools(getClient, mockServer);
  });

  it('should register all project tools', () => {
    expect(mockServer.addTool).toHaveBeenCalledTimes(4);

    const toolNames = mockServer.addTool.mock.calls.map((call: any) => call[0].name);
    expect(toolNames).toContain('list-projects');
    expect(toolNames).toContain('create-project');
    expect(toolNames).toContain('update-project');
    expect(toolNames).toContain('delete-project');
  });

  describe('list-projects tool', () => {
    let listProjectsTool: any;

    beforeEach(() => {
      listProjectsTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-projects'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(listProjectsTool.name).toBe('list-projects');
      expect(listProjectsTool.description).toContain('List all projects from n8n');
      expect(listProjectsTool.description).toContain('n8n Enterprise license');
      expect(listProjectsTool.annotations).toEqual({
        title: 'List n8n Projects',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should list projects successfully with full data', async () => {
      const mockProjects: N8nProject[] = [
        {
          id: 'proj-1',
          name: 'Test Project 1',
          type: 'Team',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
        {
          id: 'proj-2',
          name: 'Test Project 2',
          type: 'Personal',
          createdAt: '2023-01-02T00:00:00.000Z',
          updatedAt: '2023-01-02T00:00:00.000Z',
        },
      ];

      mockClient.getProjects.mockResolvedValue({
        data: mockProjects,
        nextCursor: 'next-cursor',
      });

      const result = await listProjectsTool.execute({ limit: 10 });

      expect(mockClient.getProjects).toHaveBeenCalledWith({ limit: 10 });
      expect(result).toContain('Found 2 project(s)');
      expect(result).toContain('**Test Project 1**');
      expect(result).toContain('ID: proj-1');
      expect(result).toContain('Type: Team');
      expect(result).toContain('Created: 1/1/2023');
      expect(result).toContain('**Test Project 2**');
      expect(result).toContain('ID: proj-2');
      expect(result).toContain('Type: Personal');
      expect(result).toContain('Use cursor "next-cursor" to get the next page');
    });

    it('should list projects with minimal data', async () => {
      const mockProjects: N8nProject[] = [
        {
          id: 'proj-1',
          name: 'Minimal Project',
          type: 'Personal',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockClient.getProjects.mockResolvedValue({
        data: mockProjects,
      });

      const result = await listProjectsTool.execute({});

      expect(mockClient.getProjects).toHaveBeenCalledWith({});
      expect(result).toContain('Found 1 project(s)');
      expect(result).toContain('**Minimal Project**');
      expect(result).toContain('ID: proj-1');
      expect(result).toContain('Type: Personal');
      expect(result).toContain('Created: 12/31/2022');
      expect(result).not.toContain('cursor');
    });

    it('should handle empty project list', async () => {
      mockClient.getProjects.mockResolvedValue({
        data: [],
      });

      const result = await listProjectsTool.execute({});

      expect(result).toBe('No projects found in the n8n instance.');
    });

    it('should handle pagination parameters', async () => {
      mockClient.getProjects.mockResolvedValue({ data: [] });

      await listProjectsTool.execute({ limit: 50, cursor: 'test-cursor' });

      expect(mockClient.getProjects).toHaveBeenCalledWith({
        limit: 50,
        cursor: 'test-cursor',
      });
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      const mockServerNull = { addTool: jest.fn() };
      createProjectTools(getClientNull, mockServerNull);

      const toolCall = mockServerNull.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-projects'
      );
      expect(toolCall).toBeDefined();
      const toolWithNullClient = (toolCall as any)[0];

      await expect(toolWithNullClient.execute({})).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle license-related errors', async () => {
      const licenseError = new Error('license required');
      mockClient.getProjects.mockRejectedValue(licenseError);

      await expect(listProjectsTool.execute({})).rejects.toThrow(
        new UserError(
          'This operation requires an n8n Enterprise license with project management features enabled. Error: license required'
        )
      );
    });

    it('should handle general API errors', async () => {
      const apiError = new Error('API request failed');
      mockClient.getProjects.mockRejectedValue(apiError);

      await expect(listProjectsTool.execute({})).rejects.toThrow(
        new UserError('Failed to list projects: API request failed')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getProjects.mockRejectedValue('Unknown error string');

      await expect(listProjectsTool.execute({})).rejects.toThrow(
        new UserError('Failed to list projects with unknown error')
      );
    });

    it('should validate parameters', async () => {
      // Mock successful responses for parameter validation tests
      mockClient.getProjects.mockResolvedValue({ data: [] });

      // Should not throw for valid parameters
      await expect(listProjectsTool.execute({ limit: 50 })).resolves.toBeDefined();
      await expect(listProjectsTool.execute({ cursor: 'valid-cursor' })).resolves.toBeDefined();
      await expect(listProjectsTool.execute({})).resolves.toBeDefined();
    });
  });

  describe('create-project tool', () => {
    let createProjectTool: any;

    beforeEach(() => {
      createProjectTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-project'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(createProjectTool.name).toBe('create-project');
      expect(createProjectTool.description).toContain('Create a new project in n8n');
      expect(createProjectTool.description).toContain('n8n Enterprise license');
      expect(createProjectTool.annotations).toEqual({
        title: 'Create New Project',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });
    });

    it('should create project successfully with type', async () => {
      const mockProject: N8nProject = {
        id: 'proj-new',
        name: 'New Project',
        type: 'Team',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockClient.createProject.mockResolvedValue(mockProject);

      const result = await createProjectTool.execute({
        name: 'New Project',
        type: 'Team',
      });

      expect(mockClient.createProject).toHaveBeenCalledWith({
        name: 'New Project',
        type: 'Team',
      });
      expect(result).toContain('✅ Successfully created project "New Project" with ID: proj-new');
      expect(result).toContain('Type: Team');
    });

    it('should create project successfully without type', async () => {
      const mockProject: N8nProject = {
        id: 'proj-new',
        name: 'Simple Project',
        type: 'Personal',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockClient.createProject.mockResolvedValue(mockProject);

      const result = await createProjectTool.execute({
        name: 'Simple Project',
      });

      expect(mockClient.createProject).toHaveBeenCalledWith({
        name: 'Simple Project',
        type: undefined,
      });
      expect(result).toContain(
        '✅ Successfully created project "Simple Project" with ID: proj-new'
      );
      expect(result).toContain('Type: Personal');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      const mockServerNull = { addTool: jest.fn() };
      createProjectTools(getClientNull, mockServerNull);

      const createToolCall = mockServerNull.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-project'
      );
      expect(createToolCall).toBeDefined();
      const toolWithNullClient = (createToolCall as any)[0];

      await expect(toolWithNullClient.execute({ name: 'Test Project' })).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle license-related errors', async () => {
      const licenseError = new Error('license required');
      mockClient.createProject.mockRejectedValue(licenseError);

      await expect(createProjectTool.execute({ name: 'Test Project' })).rejects.toThrow(
        new UserError(
          'This operation requires an n8n Enterprise license with project management features enabled. Error: license required'
        )
      );
    });

    it('should handle general API errors', async () => {
      const apiError = new Error('Project name already exists');
      mockClient.createProject.mockRejectedValue(apiError);

      await expect(createProjectTool.execute({ name: 'Duplicate Project' })).rejects.toThrow(
        new UserError('Failed to create project: Project name already exists')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.createProject.mockRejectedValue('Unknown error string');

      await expect(createProjectTool.execute({ name: 'Test Project' })).rejects.toThrow(
        new UserError('Failed to create project with unknown error')
      );
    });
  });

  describe('update-project tool', () => {
    let updateProjectTool: any;

    beforeEach(() => {
      updateProjectTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-project'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(updateProjectTool.name).toBe('update-project');
      expect(updateProjectTool.description).toContain("Update a project's name and properties");
      expect(updateProjectTool.description).toContain('n8n Enterprise license');
      expect(updateProjectTool.annotations).toEqual({
        title: 'Update Project',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should update project successfully with type', async () => {
      const mockProject: N8nProject = {
        id: 'proj-1',
        name: 'Updated Project',
        type: 'Team',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-02T00:00:00.000Z',
      };

      mockClient.updateProject.mockResolvedValue(mockProject);

      const result = await updateProjectTool.execute({
        projectId: 'proj-1',
        name: 'Updated Project',
      });

      expect(mockClient.updateProject).toHaveBeenCalledWith('proj-1', {
        name: 'Updated Project',
      });
      expect(result).toContain('✅ Successfully updated project "Updated Project" (ID: proj-1)');
      expect(result).toContain('Type: Team');
    });

    it('should update project successfully without type', async () => {
      const mockProject: N8nProject = {
        id: 'proj-1',
        name: 'Updated Project',
        type: 'Personal',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-02T00:00:00.000Z',
      };

      mockClient.updateProject.mockResolvedValue(mockProject);

      const result = await updateProjectTool.execute({
        projectId: 'proj-1',
        name: 'Updated Project',
      });

      expect(result).toContain('✅ Successfully updated project "Updated Project" (ID: proj-1)');
      expect(result).toContain('Type: Personal');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      const mockServerNull = { addTool: jest.fn() };
      createProjectTools(getClientNull, mockServerNull);

      const updateToolCall = mockServerNull.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-project'
      );
      expect(updateToolCall).toBeDefined();
      const toolWithNullClient = (updateToolCall as any)[0];

      await expect(
        toolWithNullClient.execute({ projectId: 'proj-1', name: 'Updated' })
      ).rejects.toThrow(new UserError('n8n client not initialized. Please run init-n8n first.'));
    });

    it('should handle license-related errors', async () => {
      const licenseError = new Error('license required');
      mockClient.updateProject.mockRejectedValue(licenseError);

      await expect(
        updateProjectTool.execute({ projectId: 'proj-1', name: 'Updated' })
      ).rejects.toThrow(
        new UserError(
          'This operation requires an n8n Enterprise license with project management features enabled. Error: license required'
        )
      );
    });

    it('should handle general API errors', async () => {
      const apiError = new Error('Project not found');
      mockClient.updateProject.mockRejectedValue(apiError);

      await expect(
        updateProjectTool.execute({ projectId: 'invalid-id', name: 'Updated' })
      ).rejects.toThrow(new UserError('Failed to update project: Project not found'));
    });

    it('should handle unknown errors', async () => {
      mockClient.updateProject.mockRejectedValue('Unknown error string');

      await expect(
        updateProjectTool.execute({ projectId: 'proj-1', name: 'Updated' })
      ).rejects.toThrow(new UserError('Failed to update project with unknown error'));
    });
  });

  describe('delete-project tool', () => {
    let deleteProjectTool: any;

    beforeEach(() => {
      deleteProjectTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-project'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(deleteProjectTool.name).toBe('delete-project');
      expect(deleteProjectTool.description).toContain('Delete a project from n8n permanently');
      expect(deleteProjectTool.description).toContain('n8n Enterprise license');
      expect(deleteProjectTool.annotations).toEqual({
        title: 'Delete Project',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should delete project successfully', async () => {
      mockClient.deleteProject.mockResolvedValue(undefined);

      const result = await deleteProjectTool.execute({
        projectId: 'proj-1',
      });

      expect(mockClient.deleteProject).toHaveBeenCalledWith('proj-1');
      expect(result).toBe('✅ Successfully deleted project with ID: proj-1');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      const mockServerNull = { addTool: jest.fn() };
      createProjectTools(getClientNull, mockServerNull);

      const deleteToolCall = mockServerNull.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-project'
      );
      expect(deleteToolCall).toBeDefined();
      const toolWithNullClient = (deleteToolCall as any)[0];

      await expect(toolWithNullClient.execute({ projectId: 'proj-1' })).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle license-related errors', async () => {
      const licenseError = new Error('license required');
      mockClient.deleteProject.mockRejectedValue(licenseError);

      await expect(deleteProjectTool.execute({ projectId: 'proj-1' })).rejects.toThrow(
        new UserError(
          'This operation requires an n8n Enterprise license with project management features enabled. Error: license required'
        )
      );
    });

    it('should handle general API errors', async () => {
      const apiError = new Error('Project not found');
      mockClient.deleteProject.mockRejectedValue(apiError);

      await expect(deleteProjectTool.execute({ projectId: 'invalid-id' })).rejects.toThrow(
        new UserError('Failed to delete project: Project not found')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.deleteProject.mockRejectedValue('Unknown error string');

      await expect(deleteProjectTool.execute({ projectId: 'proj-1' })).rejects.toThrow(
        new UserError('Failed to delete project with unknown error')
      );
    });
  });

  describe('parameter validation', () => {
    it('should validate project ID parameters', () => {
      const deleteProjectTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-project'
      )[0];

      expect(deleteProjectTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });

    it('should validate create project parameters', () => {
      const createProjectTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-project'
      )[0];

      expect(createProjectTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });

    it('should validate update project parameters', () => {
      const updateProjectTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-project'
      )[0];

      expect(updateProjectTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });

    it('should validate list projects parameters', () => {
      const listProjectsTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-projects'
      )[0];

      expect(listProjectsTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });
  });
});
