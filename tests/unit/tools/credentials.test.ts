import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createCredentialTools } from '../../../src/tools/credentials';
import { N8nClient } from '../../../src/client/n8nClient';
import { N8nCredential, CreateCredentialRequest } from '../../../src/types/n8n';

describe('Credential Tools', () => {
  let mockClient: jest.Mocked<N8nClient>;
  let mockServer: any;
  let getClient: () => N8nClient | null;

  beforeEach(() => {
    mockClient = (global as any).testUtils.createMockClient() as jest.Mocked<N8nClient>;
    getClient = jest.fn(() => mockClient);
    mockServer = {
      addTool: jest.fn(),
    };

    // Register credential tools
    createCredentialTools(getClient, mockServer);
  });

  it('should register all credential tools', () => {
    expect(mockServer.addTool).toHaveBeenCalledTimes(5);

    const toolNames = mockServer.addTool.mock.calls.map((call: any) => call[0].name);
    expect(toolNames).toContain('list-credentials');
    expect(toolNames).toContain('get-credential');
    expect(toolNames).toContain('create-credential');
    expect(toolNames).toContain('delete-credential');
    expect(toolNames).toContain('get-credential-schema');
  });

  describe('list-credentials tool', () => {
    let listCredentialsTool: any;

    beforeEach(() => {
      listCredentialsTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-credentials'
      )[0];
    });

    it('should list credentials successfully with full data', async () => {
      const mockCredentials: N8nCredential[] = [
        {
          id: 'cred-1',
          name: 'Test Credential 1',
          type: 'httpBasicAuth',
          homeProject: {
            id: 'proj-1',
            name: 'Test Project',
            type: 'Personal',
          },
          sharedWith: [
            {
              id: 'share-1',
              user: {
                id: 'user-1',
                email: 'test@example.com',
                firstName: 'John',
                lastName: 'Doe',
              },
              role: 'owner',
            },
          ],
          scopes: ['workflow', 'credential'],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
        {
          id: 'cred-2',
          name: 'Test Credential 2',
          type: 'oauth2Api',
          createdAt: '2024-01-03T00:00:00.000Z',
        },
      ];

      mockClient.getCredentials.mockResolvedValue({
        data: mockCredentials,
        nextCursor: 'next-cursor-123',
      });

      const result = await listCredentialsTool.execute({});

      expect(mockClient.getCredentials).toHaveBeenCalledWith({});
      expect(result).toContain('Found 2 credential(s):');
      expect(result).toContain('**Test Credential 1**');
      expect(result).toContain('ID: cred-1');
      expect(result).toContain('Type: httpBasicAuth');
      expect(result).toContain('Project: Test Project (Personal)');
      expect(result).toContain('Shared with: 1 user(s)');
      expect(result).toContain('Scopes: workflow, credential');
      expect(result).toContain('Created: 12/31/2023');
      expect(result).toContain('Updated: 1/1/2024');
      expect(result).toContain('**Test Credential 2**');
      expect(result).toContain('Use cursor "next-cursor-123" to get the next page');
    });

    it('should list credentials with pagination options', async () => {
      const mockCredentials: N8nCredential[] = [
        {
          id: 'cred-1',
          name: 'Test Credential',
          type: 'httpBasicAuth',
        },
      ];

      mockClient.getCredentials.mockResolvedValue({
        data: mockCredentials,
      });

      await listCredentialsTool.execute({ limit: 10, cursor: 'test-cursor' });

      expect(mockClient.getCredentials).toHaveBeenCalledWith({
        limit: 10,
        cursor: 'test-cursor',
      });
    });

    it('should handle empty credentials list', async () => {
      mockClient.getCredentials.mockResolvedValue({
        data: [],
      });

      const result = await listCredentialsTool.execute({});

      expect(result).toBe('No credentials found in the n8n instance.');
    });

    it('should handle credentials without optional fields', async () => {
      const mockCredentials: N8nCredential[] = [
        {
          id: 'cred-minimal',
          name: 'Minimal Credential',
          type: 'basic',
        },
      ];

      mockClient.getCredentials.mockResolvedValue({
        data: mockCredentials,
      });

      const result = await listCredentialsTool.execute({});

      expect(result).toContain('**Minimal Credential**');
      expect(result).toContain('ID: cred-minimal');
      expect(result).toContain('Type: basic');
      expect(result).not.toContain('Project:');
      expect(result).not.toContain('Shared with:');
      expect(result).not.toContain('Scopes:');
      expect(result).not.toContain('Created:');
      expect(result).not.toContain('Updated:');
    });

    it('should handle API errors', async () => {
      mockClient.getCredentials.mockRejectedValue(new Error('API connection failed'));

      await expect(listCredentialsTool.execute({})).rejects.toThrow(
        'Failed to list credentials: API connection failed'
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getCredentials.mockRejectedValue('Unknown error');

      await expect(listCredentialsTool.execute({})).rejects.toThrow(
        'Failed to list credentials with unknown error'
      );
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createCredentialTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-credentials'
      )?.[0];

      expect(tool).toBeDefined();
      await expect((tool as any).execute({})).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should have correct tool annotations', () => {
      expect(listCredentialsTool.annotations).toEqual({
        title: 'List n8n Credentials',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should validate parameters with Zod schema', () => {
      // Valid parameters
      expect(() => listCredentialsTool.parameters.parse({})).not.toThrow();
      expect(() => listCredentialsTool.parameters.parse({ limit: 50 })).not.toThrow();
      expect(() => listCredentialsTool.parameters.parse({ cursor: 'test' })).not.toThrow();
      expect(() =>
        listCredentialsTool.parameters.parse({ limit: 25, cursor: 'test' })
      ).not.toThrow();

      // Invalid parameters
      expect(() => listCredentialsTool.parameters.parse({ limit: 0 })).toThrow();
      expect(() => listCredentialsTool.parameters.parse({ limit: 101 })).toThrow();
      expect(() => listCredentialsTool.parameters.parse({ limit: 'invalid' })).toThrow();
    });
  });

  describe('get-credential tool', () => {
    let getCredentialTool: any;

    beforeEach(() => {
      getCredentialTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-credential'
      )[0];
    });

    it('should get credential successfully with full data', async () => {
      const mockCredential: N8nCredential = {
        id: 'cred-1',
        name: 'Test Credential',
        type: 'httpBasicAuth',
        homeProject: {
          id: 'proj-1',
          name: 'Test Project',
          type: 'Personal',
        },
        sharedWith: [
          {
            id: 'share-1',
            user: {
              id: 'user-1',
              email: 'test@example.com',
              firstName: 'John',
              lastName: 'Doe',
            },
            role: 'owner',
          },
        ],
        nodesAccess: [
          {
            nodeType: 'HttpRequest',
            user: 'john.doe',
            date: new Date('2024-01-01T00:00:00.000Z'),
          },
        ],
        scopes: ['workflow', 'credential'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      mockClient.getCredential.mockResolvedValue(mockCredential);

      const result = await getCredentialTool.execute({ credentialId: 'cred-1' });

      expect(mockClient.getCredential).toHaveBeenCalledWith('cred-1');
      expect(result).toContain('# Credential: Test Credential');
      expect(result).toContain('**ID:** cred-1');
      expect(result).toContain('**Name:** Test Credential');
      expect(result).toContain('**Type:** httpBasicAuth');
      expect(result).toContain('**Project:** Test Project (Personal)');
      expect(result).toContain('## Shared With:');
      expect(result).toContain('1. John Doe (test@example.com) - Role: owner');
      expect(result).toContain('## Node Access:');
      expect(result).toContain('1. Node Type: HttpRequest');
      expect(result).toContain('- User: john.doe');
      expect(result).toContain('- Date: 12/31/2023, 6:00:00 PM');
      expect(result).toContain('**Scopes:** workflow, credential');
      expect(result).toContain('**Created:** 12/31/2023, 6:00:00 PM');
      expect(result).toContain('**Updated:** 1/1/2024, 6:00:00 PM');
      expect(result).toContain('Sensitive credential data is not displayed for security purposes');
    });

    it('should get credential with minimal data', async () => {
      const mockCredential: N8nCredential = {
        id: 'cred-minimal',
        name: 'Minimal Credential',
        type: 'basic',
      };

      mockClient.getCredential.mockResolvedValue(mockCredential);

      const result = await getCredentialTool.execute({ credentialId: 'cred-minimal' });

      expect(result).toContain('# Credential: Minimal Credential');
      expect(result).toContain('**ID:** cred-minimal');
      expect(result).toContain('**Type:** basic');
      expect(result).not.toContain('**Project:**');
      expect(result).not.toContain('## Shared With:');
      expect(result).not.toContain('## Node Access:');
      expect(result).not.toContain('**Scopes:**');
    });

    it('should handle API errors', async () => {
      mockClient.getCredential.mockRejectedValue(new Error('Credential not found'));

      await expect(getCredentialTool.execute({ credentialId: 'invalid' })).rejects.toThrow(
        'Failed to get credential: Credential not found'
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getCredential.mockRejectedValue({ error: 'Unknown' });

      await expect(getCredentialTool.execute({ credentialId: 'test' })).rejects.toThrow(
        'Failed to get credential with unknown error'
      );
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createCredentialTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-credential'
      )?.[0];

      expect(tool).toBeDefined();
      await expect((tool as any).execute({ credentialId: 'test' })).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should have correct tool annotations', () => {
      expect(getCredentialTool.annotations).toEqual({
        title: 'Get Credential Details',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should validate parameters with Zod schema', () => {
      // Valid parameters
      expect(() => getCredentialTool.parameters.parse({ credentialId: 'test-id' })).not.toThrow();

      // Invalid parameters
      expect(() => getCredentialTool.parameters.parse({})).toThrow();
      expect(() => getCredentialTool.parameters.parse({ credentialId: '' })).toThrow();
      expect(() => getCredentialTool.parameters.parse({ credentialId: 123 })).toThrow();
    });
  });

  describe('create-credential tool', () => {
    let createCredentialTool: any;

    beforeEach(() => {
      createCredentialTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-credential'
      )[0];
    });

    it('should create credential successfully with full data', async () => {
      const mockCredential: N8nCredential = {
        id: 'new-cred-1',
        name: 'New Test Credential',
        type: 'httpBasicAuth',
        homeProject: {
          id: 'proj-1',
          name: 'Test Project',
          type: 'Personal',
        },
      };

      mockClient.createCredential.mockResolvedValue(mockCredential);

      const credentialData = {
        name: 'New Test Credential',
        type: 'httpBasicAuth',
        data: { username: 'test', password: 'secret' },
        projectId: 'proj-1',
      };

      const result = await createCredentialTool.execute(credentialData);

      const expectedRequest: CreateCredentialRequest = {
        name: 'New Test Credential',
        type: 'httpBasicAuth',
        data: { username: 'test', password: 'secret' },
        projectId: 'proj-1',
      };

      expect(mockClient.createCredential).toHaveBeenCalledWith(expectedRequest);
      expect(result).toContain(
        '✅ Successfully created credential "New Test Credential" with ID: new-cred-1'
      );
      expect(result).toContain('Type: httpBasicAuth');
      expect(result).toContain('Project: Test Project');
    });

    it('should create credential without optional fields', async () => {
      const mockCredential: N8nCredential = {
        id: 'new-cred-2',
        name: 'Simple Credential',
        type: 'basic',
      };

      mockClient.createCredential.mockResolvedValue(mockCredential);

      const credentialData = {
        name: 'Simple Credential',
        type: 'basic',
        data: { token: 'abc123' },
      };

      const result = await createCredentialTool.execute(credentialData);

      const expectedRequest: CreateCredentialRequest = {
        name: 'Simple Credential',
        type: 'basic',
        data: { token: 'abc123' },
        projectId: undefined,
      };

      expect(mockClient.createCredential).toHaveBeenCalledWith(expectedRequest);
      expect(result).toContain(
        '✅ Successfully created credential "Simple Credential" with ID: new-cred-2'
      );
      expect(result).toContain('Type: basic');
      expect(result).not.toContain('Project:');
    });

    it('should handle API errors', async () => {
      mockClient.createCredential.mockRejectedValue(new Error('Invalid credential type'));

      const credentialData = {
        name: 'Test',
        type: 'invalid',
        data: { test: 'value' },
      };

      await expect(createCredentialTool.execute(credentialData)).rejects.toThrow(
        'Failed to create credential: Invalid credential type'
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.createCredential.mockRejectedValue({ code: 500 });

      const credentialData = {
        name: 'Test',
        type: 'basic',
        data: { test: 'value' },
      };

      await expect(createCredentialTool.execute(credentialData)).rejects.toThrow(
        'Failed to create credential with unknown error'
      );
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createCredentialTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-credential'
      )?.[0];

      expect(tool).toBeDefined();
      await expect(
        (tool as any).execute({
          name: 'Test',
          type: 'basic',
          data: { test: 'value' },
        })
      ).rejects.toThrow('n8n client not initialized. Please run init-n8n first.');
    });

    it('should have correct tool annotations', () => {
      expect(createCredentialTool.annotations).toEqual({
        title: 'Create New Credential',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });
    });

    it('should validate parameters with Zod schema', () => {
      // Valid parameters
      expect(() =>
        createCredentialTool.parameters.parse({
          name: 'Test Credential',
          type: 'httpBasicAuth',
          data: { username: 'test', password: 'secret' },
        })
      ).not.toThrow();

      expect(() =>
        createCredentialTool.parameters.parse({
          name: 'Test Credential',
          type: 'httpBasicAuth',
          data: { username: 'test', password: 'secret' },
          projectId: 'proj-1',
        })
      ).not.toThrow();

      // Invalid parameters
      expect(() => createCredentialTool.parameters.parse({})).toThrow();
      expect(() => createCredentialTool.parameters.parse({ name: '' })).toThrow();
      expect(() => createCredentialTool.parameters.parse({ name: 'Test', type: '' })).toThrow();
      expect(() =>
        createCredentialTool.parameters.parse({ name: 'Test', type: 'basic' })
      ).toThrow(); // missing data
      expect(() =>
        createCredentialTool.parameters.parse({ name: 'Test', type: 'basic', data: {} })
      ).toThrow(); // empty data
    });
  });

  describe('delete-credential tool', () => {
    let deleteCredentialTool: any;

    beforeEach(() => {
      deleteCredentialTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-credential'
      )[0];
    });

    it('should delete credential successfully', async () => {
      mockClient.deleteCredential.mockResolvedValue(undefined);

      const result = await deleteCredentialTool.execute({ credentialId: 'cred-to-delete' });

      expect(mockClient.deleteCredential).toHaveBeenCalledWith('cred-to-delete');
      expect(result).toBe('✅ Successfully deleted credential with ID: cred-to-delete');
    });

    it('should handle API errors', async () => {
      mockClient.deleteCredential.mockRejectedValue(new Error('Credential not found'));

      await expect(deleteCredentialTool.execute({ credentialId: 'invalid' })).rejects.toThrow(
        'Failed to delete credential: Credential not found'
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.deleteCredential.mockRejectedValue('Network error');

      await expect(deleteCredentialTool.execute({ credentialId: 'test' })).rejects.toThrow(
        'Failed to delete credential with unknown error'
      );
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createCredentialTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-credential'
      )?.[0];

      expect(tool).toBeDefined();
      await expect((tool as any).execute({ credentialId: 'test' })).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should have correct tool annotations', () => {
      expect(deleteCredentialTool.annotations).toEqual({
        title: 'Delete Credential',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should validate parameters with Zod schema', () => {
      // Valid parameters
      expect(() =>
        deleteCredentialTool.parameters.parse({ credentialId: 'test-id' })
      ).not.toThrow();

      // Invalid parameters
      expect(() => deleteCredentialTool.parameters.parse({})).toThrow();
      expect(() => deleteCredentialTool.parameters.parse({ credentialId: '' })).toThrow();
      expect(() => deleteCredentialTool.parameters.parse({ credentialId: 123 })).toThrow();
    });
  });

  describe('get-credential-schema tool', () => {
    let getCredentialSchemaTool: any;

    beforeEach(() => {
      getCredentialSchemaTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-credential-schema'
      )[0];
    });

    it('should get credential schema successfully', async () => {
      const mockSchema = {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            description: 'Username for authentication',
          },
          password: {
            type: 'string',
            description: 'Password for authentication',
            format: 'password',
          },
        },
        required: ['username', 'password'],
      };

      mockClient.getCredentialSchema.mockResolvedValue(mockSchema);

      const result = await getCredentialSchemaTool.execute({ credentialType: 'httpBasicAuth' });

      expect(mockClient.getCredentialSchema).toHaveBeenCalledWith('httpBasicAuth');
      expect(result).toContain('# Credential Schema: httpBasicAuth');
      expect(result).toContain('Schema definition for credential type "httpBasicAuth"');
      expect(result).toContain('```json');
      expect(result).toContain(JSON.stringify(mockSchema, null, 2));
      expect(result).toContain('```');
      expect(result).toContain(
        'Use this schema to understand the required fields when creating credentials'
      );
    });

    it('should handle API errors', async () => {
      mockClient.getCredentialSchema.mockRejectedValue(new Error('Schema not found'));

      await expect(getCredentialSchemaTool.execute({ credentialType: 'invalid' })).rejects.toThrow(
        'Failed to get credential schema: Schema not found'
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getCredentialSchema.mockRejectedValue(null);

      await expect(getCredentialSchemaTool.execute({ credentialType: 'test' })).rejects.toThrow(
        'Failed to get credential schema with unknown error'
      );
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createCredentialTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-credential-schema'
      )?.[0];

      expect(tool).toBeDefined();
      await expect((tool as any).execute({ credentialType: 'test' })).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should have correct tool annotations', () => {
      expect(getCredentialSchemaTool.annotations).toEqual({
        title: 'Get Credential Schema',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should validate parameters with Zod schema', () => {
      // Valid parameters
      expect(() =>
        getCredentialSchemaTool.parameters.parse({ credentialType: 'httpBasicAuth' })
      ).not.toThrow();

      // Invalid parameters
      expect(() => getCredentialSchemaTool.parameters.parse({})).toThrow();
      expect(() => getCredentialSchemaTool.parameters.parse({ credentialType: '' })).toThrow();
      expect(() => getCredentialSchemaTool.parameters.parse({ credentialType: 123 })).toThrow();
    });
  });
});
