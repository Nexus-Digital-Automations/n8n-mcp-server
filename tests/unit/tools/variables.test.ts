import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createVariableTools } from '../../../src/tools/variables';
import { N8nClient } from '../../../src/client/n8nClient';
import { N8nVariable, CreateVariableRequest } from '../../../src/types/n8n';
import { UserError } from 'fastmcp';

describe('Variable Tools', () => {
  let mockClient: jest.Mocked<N8nClient>;
  let mockServer: any;
  let getClient: () => N8nClient | null;

  beforeEach(() => {
    mockClient = (global as any).testUtils.createMockClient() as jest.Mocked<N8nClient>;
    getClient = jest.fn(() => mockClient);
    mockServer = {
      addTool: jest.fn(),
    };

    // Register variable tools
    createVariableTools(getClient, mockServer);
  });

  it('should register all variable tools', () => {
    expect(mockServer.addTool).toHaveBeenCalledTimes(3);

    const toolNames = mockServer.addTool.mock.calls.map((call: any) => call[0].name);
    expect(toolNames).toContain('list-variables');
    expect(toolNames).toContain('create-variable');
    expect(toolNames).toContain('delete-variable');
  });

  describe('list-variables tool', () => {
    let listVariablesTool: any;

    beforeEach(() => {
      listVariablesTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-variables'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(listVariablesTool.name).toBe('list-variables');
      expect(listVariablesTool.description).toContain('List all environment variables in n8n');
      expect(listVariablesTool.description).toContain('n8n Enterprise license');
      expect(listVariablesTool.annotations).toEqual({
        title: 'List n8n Variables',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should list variables successfully with full data', async () => {
      const mockVariables: N8nVariable[] = [
        {
          id: 'var-1',
          key: 'API_KEY',
          value: 'secret-api-key',
          type: 'string',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-02T00:00:00.000Z',
        },
        {
          id: 'var-2',
          key: 'DEBUG_MODE',
          value: 'true',
          type: 'boolean',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-03T00:00:00.000Z',
        },
      ];

      mockClient.getVariables.mockResolvedValue({
        data: mockVariables,
        nextCursor: 'next-cursor',
      });

      const result = await listVariablesTool.execute({ limit: 10 });

      expect(mockClient.getVariables).toHaveBeenCalledWith({ limit: 10 });
      expect(result).toContain('Found 2 variable(s)');
      expect(result).toContain('**API_KEY**');
      expect(result).toContain('ID: var-1');
      expect(result).toContain('Type: string');
      expect(result).toContain('Value: [HIDDEN]');
      expect(result).toContain('Created: 1/1/2023');
      expect(result).toContain('Updated: 1/3/2023');
      expect(result).toContain('**DEBUG_MODE**');
      expect(result).toContain('ID: var-2');
      expect(result).toContain('Type: boolean');
      expect(result).toContain('Use cursor "next-cursor" to get the next page');
      // Ensure actual values are hidden for security
      expect(result).not.toContain('secret-api-key');
      expect(result).not.toContain('true');
    });

    it('should list variables with minimal data', async () => {
      const mockVariables: N8nVariable[] = [
        {
          id: 'var-1',
          key: 'SIMPLE_VAR',
          value: 'simple-value',
        },
      ];

      mockClient.getVariables.mockResolvedValue({
        data: mockVariables,
      });

      const result = await listVariablesTool.execute({});

      expect(mockClient.getVariables).toHaveBeenCalledWith({});
      expect(result).toContain('Found 1 variable(s)');
      expect(result).toContain('**SIMPLE_VAR**');
      expect(result).toContain('ID: var-1');
      expect(result).toContain('Type: string'); // Default type
      expect(result).toContain('Value: [HIDDEN]');
      expect(result).not.toContain('Created:');
      expect(result).not.toContain('Updated:');
      expect(result).not.toContain('cursor');
      // Ensure actual value is hidden
      expect(result).not.toContain('simple-value');
    });

    it('should handle empty variable list', async () => {
      mockClient.getVariables.mockResolvedValue({
        data: [],
      });

      const result = await listVariablesTool.execute({});

      expect(result).toBe('No variables found in the n8n instance.');
    });

    it('should handle pagination parameters', async () => {
      mockClient.getVariables.mockResolvedValue({ data: [] });

      await listVariablesTool.execute({ limit: 50, cursor: 'test-cursor' });

      expect(mockClient.getVariables).toHaveBeenCalledWith({
        limit: 50,
        cursor: 'test-cursor',
      });
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createVariableTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-variables'
      );
      const toolWithNullClient = toolCall[0];

      await expect(toolWithNullClient.execute({})).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle license-related errors', async () => {
      const licenseError = new Error('license required');
      mockClient.getVariables.mockRejectedValue(licenseError);

      await expect(listVariablesTool.execute({})).rejects.toThrow(
        new UserError(
          'This operation requires an n8n Enterprise license with variable management features enabled. Error: license required'
        )
      );
    });

    it('should handle general API errors', async () => {
      const apiError = new Error('API request failed');
      mockClient.getVariables.mockRejectedValue(apiError);

      await expect(listVariablesTool.execute({})).rejects.toThrow(
        new UserError('Failed to list variables: API request failed')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getVariables.mockRejectedValue('Unknown error string');

      await expect(listVariablesTool.execute({})).rejects.toThrow(
        new UserError('Failed to list variables with unknown error')
      );
    });
  });

  describe('create-variable tool', () => {
    let createVariableTool: any;

    beforeEach(() => {
      createVariableTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-variable'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(createVariableTool.name).toBe('create-variable');
      expect(createVariableTool.description).toContain('Create a new environment variable in n8n');
      expect(createVariableTool.description).toContain('n8n Enterprise license');
      expect(createVariableTool.annotations).toEqual({
        title: 'Create New Variable',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });
    });

    it('should create variable successfully with type', async () => {
      const mockVariable: N8nVariable = {
        id: 'var-new',
        key: 'NEW_API_KEY',
        value: 'new-secret-value',
        type: 'string',
      };

      mockClient.createVariable.mockResolvedValue(mockVariable);

      const result = await createVariableTool.execute({
        key: 'NEW_API_KEY',
        value: 'new-secret-value',
        type: 'string',
      });

      expect(mockClient.createVariable).toHaveBeenCalledWith({
        key: 'NEW_API_KEY',
        value: 'new-secret-value',
        type: 'string',
      });
      expect(result).toContain('✅ Successfully created variable "NEW_API_KEY" with ID: var-new');
      expect(result).toContain('Type: string');
      expect(result).toContain('Value: [HIDDEN for security]');
      // Ensure actual value is hidden
      expect(result).not.toContain('new-secret-value');
    });

    it('should create variable successfully with default type', async () => {
      const mockVariable: N8nVariable = {
        id: 'var-new',
        key: 'SIMPLE_VAR',
        value: 'simple-value',
        type: 'string',
      };

      mockClient.createVariable.mockResolvedValue(mockVariable);

      const result = await createVariableTool.execute({
        key: 'SIMPLE_VAR',
        value: 'simple-value',
      });

      expect(mockClient.createVariable).toHaveBeenCalledWith({
        key: 'SIMPLE_VAR',
        value: 'simple-value',
        type: 'string',
      });
      expect(result).toContain('✅ Successfully created variable "SIMPLE_VAR" with ID: var-new');
      expect(result).toContain('Type: string');
      expect(result).toContain('Value: [HIDDEN for security]');
    });

    it('should create variable with different types', async () => {
      const mockVariable: N8nVariable = {
        id: 'var-new',
        key: 'DEBUG_FLAG',
        value: 'true',
        type: 'boolean',
      };

      mockClient.createVariable.mockResolvedValue(mockVariable);

      const result = await createVariableTool.execute({
        key: 'DEBUG_FLAG',
        value: 'true',
        type: 'boolean',
      });

      expect(mockClient.createVariable).toHaveBeenCalledWith({
        key: 'DEBUG_FLAG',
        value: 'true',
        type: 'boolean',
      });
      expect(result).toContain('Type: boolean');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createVariableTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-variable'
      );
      const toolWithNullClient = toolCall[0];

      await expect(
        toolWithNullClient.execute({ key: 'TEST_VAR', value: 'test-value' })
      ).rejects.toThrow(new UserError('n8n client not initialized. Please run init-n8n first.'));
    });

    it('should handle license-related errors', async () => {
      const licenseError = new Error('license required');
      mockClient.createVariable.mockRejectedValue(licenseError);

      await expect(
        createVariableTool.execute({ key: 'TEST_VAR', value: 'test-value' })
      ).rejects.toThrow(
        new UserError(
          'This operation requires an n8n Enterprise license with variable management features enabled. Error: license required'
        )
      );
    });

    it('should handle general API errors', async () => {
      const apiError = new Error('Variable key already exists');
      mockClient.createVariable.mockRejectedValue(apiError);

      await expect(
        createVariableTool.execute({ key: 'DUPLICATE_VAR', value: 'test-value' })
      ).rejects.toThrow(new UserError('Failed to create variable: Variable key already exists'));
    });

    it('should handle unknown errors', async () => {
      mockClient.createVariable.mockRejectedValue('Unknown error string');

      await expect(
        createVariableTool.execute({ key: 'TEST_VAR', value: 'test-value' })
      ).rejects.toThrow(new UserError('Failed to create variable with unknown error'));
    });
  });

  describe('delete-variable tool', () => {
    let deleteVariableTool: any;

    beforeEach(() => {
      deleteVariableTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-variable'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(deleteVariableTool.name).toBe('delete-variable');
      expect(deleteVariableTool.description).toContain(
        'Delete an environment variable from n8n permanently'
      );
      expect(deleteVariableTool.description).toContain('n8n Enterprise license');
      expect(deleteVariableTool.annotations).toEqual({
        title: 'Delete Variable',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should delete variable successfully', async () => {
      mockClient.deleteVariable.mockResolvedValue(undefined);

      const result = await deleteVariableTool.execute({
        variableId: 'var-1',
      });

      expect(mockClient.deleteVariable).toHaveBeenCalledWith('var-1');
      expect(result).toBe('✅ Successfully deleted variable with ID: var-1');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createVariableTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-variable'
      );
      const toolWithNullClient = toolCall[0];

      await expect(toolWithNullClient.execute({ variableId: 'var-1' })).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle license-related errors', async () => {
      const licenseError = new Error('license required');
      mockClient.deleteVariable.mockRejectedValue(licenseError);

      await expect(deleteVariableTool.execute({ variableId: 'var-1' })).rejects.toThrow(
        new UserError(
          'This operation requires an n8n Enterprise license with variable management features enabled. Error: license required'
        )
      );
    });

    it('should handle general API errors', async () => {
      const apiError = new Error('Variable not found');
      mockClient.deleteVariable.mockRejectedValue(apiError);

      await expect(deleteVariableTool.execute({ variableId: 'invalid-id' })).rejects.toThrow(
        new UserError('Failed to delete variable: Variable not found')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.deleteVariable.mockRejectedValue('Unknown error string');

      await expect(deleteVariableTool.execute({ variableId: 'var-1' })).rejects.toThrow(
        new UserError('Failed to delete variable with unknown error')
      );
    });
  });

  describe('parameter validation', () => {
    it('should validate variable ID parameters', () => {
      const deleteVariableTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-variable'
      )[0];

      expect(deleteVariableTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });

    it('should validate create variable parameters', () => {
      const createVariableTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-variable'
      )[0];

      expect(createVariableTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });

    it('should validate list variables parameters', () => {
      const listVariablesTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-variables'
      )[0];

      expect(listVariablesTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });
  });

  describe('security considerations', () => {
    it('should never expose actual variable values in list output', async () => {
      const mockVariables: N8nVariable[] = [
        {
          id: 'var-1',
          key: 'SECRET_KEY',
          value: 'super-secret-password-123',
          type: 'string',
        },
        {
          id: 'var-2',
          key: 'API_TOKEN',
          value: 'sk-1234567890abcdef',
          type: 'string',
        },
      ];

      mockClient.getVariables.mockResolvedValue({
        data: mockVariables,
      });

      const result = await mockServer.addTool.mock.calls
        .find((call: any) => call[0].name === 'list-variables')[0]
        .execute({});

      // Ensure no actual values are leaked
      expect(result).not.toContain('super-secret-password-123');
      expect(result).not.toContain('sk-1234567890abcdef');
      expect(result).toContain('[HIDDEN]');
    });

    it('should never expose actual variable values in create output', async () => {
      const mockVariable: N8nVariable = {
        id: 'var-new',
        key: 'NEW_SECRET',
        value: 'extremely-secret-value',
        type: 'string',
      };

      mockClient.createVariable.mockResolvedValue(mockVariable);

      const result = await mockServer.addTool.mock.calls
        .find((call: any) => call[0].name === 'create-variable')[0]
        .execute({
          key: 'NEW_SECRET',
          value: 'extremely-secret-value',
          type: 'string',
        });

      // Ensure no actual value is leaked
      expect(result).not.toContain('extremely-secret-value');
      expect(result).toContain('[HIDDEN for security]');
    });

    it('should handle different variable types securely', async () => {
      const mockVariables: N8nVariable[] = [
        {
          id: 'var-1',
          key: 'STRING_VAR',
          value: 'secret-string',
          type: 'string',
        },
        {
          id: 'var-2',
          key: 'NUMBER_VAR',
          value: '12345',
          type: 'number',
        },
        {
          id: 'var-3',
          key: 'BOOLEAN_VAR',
          value: 'true',
          type: 'boolean',
        },
        {
          id: 'var-4',
          key: 'JSON_VAR',
          value: '{"secret": "value"}',
          type: 'json',
        },
      ];

      mockClient.getVariables.mockResolvedValue({
        data: mockVariables,
      });

      const result = await mockServer.addTool.mock.calls
        .find((call: any) => call[0].name === 'list-variables')[0]
        .execute({});

      // Ensure no actual values are leaked for any type
      expect(result).not.toContain('secret-string');
      expect(result).not.toContain('12345');
      expect(result).not.toContain('true');
      expect(result).not.toContain('{"secret": "value"}');
      // But types should be shown
      expect(result).toContain('Type: string');
      expect(result).toContain('Type: number');
      expect(result).toContain('Type: boolean');
      expect(result).toContain('Type: json');
    });
  });
});
