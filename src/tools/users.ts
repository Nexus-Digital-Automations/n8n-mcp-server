import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { N8nUser, CreateUserRequest, UpdateUserRequest, PaginationOptions } from '../types/n8n.js';

// Zod schemas for validation
const UserIdSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

const ListUsersSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

const CreateUserSchema = z.object({
  email: z.string().email('Valid email address is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'member', 'owner']).optional().default('member'),
});

const UpdateUserSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(['admin', 'member', 'owner']).optional(),
  disabled: z.boolean().optional(),
});

// Tool registration function
export function createUserTools(getClient: () => N8nClient | null, server: any) {
  // List users tool
  server.addTool({
    name: 'list-users',
    description: 'List all users in the n8n instance with pagination support',
    parameters: ListUsersSchema,
    annotations: {
      title: 'List n8n Users',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ListUsersSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const options: PaginationOptions = {};
        if (args.limit) options.limit = args.limit;
        if (args.cursor) options.cursor = args.cursor;

        const response = await client.getUsers(options);

        if (response.data.length === 0) {
          return 'No users found in the n8n instance.';
        }

        let result = `Found ${response.data.length} user(s):\n\n`;

        response.data.forEach((user: N8nUser, index: number) => {
          result += `${index + 1}. **${user.firstName} ${user.lastName}**\n`;
          result += `   - ID: ${user.id}\n`;
          result += `   - Email: ${user.email}\n`;
          result += `   - Role: ${user.role}\n`;
          result += `   - Status: ${user.disabled ? '🔴 Disabled' : '🟢 Active'}\n`;
          if (user.createdAt) {
            result += `   - Created: ${new Date(user.createdAt).toLocaleDateString()}\n`;
          }
          if (user.lastSeenAt) {
            result += `   - Last Seen: ${new Date(user.lastSeenAt).toLocaleDateString()}\n`;
          }
          result += '\n';
        });

        if (response.nextCursor) {
          result += `\n📄 Use cursor "${response.nextCursor}" to get the next page.`;
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to list users: ${error.message}`);
        }
        throw new UserError('Failed to list users with unknown error');
      }
    },
  });

  // Get user tool
  server.addTool({
    name: 'get-user',
    description: 'Get detailed information about a specific user by ID',
    parameters: UserIdSchema,
    annotations: {
      title: 'Get User Details',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof UserIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const user = await client.getUser(args.userId);

        let result = `# User: ${user.firstName} ${user.lastName}\n\n`;
        result += `**ID:** ${user.id}\n`;
        result += `**Email:** ${user.email}\n`;
        result += `**Role:** ${user.role}\n`;
        result += `**Status:** ${user.disabled ? '🔴 Disabled' : '🟢 Active'}\n`;

        if (user.createdAt) {
          result += `**Created:** ${new Date(user.createdAt).toLocaleString()}\n`;
        }

        if (user.updatedAt) {
          result += `**Updated:** ${new Date(user.updatedAt).toLocaleString()}\n`;
        }

        if (user.lastSeenAt) {
          result += `**Last Seen:** ${new Date(user.lastSeenAt).toLocaleString()}\n`;
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to get user: ${error.message}`);
        }
        throw new UserError('Failed to get user with unknown error');
      }
    },
  });

  // Create user tool
  server.addTool({
    name: 'create-user',
    description: 'Create a new user in n8n with email, name, password, and role',
    parameters: CreateUserSchema,
    annotations: {
      title: 'Create New User',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof CreateUserSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const userData: CreateUserRequest = {
          email: args.email,
          firstName: args.firstName,
          lastName: args.lastName,
          password: args.password,
          role: args.role,
        };

        const user = await client.createUser(userData);

        return (
          `✅ Successfully created user "${user.firstName} ${user.lastName}" with ID: ${user.id}\n` +
          `Email: ${user.email}\n` +
          `Role: ${user.role}`
        );
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to create user: ${error.message}`);
        }
        throw new UserError('Failed to create user with unknown error');
      }
    },
  });

  // Update user tool
  server.addTool({
    name: 'update-user',
    description: "Update a user's information including email, name, role, or status",
    parameters: UpdateUserSchema,
    annotations: {
      title: 'Update User',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof UpdateUserSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const { userId, ...updateData } = args;
        const userData: UpdateUserRequest = updateData;

        const user = await client.updateUser(userId, userData);

        return (
          `✅ Successfully updated user "${user.firstName} ${user.lastName}" (ID: ${user.id})\n` +
          `Email: ${user.email}\n` +
          `Role: ${user.role}\n` +
          `Status: ${user.disabled ? '🔴 Disabled' : '🟢 Active'}`
        );
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to update user: ${error.message}`);
        }
        throw new UserError('Failed to update user with unknown error');
      }
    },
  });

  // Delete user tool
  server.addTool({
    name: 'delete-user',
    description: 'Delete a user from n8n permanently. WARNING: This action cannot be undone',
    parameters: UserIdSchema,
    annotations: {
      title: 'Delete User',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof UserIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        await client.deleteUser(args.userId);
        return `✅ Successfully deleted user with ID: ${args.userId}`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to delete user: ${error.message}`);
        }
        throw new UserError('Failed to delete user with unknown error');
      }
    },
  });
}
