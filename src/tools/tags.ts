import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import {
  N8nTag,
  CreateTagRequest,
  UpdateTagRequest,
  PaginationOptions
} from '../types/n8n.js';

// Zod schemas for validation
const TagIdSchema = z.object({
  tagId: z.string().min(1, "Tag ID is required")
});

const WorkflowIdSchema = z.object({
  workflowId: z.string().min(1, "Workflow ID is required")
});

const ListTagsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional()
});

const CreateTagSchema = z.object({
  name: z.string().min(1, "Tag name is required")
});

const UpdateTagSchema = z.object({
  tagId: z.string().min(1, "Tag ID is required"),
  name: z.string().min(1, "Tag name is required")
});

const UpdateWorkflowTagsSchema = z.object({
  workflowId: z.string().min(1, "Workflow ID is required"),
  tagIds: z.array(z.string()).min(0, "Tag IDs must be an array")
});

// Tool registration function
export function createTagTools(getClient: () => N8nClient | null, server: any) {
  // List tags tool
  server.addTool({
    name: "list-tags",
    description: "List all tags in the n8n instance with pagination support and usage statistics",
    parameters: ListTagsSchema,
    annotations: {
      title: "List n8n Tags",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof ListTagsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const options: PaginationOptions = {};
        if (args.limit) options.limit = args.limit;
        if (args.cursor) options.cursor = args.cursor;

        const response = await client.getTags(options);
        
        if (response.data.length === 0) {
          return "No tags found in the n8n instance.";
        }

        let result = `Found ${response.data.length} tag(s):\n\n`;
        
        response.data.forEach((tag: N8nTag, index: number) => {
          result += `${index + 1}. **${tag.name}**\n`;
          result += `   - ID: ${tag.id}\n`;
          
          if (tag.usageCount !== undefined) {
            result += `   - Usage Count: ${tag.usageCount}\n`;
          }
          
          if (tag.createdAt) {
            result += `   - Created: ${new Date(tag.createdAt).toLocaleDateString()}\n`;
          }
          
          if (tag.updatedAt) {
            result += `   - Updated: ${new Date(tag.updatedAt).toLocaleDateString()}\n`;
          }
          
          result += '\n';
        });

        if (response.nextCursor) {
          result += `\n📄 Use cursor "${response.nextCursor}" to get the next page.`;
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to list tags: ${error.message}`);
        }
        throw new UserError('Failed to list tags with unknown error');
      }
    }
  });

  // Get tag tool
  server.addTool({
    name: "get-tag",
    description: "Get detailed information about a specific tag by ID",
    parameters: TagIdSchema,
    annotations: {
      title: "Get Tag Details",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof TagIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const tag = await client.getTag(args.tagId);
        
        let result = `# Tag: ${tag.name}\n\n`;
        result += `**ID:** ${tag.id}\n`;
        result += `**Name:** ${tag.name}\n`;
        
        if (tag.usageCount !== undefined) {
          result += `**Usage Count:** ${tag.usageCount}\n`;
        }
        
        if (tag.createdAt) {
          result += `**Created:** ${new Date(tag.createdAt).toLocaleString()}\n`;
        }
        
        if (tag.updatedAt) {
          result += `**Updated:** ${new Date(tag.updatedAt).toLocaleString()}\n`;
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to get tag: ${error.message}`);
        }
        throw new UserError('Failed to get tag with unknown error');
      }
    }
  });

  // Create tag tool
  server.addTool({
    name: "create-tag",
    description: "Create a new tag in n8n for organizing workflows",
    parameters: CreateTagSchema,
    annotations: {
      title: "Create New Tag",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof CreateTagSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const tagData: CreateTagRequest = {
          name: args.name
        };

        const tag = await client.createTag(tagData);
        
        return `✅ Successfully created tag "${tag.name}" with ID: ${tag.id}`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to create tag: ${error.message}`);
        }
        throw new UserError('Failed to create tag with unknown error');
      }
    }
  });

  // Update tag tool
  server.addTool({
    name: "update-tag",
    description: "Update a tag's name in n8n",
    parameters: UpdateTagSchema,
    annotations: {
      title: "Update Tag",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof UpdateTagSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const { tagId, ...updateData } = args;
        const tagData: UpdateTagRequest = {
          name: updateData.name
        };

        const tag = await client.updateTag(tagId, tagData);
        
        return `✅ Successfully updated tag to "${tag.name}" (ID: ${tag.id})`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to update tag: ${error.message}`);
        }
        throw new UserError('Failed to update tag with unknown error');
      }
    }
  });

  // Delete tag tool
  server.addTool({
    name: "delete-tag",
    description: "Delete a tag from n8n permanently. This will remove the tag from all workflows using it",
    parameters: TagIdSchema,
    annotations: {
      title: "Delete Tag",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof TagIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        await client.deleteTag(args.tagId);
        return `✅ Successfully deleted tag with ID: ${args.tagId}`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to delete tag: ${error.message}`);
        }
        throw new UserError('Failed to delete tag with unknown error');
      }
    }
  });

  // Get workflow tags tool
  server.addTool({
    name: "get-workflow-tags",
    description: "Get all tags assigned to a specific workflow",
    parameters: WorkflowIdSchema,
    annotations: {
      title: "Get Workflow Tags",
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
        const tags = await client.getWorkflowTags(args.workflowId);
        
        if (tags.length === 0) {
          return `No tags found for workflow ID: ${args.workflowId}`;
        }

        let result = `Found ${tags.length} tag(s) for workflow ${args.workflowId}:\n\n`;
        
        tags.forEach((tag: N8nTag, index: number) => {
          result += `${index + 1}. **${tag.name}** (ID: ${tag.id})\n`;
        });

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to get workflow tags: ${error.message}`);
        }
        throw new UserError('Failed to get workflow tags with unknown error');
      }
    }
  });

  // Update workflow tags tool
  server.addTool({
    name: "update-workflow-tags",
    description: "Update the tags assigned to a workflow. This replaces all existing tags with the provided list",
    parameters: UpdateWorkflowTagsSchema,
    annotations: {
      title: "Update Workflow Tags",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    execute: async (args: z.infer<typeof UpdateWorkflowTagsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        await client.updateWorkflowTags(args.workflowId, args.tagIds);
        
        const tagCount = args.tagIds.length;
        return `✅ Successfully updated workflow ${args.workflowId} with ${tagCount} tag(s)`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to update workflow tags: ${error.message}`);
        }
        throw new UserError('Failed to update workflow tags with unknown error');
      }
    }
  });
}