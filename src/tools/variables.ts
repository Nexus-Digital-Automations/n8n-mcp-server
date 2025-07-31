import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import {
  N8nVariable,
  CreateVariableRequest,
  PaginationOptions
} from '../types/n8n.js';

// Zod schemas for validation
const VariableIdSchema = z.object({
  variableId: z.string().min(1, "Variable ID is required")
});

const ListVariablesSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional()
});

const CreateVariableSchema = z.object({
  key: z.string().min(1, "Variable key is required"),
  value: z.string().min(1, "Variable value is required"),
  type: z.enum(['string', 'number', 'boolean', 'json']).optional().default('string')
});

// Tool registration function
export function createVariableTools(getClient: () => N8nClient | null, server: any) {
  // List variables tool
  server.addTool({
    name: "list-variables",
    description: "List all environment variables in n8n. NOTE: Requires n8n Enterprise license with variable management features enabled",
    parameters: ListVariablesSchema,
    annotations: {
      title: "List n8n Variables",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof ListVariablesSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const options: PaginationOptions = {};
        if (args.limit) options.limit = args.limit;
        if (args.cursor) options.cursor = args.cursor;

        const response = await client.getVariables(options);
        
        if (response.data.length === 0) {
          return "No variables found in the n8n instance.";
        }

        let result = `Found ${response.data.length} variable(s):\n\n`;
        
        response.data.forEach((variable: N8nVariable, index: number) => {
          result += `${index + 1}. **${variable.key}**\n`;
          result += `   - ID: ${variable.id}\n`;
          result += `   - Type: ${variable.type || 'string'}\n`;
          // Don't show actual values for security reasons
          result += `   - Value: [HIDDEN]\n`;
          if (variable.createdAt) {
            result += `   - Created: ${new Date(variable.createdAt).toLocaleDateString()}\n`;
          }
          if (variable.updatedAt) {
            result += `   - Updated: ${new Date(variable.updatedAt).toLocaleDateString()}\n`;
          }
          result += '\n';
        });

        if (response.nextCursor) {
          result += `\n📄 Use cursor "${response.nextCursor}" to get the next page.`;
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          // Check for license-related errors
          if (error.message.includes('license')) {
            throw new UserError(`This operation requires an n8n Enterprise license with variable management features enabled. Error: ${error.message}`);
          }
          throw new UserError(`Failed to list variables: ${error.message}`);
        }
        throw new UserError('Failed to list variables with unknown error');
      }
    }
  });

  // Create variable tool
  server.addTool({
    name: "create-variable",
    description: "Create a new environment variable in n8n. NOTE: Requires n8n Enterprise license with variable management features enabled",
    parameters: CreateVariableSchema,
    annotations: {
      title: "Create New Variable",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof CreateVariableSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const variableData: CreateVariableRequest = {
          key: args.key,
          value: args.value,
          type: args.type
        };

        const variable = await client.createVariable(variableData);
        
        return `✅ Successfully created variable "${variable.key}" with ID: ${variable.id}\n` +
               `Type: ${variable.type || 'string'}\n` +
               `Value: [HIDDEN for security]`;
      } catch (error) {
        if (error instanceof Error) {
          // Check for license-related errors
          if (error.message.includes('license')) {
            throw new UserError(`This operation requires an n8n Enterprise license with variable management features enabled. Error: ${error.message}`);
          }
          throw new UserError(`Failed to create variable: ${error.message}`);
        }
        throw new UserError('Failed to create variable with unknown error');
      }
    }
  });

  // Delete variable tool
  server.addTool({
    name: "delete-variable",
    description: "Delete an environment variable from n8n permanently. NOTE: Requires n8n Enterprise license with variable management features enabled",
    parameters: VariableIdSchema,
    annotations: {
      title: "Delete Variable",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof VariableIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        await client.deleteVariable(args.variableId);
        return `✅ Successfully deleted variable with ID: ${args.variableId}`;
      } catch (error) {
        if (error instanceof Error) {
          // Check for license-related errors
          if (error.message.includes('license')) {
            throw new UserError(`This operation requires an n8n Enterprise license with variable management features enabled. Error: ${error.message}`);
          }
          throw new UserError(`Failed to delete variable: ${error.message}`);
        }
        throw new UserError('Failed to delete variable with unknown error');
      }
    }
  });
}