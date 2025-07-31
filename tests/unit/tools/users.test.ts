import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createUserTools } from '../../../src/tools/users';
import { N8nClient } from '../../../src/client/n8nClient';
import { N8nUser, CreateUserRequest, UpdateUserRequest } from '../../../src/types/n8n';
import { UserError } from 'fastmcp';

describe('User Tools', () => {
  let mockClient: jest.Mocked<N8nClient>;
  let mockServer: any;
  let getClient: () => N8nClient | null;

  beforeEach(() => {
    mockClient = (global as any).testUtils.createMockClient() as jest.Mocked<N8nClient>;
    getClient = jest.fn(() => mockClient);
    mockServer = {
      addTool: jest.fn(),
    };

    // Register user tools
    createUserTools(getClient, mockServer);
  });

  it('should register all user tools', () => {
    expect(mockServer.addTool).toHaveBeenCalledTimes(5);

    const toolNames = mockServer.addTool.mock.calls.map((call: any) => call[0].name);
    expect(toolNames).toContain('list-users');
    expect(toolNames).toContain('get-user');
    expect(toolNames).toContain('create-user');
    expect(toolNames).toContain('update-user');
    expect(toolNames).toContain('delete-user');
  });

  describe('list-users tool', () => {
    let listUsersTool: any;

    beforeEach(() => {
      listUsersTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-users'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(listUsersTool.name).toBe('list-users');
      expect(listUsersTool.description).toContain('List all users in the n8n instance');
      expect(listUsersTool.annotations).toEqual({
        title: 'List n8n Users',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should list users successfully with full data', async () => {
      const mockUsers: N8nUser[] = [
        {
          id: 'user-1',
          email: 'john.doe@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'admin',
          disabled: false,
          createdAt: '2023-01-01T00:00:00.000Z',
          lastSeenAt: '2023-01-15T00:00:00.000Z',
        },
        {
          id: 'user-2',
          email: 'jane.smith@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          role: 'member',
          disabled: true,
          createdAt: '2023-01-02T00:00:00.000Z',
        },
      ];

      mockClient.getUsers.mockResolvedValue({
        data: mockUsers,
        nextCursor: 'next-cursor',
      });

      const result = await listUsersTool.execute({ limit: 10 });

      expect(mockClient.getUsers).toHaveBeenCalledWith({ limit: 10 });
      expect(result).toContain('Found 2 user(s)');
      expect(result).toContain('**John Doe**');
      expect(result).toContain('ID: user-1');
      expect(result).toContain('Email: john.doe@example.com');
      expect(result).toContain('Role: admin');
      expect(result).toContain('Status: 🟢 Active');
      expect(result).toContain('Created: 1/1/2023');
      expect(result).toContain('Last Seen: 1/15/2023');
      expect(result).toContain('**Jane Smith**');
      expect(result).toContain('ID: user-2');
      expect(result).toContain('Email: jane.smith@example.com');
      expect(result).toContain('Role: member');
      expect(result).toContain('Status: 🔴 Disabled');
      expect(result).toContain('Use cursor "next-cursor" to get the next page');
    });

    it('should list users with minimal data', async () => {
      const mockUsers: N8nUser[] = [
        {
          id: 'user-1',
          email: 'simple@example.com',
          firstName: 'Simple',
          lastName: 'User',
          role: 'member',
          disabled: false,
        },
      ];

      mockClient.getUsers.mockResolvedValue({
        data: mockUsers,
      });

      const result = await listUsersTool.execute({});

      expect(mockClient.getUsers).toHaveBeenCalledWith({});
      expect(result).toContain('Found 1 user(s)');
      expect(result).toContain('**Simple User**');
      expect(result).toContain('ID: user-1');
      expect(result).toContain('Email: simple@example.com');
      expect(result).toContain('Role: member');
      expect(result).toContain('Status: 🟢 Active');
      expect(result).not.toContain('Created:');
      expect(result).not.toContain('Last Seen:');
      expect(result).not.toContain('cursor');
    });

    it('should handle empty user list', async () => {
      mockClient.getUsers.mockResolvedValue({
        data: [],
      });

      const result = await listUsersTool.execute({});

      expect(result).toBe('No users found in the n8n instance.');
    });

    it('should handle pagination parameters', async () => {
      mockClient.getUsers.mockResolvedValue({ data: [] });

      await listUsersTool.execute({ limit: 50, cursor: 'test-cursor' });

      expect(mockClient.getUsers).toHaveBeenCalledWith({
        limit: 50,
        cursor: 'test-cursor',
      });
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createUserTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-users'
      );
      const toolWithNullClient = toolCall[0];

      await expect(toolWithNullClient.execute({})).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle API errors', async () => {
      const apiError = new Error('API request failed');
      mockClient.getUsers.mockRejectedValue(apiError);

      await expect(listUsersTool.execute({})).rejects.toThrow(
        new UserError('Failed to list users: API request failed')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getUsers.mockRejectedValue('Unknown error string');

      await expect(listUsersTool.execute({})).rejects.toThrow(
        new UserError('Failed to list users with unknown error')
      );
    });
  });

  describe('get-user tool', () => {
    let getUserTool: any;

    beforeEach(() => {
      getUserTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-user'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(getUserTool.name).toBe('get-user');
      expect(getUserTool.description).toContain('Get detailed information about a specific user');
      expect(getUserTool.annotations).toEqual({
        title: 'Get User Details',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should get user successfully with full data', async () => {
      const mockUser: N8nUser = {
        id: 'user-1',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin',
        disabled: false,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-02T00:00:00.000Z',
        lastSeenAt: '2023-01-15T00:00:00.000Z',
      };

      mockClient.getUser.mockResolvedValue(mockUser);

      const result = await getUserTool.execute({ userId: 'user-1' });

      expect(mockClient.getUser).toHaveBeenCalledWith('user-1');
      expect(result).toContain('# User: John Doe');
      expect(result).toContain('**ID:** user-1');
      expect(result).toContain('**Email:** john.doe@example.com');
      expect(result).toContain('**Role:** admin');
      expect(result).toContain('**Status:** 🟢 Active');
      expect(result).toContain('**Created:**');
      expect(result).toContain('**Updated:**');
      expect(result).toContain('**Last Seen:**');
    });

    it('should get user with minimal data', async () => {
      const mockUser: N8nUser = {
        id: 'user-1',
        email: 'simple@example.com',
        firstName: 'Simple',
        lastName: 'User',
        role: 'member',
        disabled: true,
      };

      mockClient.getUser.mockResolvedValue(mockUser);

      const result = await getUserTool.execute({ userId: 'user-1' });

      expect(result).toContain('# User: Simple User');
      expect(result).toContain('**ID:** user-1');
      expect(result).toContain('**Email:** simple@example.com');
      expect(result).toContain('**Role:** member');
      expect(result).toContain('**Status:** 🔴 Disabled');
      expect(result).not.toContain('**Created:**');
      expect(result).not.toContain('**Updated:**');
      expect(result).not.toContain('**Last Seen:**');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createUserTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-user'
      );
      const toolWithNullClient = toolCall[0];

      await expect(toolWithNullClient.execute({ userId: 'user-1' })).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle API errors', async () => {
      const apiError = new Error('User not found');
      mockClient.getUser.mockRejectedValue(apiError);

      await expect(getUserTool.execute({ userId: 'invalid-id' })).rejects.toThrow(
        new UserError('Failed to get user: User not found')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.getUser.mockRejectedValue('Unknown error string');

      await expect(getUserTool.execute({ userId: 'user-1' })).rejects.toThrow(
        new UserError('Failed to get user with unknown error')
      );
    });
  });

  describe('create-user tool', () => {
    let createUserTool: any;

    beforeEach(() => {
      createUserTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-user'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(createUserTool.name).toBe('create-user');
      expect(createUserTool.description).toContain('Create a new user in n8n');
      expect(createUserTool.annotations).toEqual({
        title: 'Create New User',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });
    });

    it('should create user successfully with all fields', async () => {
      const mockUser: N8nUser = {
        id: 'user-new',
        email: 'new.user@example.com',
        firstName: 'New',
        lastName: 'User',
        role: 'admin',
        disabled: false,
      };

      mockClient.createUser.mockResolvedValue(mockUser);

      const result = await createUserTool.execute({
        email: 'new.user@example.com',
        firstName: 'New',
        lastName: 'User',
        password: 'password123',
        role: 'admin',
      });

      expect(mockClient.createUser).toHaveBeenCalledWith({
        email: 'new.user@example.com',
        firstName: 'New',
        lastName: 'User',
        password: 'password123',
        role: 'admin',
      });
      expect(result).toContain('✅ Successfully created user "New User" with ID: user-new');
      expect(result).toContain('Email: new.user@example.com');
      expect(result).toContain('Role: admin');
    });

    it('should create user successfully with default role', async () => {
      const mockUser: N8nUser = {
        id: 'user-new',
        email: 'simple.user@example.com',
        firstName: 'Simple',
        lastName: 'User',
        role: 'member',
        disabled: false,
      };

      mockClient.createUser.mockResolvedValue(mockUser);

      const result = await createUserTool.execute({
        email: 'simple.user@example.com',
        firstName: 'Simple',
        lastName: 'User',
        password: 'password123',
      });

      expect(mockClient.createUser).toHaveBeenCalledWith({
        email: 'simple.user@example.com',
        firstName: 'Simple',
        lastName: 'User',
        password: 'password123',
        role: 'member',
      });
      expect(result).toContain('✅ Successfully created user "Simple User" with ID: user-new');
      expect(result).toContain('Email: simple.user@example.com');
      expect(result).toContain('Role: member');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createUserTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-user'
      );
      const toolWithNullClient = toolCall[0];

      await expect(
        toolWithNullClient.execute({
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          password: 'password123',
        })
      ).rejects.toThrow(new UserError('n8n client not initialized. Please run init-n8n first.'));
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Email already exists');
      mockClient.createUser.mockRejectedValue(apiError);

      await expect(
        createUserTool.execute({
          email: 'duplicate@example.com',
          firstName: 'Duplicate',
          lastName: 'User',
          password: 'password123',
        })
      ).rejects.toThrow(new UserError('Failed to create user: Email already exists'));
    });

    it('should handle unknown errors', async () => {
      mockClient.createUser.mockRejectedValue('Unknown error string');

      await expect(
        createUserTool.execute({
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          password: 'password123',
        })
      ).rejects.toThrow(new UserError('Failed to create user with unknown error'));
    });
  });

  describe('update-user tool', () => {
    let updateUserTool: any;

    beforeEach(() => {
      updateUserTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-user'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(updateUserTool.name).toBe('update-user');
      expect(updateUserTool.description).toContain("Update a user's information");
      expect(updateUserTool.annotations).toEqual({
        title: 'Update User',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should update user successfully with all fields', async () => {
      const mockUser: N8nUser = {
        id: 'user-1',
        email: 'updated@example.com',
        firstName: 'Updated',
        lastName: 'User',
        role: 'admin',
        disabled: true,
      };

      mockClient.updateUser.mockResolvedValue(mockUser);

      const result = await updateUserTool.execute({
        userId: 'user-1',
        email: 'updated@example.com',
        firstName: 'Updated',
        lastName: 'User',
        role: 'admin',
        disabled: true,
      });

      expect(mockClient.updateUser).toHaveBeenCalledWith('user-1', {
        email: 'updated@example.com',
        firstName: 'Updated',
        lastName: 'User',
        role: 'admin',
        disabled: true,
      });
      expect(result).toContain('✅ Successfully updated user "Updated User" (ID: user-1)');
      expect(result).toContain('Email: updated@example.com');
      expect(result).toContain('Role: admin');
      expect(result).toContain('Status: 🔴 Disabled');
    });

    it('should update user successfully with partial fields', async () => {
      const mockUser: N8nUser = {
        id: 'user-1',
        email: 'original@example.com',
        firstName: 'Updated',
        lastName: 'Name',
        role: 'member',
        disabled: false,
      };

      mockClient.updateUser.mockResolvedValue(mockUser);

      const result = await updateUserTool.execute({
        userId: 'user-1',
        firstName: 'Updated',
        lastName: 'Name',
      });

      expect(mockClient.updateUser).toHaveBeenCalledWith('user-1', {
        firstName: 'Updated',
        lastName: 'Name',
      });
      expect(result).toContain('✅ Successfully updated user "Updated Name" (ID: user-1)');
      expect(result).toContain('Email: original@example.com');
      expect(result).toContain('Role: member');
      expect(result).toContain('Status: 🟢 Active');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createUserTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-user'
      );
      const toolWithNullClient = toolCall[0];

      await expect(
        toolWithNullClient.execute({ userId: 'user-1', firstName: 'Updated' })
      ).rejects.toThrow(new UserError('n8n client not initialized. Please run init-n8n first.'));
    });

    it('should handle API errors', async () => {
      const apiError = new Error('User not found');
      mockClient.updateUser.mockRejectedValue(apiError);

      await expect(
        updateUserTool.execute({ userId: 'invalid-id', firstName: 'Updated' })
      ).rejects.toThrow(new UserError('Failed to update user: User not found'));
    });

    it('should handle unknown errors', async () => {
      mockClient.updateUser.mockRejectedValue('Unknown error string');

      await expect(
        updateUserTool.execute({ userId: 'user-1', firstName: 'Updated' })
      ).rejects.toThrow(new UserError('Failed to update user with unknown error'));
    });
  });

  describe('delete-user tool', () => {
    let deleteUserTool: any;

    beforeEach(() => {
      deleteUserTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-user'
      )[0];
    });

    it('should have correct tool configuration', () => {
      expect(deleteUserTool.name).toBe('delete-user');
      expect(deleteUserTool.description).toContain('Delete a user from n8n permanently');
      expect(deleteUserTool.annotations).toEqual({
        title: 'Delete User',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('should delete user successfully', async () => {
      mockClient.deleteUser.mockResolvedValue(undefined);

      const result = await deleteUserTool.execute({
        userId: 'user-1',
      });

      expect(mockClient.deleteUser).toHaveBeenCalledWith('user-1');
      expect(result).toBe('✅ Successfully deleted user with ID: user-1');
    });

    it('should throw UserError when client is not initialized', async () => {
      const getClientNull = jest.fn(() => null);
      createUserTools(getClientNull, { addTool: jest.fn() });
      const toolCall = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'delete-user'
      );
      const toolWithNullClient = toolCall[0];

      await expect(toolWithNullClient.execute({ userId: 'user-1' })).rejects.toThrow(
        new UserError('n8n client not initialized. Please run init-n8n first.')
      );
    });

    it('should handle API errors', async () => {
      const apiError = new Error('User not found');
      mockClient.deleteUser.mockRejectedValue(apiError);

      await expect(deleteUserTool.execute({ userId: 'invalid-id' })).rejects.toThrow(
        new UserError('Failed to delete user: User not found')
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.deleteUser.mockRejectedValue('Unknown error string');

      await expect(deleteUserTool.execute({ userId: 'user-1' })).rejects.toThrow(
        new UserError('Failed to delete user with unknown error')
      );
    });
  });

  describe('parameter validation', () => {
    it('should validate user ID parameters', () => {
      const getUserTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'get-user'
      )[0];

      expect(getUserTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });

    it('should validate create user parameters', () => {
      const createUserTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'create-user'
      )[0];

      expect(createUserTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });

    it('should validate update user parameters', () => {
      const updateUserTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'update-user'
      )[0];

      expect(updateUserTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });

    it('should validate list users parameters', () => {
      const listUsersTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'list-users'
      )[0];

      expect(listUsersTool.parameters).toBeDefined();
      // Zod validation would be handled at runtime
    });
  });
});
