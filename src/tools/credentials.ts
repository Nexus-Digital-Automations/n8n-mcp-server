import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import {
  N8nCredential,
  CreateCredentialRequest,
  PaginationOptions
} from '../types/n8n.js';

// Zod schemas for validation
const CredentialIdSchema = z.object({
  credentialId: z.string().min(1, "Credential ID is required")
});

const CredentialTypeSchema = z.object({
  credentialType: z.string().min(1, "Credential type is required")
});

const ListCredentialsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional()
});

const CreateCredentialSchema = z.object({
  name: z.string().min(1, "Credential name is required"),
  type: z.string().min(1, "Credential type is required"),
  data: z.record(z.unknown()).refine(data => Object.keys(data).length > 0, {
    message: "Credential data is required"
  }),
  projectId: z.string().optional()
});

// Tool registration function
export function createCredentialTools(getClient: () => N8nClient | null, server: any) {
  // List credentials tool
  server.addTool({
    name: "list-credentials",
    description: "List all credentials in the n8n instance with pagination support. Sensitive data is not included",
    parameters: ListCredentialsSchema,
    annotations: {
      title: "List n8n Credentials",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof ListCredentialsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const options: PaginationOptions = {};
        if (args.limit) options.limit = args.limit;
        if (args.cursor) options.cursor = args.cursor;

        const response = await client.getCredentials(options);
        
        if (response.data.length === 0) {
          return "No credentials found in the n8n instance.";
        }

        let result = `Found ${response.data.length} credential(s):\n\n`;
        
        response.data.forEach((credential: N8nCredential, index: number) => {
          result += `${index + 1}. **${credential.name}**\n`;
          result += `   - ID: ${credential.id}\n`;
          result += `   - Type: ${credential.type}\n`;
          
          if (credential.homeProject) {
            result += `   - Project: ${credential.homeProject.name} (${credential.homeProject.type})\n`;
          }
          
          if (credential.sharedWith && credential.sharedWith.length > 0) {
            result += `   - Shared with: ${credential.sharedWith.length} user(s)\n`;
          }
          
          if (credential.scopes && credential.scopes.length > 0) {
            result += `   - Scopes: ${credential.scopes.join(', ')}\n`;
          }
          
          if (credential.createdAt) {
            result += `   - Created: ${new Date(credential.createdAt).toLocaleDateString()}\n`;
          }
          
          if (credential.updatedAt) {
            result += `   - Updated: ${new Date(credential.updatedAt).toLocaleDateString()}\n`;
          }
          
          result += '\n';
        });

        if (response.nextCursor) {
          result += `\n📄 Use cursor "${response.nextCursor}" to get the next page.`;
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to list credentials: ${error.message}`);
        }
        throw new UserError('Failed to list credentials with unknown error');
      }
    }
  });

  // Get credential tool
  server.addTool({
    name: "get-credential",
    description: "Get detailed information about a specific credential by ID. Sensitive data is not included for security",
    parameters: CredentialIdSchema,
    annotations: {
      title: "Get Credential Details",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof CredentialIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const credential = await client.getCredential(args.credentialId);
        
        let result = `# Credential: ${credential.name}\n\n`;
        result += `**ID:** ${credential.id}\n`;
        result += `**Name:** ${credential.name}\n`;
        result += `**Type:** ${credential.type}\n`;
        
        if (credential.homeProject) {
          result += `**Project:** ${credential.homeProject.name} (${credential.homeProject.type})\n`;
        }
        
        if (credential.sharedWith && credential.sharedWith.length > 0) {
          result += `\n## Shared With:\n`;
          credential.sharedWith.forEach((share, index) => {
            result += `${index + 1}. ${share.user.firstName} ${share.user.lastName} (${share.user.email}) - Role: ${share.role}\n`;
          });
        }
        
        if (credential.nodesAccess && credential.nodesAccess.length > 0) {
          result += `\n## Node Access:\n`;
          credential.nodesAccess.forEach((access, index) => {
            result += `${index + 1}. Node Type: ${access.nodeType}\n`;
            if (access.user) {
              result += `   - User: ${access.user}\n`;
            }
            if (access.date) {
              result += `   - Date: ${new Date(access.date).toLocaleString()}\n`;
            }
          });
        }
        
        if (credential.scopes && credential.scopes.length > 0) {
          result += `\n**Scopes:** ${credential.scopes.join(', ')}\n`;
        }
        
        if (credential.createdAt) {
          result += `**Created:** ${new Date(credential.createdAt).toLocaleString()}\n`;
        }
        
        if (credential.updatedAt) {
          result += `**Updated:** ${new Date(credential.updatedAt).toLocaleString()}\n`;
        }

        result += `\n**Note:** Sensitive credential data is not displayed for security purposes.`;

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to get credential: ${error.message}`);
        }
        throw new UserError('Failed to get credential with unknown error');
      }
    }
  });

  // Create credential tool
  server.addTool({
    name: "create-credential",
    description: "Create a new credential in n8n with the specified type and configuration data",
    parameters: CreateCredentialSchema,
    annotations: {
      title: "Create New Credential",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof CreateCredentialSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const credentialData: CreateCredentialRequest = {
          name: args.name,
          type: args.type,
          data: args.data as Record<string, unknown>,
          projectId: args.projectId
        };

        const credential = await client.createCredential(credentialData);
        
        let result = `✅ Successfully created credential "${credential.name}" with ID: ${credential.id}\n`;
        result += `Type: ${credential.type}`;
        
        if (credential.homeProject) {
          result += `\nProject: ${credential.homeProject.name}`;
        }
        
        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to create credential: ${error.message}`);
        }
        throw new UserError('Failed to create credential with unknown error');
      }
    }
  });

  // Delete credential tool
  server.addTool({
    name: "delete-credential",
    description: "Delete a credential from n8n permanently. WARNING: This action cannot be undone and may break workflows using this credential",
    parameters: CredentialIdSchema,
    annotations: {
      title: "Delete Credential",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof CredentialIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        await client.deleteCredential(args.credentialId);
        return `✅ Successfully deleted credential with ID: ${args.credentialId}`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to delete credential: ${error.message}`);
        }
        throw new UserError('Failed to delete credential with unknown error');
      }
    }
  });

  // Get credential schema tool
  server.addTool({
    name: "get-credential-schema",
    description: "Get the schema definition for a specific credential type to understand required fields",
    parameters: CredentialTypeSchema,
    annotations: {
      title: "Get Credential Schema",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof CredentialTypeSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const schema = await client.getCredentialSchema(args.credentialType);
        
        let result = `# Credential Schema: ${args.credentialType}\n\n`;
        result += `**Schema definition for credential type "${args.credentialType}":**\n\n`;
        result += '```json\n';
        result += JSON.stringify(schema, null, 2);
        result += '\n```\n';
        
        result += `\nUse this schema to understand the required fields when creating credentials of type "${args.credentialType}".`;

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to get credential schema: ${error.message}`);
        }
        throw new UserError('Failed to get credential schema with unknown error');
      }
    }
  });
}