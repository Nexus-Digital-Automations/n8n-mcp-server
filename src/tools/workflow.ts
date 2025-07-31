import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import {
  N8nWorkflow,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  PaginationOptions
} from '../types/n8n.js';

// Zod schemas for validation
const WorkflowIdSchema = z.object({
  workflowId: z.string().min(1, "Workflow ID is required")
});

const ListWorkflowsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional()
});

const CreateWorkflowSchema = z.object({
  name: z.string().min(1, "Workflow name is required"),
  nodes: z.array(z.record(z.unknown())).min(1, "At least one node is required"),
  connections: z.record(z.unknown()),
  active: z.boolean().optional().default(false),
  settings: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional()
});

const UpdateWorkflowSchema = z.object({
  workflowId: z.string().min(1, "Workflow ID is required"),
  name: z.string().min(1).optional(),
  nodes: z.array(z.record(z.unknown())).optional(),
  connections: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional()
});

// Tool registration function
export function createWorkflowTools(getClient: () => N8nClient | null, server: any) {
  // List workflows tool
  server.addTool({
    name: "list-workflows",
    description: "List all workflows in the n8n instance with pagination support",
    parameters: ListWorkflowsSchema,
    annotations: {
      title: "List n8n Workflows",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof ListWorkflowsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const options: PaginationOptions = {};
        if (args.limit) options.limit = args.limit;
        if (args.cursor) options.cursor = args.cursor;

        const response = await client.getWorkflows(options);
        
        if (response.data.length === 0) {
          return "No workflows found in the n8n instance.";
        }

        let result = `Found ${response.data.length} workflow(s):\n\n`;
        
        response.data.forEach((workflow: N8nWorkflow, index: number) => {
          result += `${index + 1}. **${workflow.name}**\n`;
          result += `   - ID: ${workflow.id}\n`;
          result += `   - Status: ${workflow.active ? '🟢 Active' : '🔴 Inactive'}\n`;
          result += `   - Nodes: ${workflow.nodes.length}\n`;
          if (workflow.tags && workflow.tags.length > 0) {
            result += `   - Tags: ${workflow.tags.join(', ')}\n`;
          }
          if (workflow.createdAt) {
            result += `   - Created: ${new Date(workflow.createdAt).toLocaleDateString()}\n`;
          }
          result += '\n';
        });

        if (response.nextCursor) {
          result += `\n📄 Use cursor "${response.nextCursor}" to get the next page.`;
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to list workflows: ${error.message}`);
        }
        throw new UserError('Failed to list workflows with unknown error');
      }
    }
  });

  // Get workflow tool
  server.addTool({
    name: "get-workflow",
    description: "Get detailed information about a specific workflow by ID",
    parameters: WorkflowIdSchema,
    annotations: {
      title: "Get Workflow Details",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof WorkflowIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        
        let result = `# Workflow: ${workflow.name}\n\n`;
        result += `**ID:** ${workflow.id}\n`;
        result += `**Status:** ${workflow.active ? '🟢 Active' : '🔴 Inactive'}\n`;
        result += `**Nodes:** ${workflow.nodes.length}\n`;
        
        if (workflow.tags && workflow.tags.length > 0) {
          result += `**Tags:** ${workflow.tags.join(', ')}\n`;
        }
        
        if (workflow.createdAt) {
          result += `**Created:** ${new Date(workflow.createdAt).toLocaleString()}\n`;
        }
        
        if (workflow.updatedAt) {
          result += `**Updated:** ${new Date(workflow.updatedAt).toLocaleString()}\n`;
        }

        // List nodes
        if (workflow.nodes.length > 0) {
          result += '\n## Nodes:\n';
          workflow.nodes.forEach((node, index) => {
            const nodeData = node as Record<string, unknown>;
            result += `${index + 1}. **${nodeData.name || 'Unnamed Node'}** (${nodeData.type || 'Unknown Type'})\n`;
          });
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to get workflow: ${error.message}`);
        }
        throw new UserError('Failed to get workflow with unknown error');
      }
    }
  });

  // Create workflow tool
  server.addTool({
    name: "create-workflow",
    description: "Create a new workflow in n8n with nodes and connections",
    parameters: CreateWorkflowSchema,
    annotations: {
      title: "Create New Workflow",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof CreateWorkflowSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflowData: CreateWorkflowRequest = {
          name: args.name,
          nodes: args.nodes,
          connections: args.connections,
          active: args.active,
          settings: args.settings,
          tags: args.tags
        };

        const workflow = await client.createWorkflow(workflowData);
        
        return `✅ Successfully created workflow "${workflow.name}" with ID: ${workflow.id}\n` +
               `Status: ${workflow.active ? '🟢 Active' : '🔴 Inactive'}\n` +
               `Nodes: ${workflow.nodes.length}`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to create workflow: ${error.message}`);
        }
        throw new UserError('Failed to create workflow with unknown error');
      }
    }
  });

  // Update workflow tool
  server.addTool({
    name: "update-workflow",
    description: "Update an existing workflow's properties, nodes, or connections",
    parameters: UpdateWorkflowSchema,
    annotations: {
      title: "Update Workflow",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof UpdateWorkflowSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const { workflowId, ...updateData } = args;
        const workflowData: UpdateWorkflowRequest = updateData;

        const workflow = await client.updateWorkflow(workflowId, workflowData);
        
        return `✅ Successfully updated workflow "${workflow.name}" (ID: ${workflow.id})\n` +
               `Status: ${workflow.active ? '🟢 Active' : '🔴 Inactive'}\n` +
               `Nodes: ${workflow.nodes.length}`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to update workflow: ${error.message}`);
        }
        throw new UserError('Failed to update workflow with unknown error');
      }
    }
  });

  // Delete workflow tool
  server.addTool({
    name: "delete-workflow",
    description: "Delete a workflow from n8n permanently",
    parameters: WorkflowIdSchema,
    annotations: {
      title: "Delete Workflow",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof WorkflowIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        await client.deleteWorkflow(args.workflowId);
        return `✅ Successfully deleted workflow with ID: ${args.workflowId}`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to delete workflow: ${error.message}`);
        }
        throw new UserError('Failed to delete workflow with unknown error');
      }
    }
  });

  // Activate workflow tool
  server.addTool({
    name: "activate-workflow",
    description: "Activate a workflow to start receiving trigger events",
    parameters: WorkflowIdSchema,
    annotations: {
      title: "Activate Workflow",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof WorkflowIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.activateWorkflow(args.workflowId);
        
        return `✅ Successfully activated workflow "${workflow.name}" (ID: ${workflow.id})\n` +
               `Status: 🟢 Active`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to activate workflow: ${error.message}`);
        }
        throw new UserError('Failed to activate workflow with unknown error');
      }
    }
  });

  // Deactivate workflow tool
  server.addTool({
    name: "deactivate-workflow",
    description: "Deactivate a workflow to stop receiving trigger events",
    parameters: WorkflowIdSchema,
    annotations: {
      title: "Deactivate Workflow",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof WorkflowIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.deactivateWorkflow(args.workflowId);
        
        return `✅ Successfully deactivated workflow "${workflow.name}" (ID: ${workflow.id})\n` +
               `Status: 🔴 Inactive`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to deactivate workflow: ${error.message}`);
        }
        throw new UserError('Failed to deactivate workflow with unknown error');
      }
    }
  });
}