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
});
