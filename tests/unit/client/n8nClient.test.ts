import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { N8nClient } from '../../../src/client/n8nClient';

// Mock node-fetch before importing
jest.mock('node-fetch');
import fetch, { Response } from 'node-fetch';
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('N8nClient', () => {
  let client: N8nClient;
  const baseUrl = 'https://test.n8n.io';
  const apiKey = 'test-api-key';

  beforeEach(() => {
    client = new N8nClient(baseUrl, apiKey);
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct base URL and API key', () => {
      expect(client).toBeInstanceOf(N8nClient);
    });

    it('should remove trailing slash from base URL', () => {
      const clientWithSlash = new N8nClient('https://test.n8n.io/', apiKey);
      expect(clientWithSlash).toBeInstanceOf(N8nClient);
    });
  });

  describe('makeRequest', () => {
    it('should make successful API request', async () => {
      const mockResponse = {
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        json: jest.fn(() => Promise.resolve({ success: true })),
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse as unknown as Response);

      const result = await client.getWorkflows();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/workflows',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-N8N-API-KEY': 'test-api-key',
            Accept: 'application/json',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual({ success: true });
    });

    it('should handle API error responses', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        text: jest.fn(() => Promise.resolve('Not Found')),
      };
      mockFetch.mockResolvedValue(mockResponse as unknown as Response);

      await expect(client.getWorkflows()).rejects.toThrow(
        'n8n API request failed: HTTP 404: Not Found'
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(client.getWorkflows()).rejects.toThrow('n8n API request failed: Network error');
    });

    it('should handle unknown errors', async () => {
      mockFetch.mockRejectedValue('Unknown error string');

      await expect(client.getWorkflows()).rejects.toThrow(
        'n8n API request failed with unknown error'
      );
    });

    it('should handle non-JSON responses', async () => {
      const mockResponse = {
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('text/plain'),
        },
        text: jest.fn(() => Promise.resolve('Plain text response')),
      };
      mockFetch.mockResolvedValue(mockResponse as unknown as Response);

      const result = await client.getWorkflows();
      expect(result).toBe('Plain text response');
    });
  });

  describe('workflow methods', () => {
    beforeEach(() => {
      const mockResponse = {
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        json: jest.fn(),
      };
      mockFetch.mockResolvedValue(mockResponse as unknown as Response);
    });

    it('should get workflows with pagination', async () => {
      const mockWorkflows = [
        (global as any).testUtils.createMockWorkflow({ id: '1' }),
        (global as any).testUtils.createMockWorkflow({ id: '2' }),
      ];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: mockWorkflows }),
        } as unknown as Response)
      );

      const result = await client.getWorkflows({ limit: 10, cursor: 'abc123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/workflows?limit=10&cursor=abc123',
        expect.any(Object)
      );
      expect(result.data).toEqual(mockWorkflows);
    });

    it('should get single workflow', async () => {
      const mockWorkflow = (global as any).testUtils.createMockWorkflow();

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockWorkflow),
        } as unknown as Response)
      );

      const result = await client.getWorkflow('workflow-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/workflows/workflow-123',
        expect.any(Object)
      );
      expect(result).toEqual(mockWorkflow);
    });

    it('should create workflow', async () => {
      const mockWorkflow = (global as any).testUtils.createMockWorkflow();
      const workflowData = {
        name: 'Test Workflow',
        nodes: [],
        connections: {},
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockWorkflow),
        } as unknown as Response)
      );

      const result = await client.createWorkflow(workflowData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/workflows',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(workflowData),
        })
      );
      expect(result).toEqual(mockWorkflow);
    });

    it('should update workflow', async () => {
      const mockWorkflow = (global as any).testUtils.createMockWorkflow();
      const workflowData = {
        name: 'Updated Workflow',
        nodes: [],
        connections: {},
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockWorkflow),
        } as unknown as Response)
      );

      const result = await client.updateWorkflow('workflow-123', workflowData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/workflows/workflow-123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(workflowData),
        })
      );
      expect(result).toEqual(mockWorkflow);
    });

    it('should activate workflow', async () => {
      const mockWorkflow = (global as any).testUtils.createMockWorkflow();

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockWorkflow),
        } as unknown as Response)
      );

      const result = await client.activateWorkflow('workflow-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/workflows/workflow-123/activate',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result).toEqual(mockWorkflow);
    });

    it('should deactivate workflow', async () => {
      const mockWorkflow = (global as any).testUtils.createMockWorkflow();

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockWorkflow),
        } as unknown as Response)
      );

      const result = await client.deactivateWorkflow('workflow-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/workflows/workflow-123/deactivate',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result).toEqual(mockWorkflow);
    });

    it('should delete workflow', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        } as unknown as Response)
      );

      await client.deleteWorkflow('workflow-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/workflows/workflow-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('user methods', () => {
    it('should get users', async () => {
      const mockUsers = [
        (global as any).testUtils.createMockUser({ id: '1' }),
        (global as any).testUtils.createMockUser({ id: '2' }),
      ];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: mockUsers }),
        } as unknown as Response)
      );

      const result = await client.getUsers();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/users',
        expect.any(Object)
      );
      expect(result.data).toEqual(mockUsers);
    });

    it('should get users with pagination', async () => {
      const mockUsers = [(global as any).testUtils.createMockUser({ id: '1' })];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: mockUsers }),
        } as unknown as Response)
      );

      const result = await client.getUsers({ limit: 10, cursor: 'user123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/users?limit=10&cursor=user123',
        expect.any(Object)
      );
      expect(result.data).toEqual(mockUsers);
    });

    it('should get single user', async () => {
      const mockUser = (global as any).testUtils.createMockUser();

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockUser),
        } as unknown as Response)
      );

      const result = await client.getUser('user-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/users/user-123',
        expect.any(Object)
      );
      expect(result).toEqual(mockUser);
    });

    it('should create user', async () => {
      const mockUser = (global as any).testUtils.createMockUser();
      const userData = {
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        password: 'password123',
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockUser),
        } as unknown as Response)
      );

      const result = await client.createUser(userData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(userData),
        })
      );
      expect(result).toEqual(mockUser);
    });

    it('should update user', async () => {
      const mockUser = (global as any).testUtils.createMockUser();
      const userData = {
        firstName: 'Updated',
        lastName: 'User',
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockUser),
        } as unknown as Response)
      );

      const result = await client.updateUser('user-123', userData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/users/user-123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(userData),
        })
      );
      expect(result).toEqual(mockUser);
    });

    it('should delete user', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        } as unknown as Response)
      );

      await client.deleteUser('user-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/users/user-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('execution methods', () => {
    it('should get executions', async () => {
      const mockExecutions = [
        (global as any).testUtils.createMockExecution({ id: '1' }),
        (global as any).testUtils.createMockExecution({ id: '2' }),
      ];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: mockExecutions }),
        } as unknown as Response)
      );

      const result = await client.getExecutions();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/executions',
        expect.any(Object)
      );
      expect(result.data).toEqual(mockExecutions);
    });

    it('should get executions with pagination', async () => {
      const mockExecutions = [(global as any).testUtils.createMockExecution({ id: '1' })];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: mockExecutions }),
        } as unknown as Response)
      );

      const result = await client.getExecutions({ limit: 5, cursor: 'exec123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/executions?limit=5&cursor=exec123',
        expect.any(Object)
      );
      expect(result.data).toEqual(mockExecutions);
    });

    it('should get single execution', async () => {
      const mockExecution = (global as any).testUtils.createMockExecution();

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockExecution),
        } as unknown as Response)
      );

      const result = await client.getExecution('execution-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/executions/execution-123',
        expect.any(Object)
      );
      expect(result).toEqual(mockExecution);
    });

    it('should delete execution', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        } as unknown as Response)
      );

      await client.deleteExecution('execution-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/executions/execution-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('credential methods', () => {
    it('should get credentials', async () => {
      const mockCredentials = [
        (global as any).testUtils.createMockCredential({ id: '1' }),
        (global as any).testUtils.createMockCredential({ id: '2' }),
      ];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: mockCredentials }),
        } as unknown as Response)
      );

      const result = await client.getCredentials();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/credentials',
        expect.any(Object)
      );
      expect(result.data).toEqual(mockCredentials);
    });

    it('should get credentials with pagination', async () => {
      const mockCredentials = [(global as any).testUtils.createMockCredential({ id: '1' })];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: mockCredentials }),
        } as unknown as Response)
      );

      const result = await client.getCredentials({ limit: 10, cursor: 'cred123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/credentials?limit=10&cursor=cred123',
        expect.any(Object)
      );
      expect(result.data).toEqual(mockCredentials);
    });

    it('should get single credential', async () => {
      const mockCredential = (global as any).testUtils.createMockCredential();

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockCredential),
        } as unknown as Response)
      );

      const result = await client.getCredential('credential-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/credentials/credential-123',
        expect.any(Object)
      );
      expect(result).toEqual(mockCredential);
    });

    it('should create credential', async () => {
      const mockCredential = (global as any).testUtils.createMockCredential();
      const credentialData = {
        name: 'Test Credential',
        type: 'httpBasicAuth',
        data: { username: 'test', password: 'pass' },
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockCredential),
        } as unknown as Response)
      );

      const result = await client.createCredential(credentialData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/credentials',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(credentialData),
        })
      );
      expect(result).toEqual(mockCredential);
    });

    it('should delete credential', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        } as unknown as Response)
      );

      await client.deleteCredential('credential-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/credentials/credential-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should get credential schema', async () => {
      const mockSchema = { properties: { username: { type: 'string' } } };

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockSchema),
        } as unknown as Response)
      );

      const result = await client.getCredentialSchema('httpBasicAuth');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/credentials/schema/httpBasicAuth',
        expect.any(Object)
      );
      expect(result).toEqual(mockSchema);
    });
  });

  describe('project methods', () => {
    it('should get projects', async () => {
      const mockProjects = [
        (global as any).testUtils.createMockProject({ id: '1' }),
        (global as any).testUtils.createMockProject({ id: '2' }),
      ];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: mockProjects }),
        } as unknown as Response)
      );

      const result = await client.getProjects();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/projects',
        expect.any(Object)
      );
      expect(result.data).toEqual(mockProjects);
    });

    it('should get projects with pagination', async () => {
      const mockProjects = [(global as any).testUtils.createMockProject({ id: '1' })];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: mockProjects }),
        } as unknown as Response)
      );

      const result = await client.getProjects({ limit: 5, cursor: 'proj123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/projects?limit=5&cursor=proj123',
        expect.any(Object)
      );
      expect(result.data).toEqual(mockProjects);
    });

    it('should create project', async () => {
      const mockProject = (global as any).testUtils.createMockProject();
      const projectData = {
        name: 'Test Project',
        type: 'team',
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockProject),
        } as unknown as Response)
      );

      const result = await client.createProject(projectData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/projects',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(projectData),
        })
      );
      expect(result).toEqual(mockProject);
    });

    it('should update project', async () => {
      const mockProject = (global as any).testUtils.createMockProject();
      const projectData = {
        name: 'Updated Project',
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockProject),
        } as unknown as Response)
      );

      const result = await client.updateProject('project-123', projectData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/projects/project-123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(projectData),
        })
      );
      expect(result).toEqual(mockProject);
    });

    it('should delete project', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        } as unknown as Response)
      );

      await client.deleteProject('project-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/projects/project-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('variable methods', () => {
    it('should get variables', async () => {
      const mockVariables = [
        (global as any).testUtils.createMockVariable({ id: '1' }),
        (global as any).testUtils.createMockVariable({ id: '2' }),
      ];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: mockVariables }),
        } as unknown as Response)
      );

      const result = await client.getVariables();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/variables',
        expect.any(Object)
      );
      expect(result.data).toEqual(mockVariables);
    });

    it('should get variables with pagination', async () => {
      const mockVariables = [(global as any).testUtils.createMockVariable({ id: '1' })];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: mockVariables }),
        } as unknown as Response)
      );

      const result = await client.getVariables({ limit: 20, cursor: 'var123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/variables?limit=20&cursor=var123',
        expect.any(Object)
      );
      expect(result.data).toEqual(mockVariables);
    });

    it('should create variable', async () => {
      const mockVariable = (global as any).testUtils.createMockVariable();
      const variableData = {
        key: 'TEST_VAR',
        value: 'test-value',
        type: 'string' as const,
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockVariable),
        } as unknown as Response)
      );

      const result = await client.createVariable(variableData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/variables',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(variableData),
        })
      );
      expect(result).toEqual(mockVariable);
    });

    it('should delete variable', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        } as unknown as Response)
      );

      await client.deleteVariable('variable-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/variables/variable-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('tag methods', () => {
    it('should get tags', async () => {
      const mockTags = [
        (global as any).testUtils.createMockTag({ id: '1' }),
        (global as any).testUtils.createMockTag({ id: '2' }),
      ];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: mockTags }),
        } as unknown as Response)
      );

      const result = await client.getTags();

      expect(mockFetch).toHaveBeenCalledWith('https://test.n8n.io/api/v1/tags', expect.any(Object));
      expect(result.data).toEqual(mockTags);
    });

    it('should get tags with pagination', async () => {
      const mockTags = [(global as any).testUtils.createMockTag({ id: '1' })];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: mockTags }),
        } as unknown as Response)
      );

      const result = await client.getTags({ limit: 15, cursor: 'tag123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/tags?limit=15&cursor=tag123',
        expect.any(Object)
      );
      expect(result.data).toEqual(mockTags);
    });

    it('should get single tag', async () => {
      const mockTag = (global as any).testUtils.createMockTag();

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockTag),
        } as unknown as Response)
      );

      const result = await client.getTag('tag-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/tags/tag-123',
        expect.any(Object)
      );
      expect(result).toEqual(mockTag);
    });

    it('should create tag', async () => {
      const mockTag = (global as any).testUtils.createMockTag();
      const tagData = {
        name: 'Test Tag',
        color: '#ff0000',
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockTag),
        } as unknown as Response)
      );

      const result = await client.createTag(tagData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/tags',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(tagData),
        })
      );
      expect(result).toEqual(mockTag);
    });

    it('should update tag', async () => {
      const mockTag = (global as any).testUtils.createMockTag();
      const tagData = {
        name: 'Updated Tag',
        color: '#00ff00',
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockTag),
        } as unknown as Response)
      );

      const result = await client.updateTag('tag-123', tagData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/tags/tag-123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(tagData),
        })
      );
      expect(result).toEqual(mockTag);
    });

    it('should delete tag', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        } as unknown as Response)
      );

      await client.deleteTag('tag-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/tags/tag-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should get workflow tags', async () => {
      const mockTags = [
        (global as any).testUtils.createMockTag({ id: '1' }),
        (global as any).testUtils.createMockTag({ id: '2' }),
      ];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockTags),
        } as unknown as Response)
      );

      const result = await client.getWorkflowTags('workflow-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/workflows/workflow-123/tags',
        expect.any(Object)
      );
      expect(result).toEqual(mockTags);
    });

    it('should update workflow tags', async () => {
      const tagIds = ['tag-1', 'tag-2'];

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        } as unknown as Response)
      );

      await client.updateWorkflowTags('workflow-123', tagIds);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/workflows/workflow-123/tags',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ tagIds }),
        })
      );
    });
  });

  describe('audit methods', () => {
    it('should generate audit report', async () => {
      const mockAuditReport = (global as any).testUtils.createMockAuditReport();

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockAuditReport),
        } as unknown as Response)
      );

      const result = await client.generateAuditReport();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.n8n.io/api/v1/audit',
        expect.any(Object)
      );
      expect(result).toEqual(mockAuditReport);
    });
  });
});
