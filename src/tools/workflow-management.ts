/**
 * Workflow Management Tools
 * 
 * MCP tools for programmatic workflow creation, execution, monitoring, and management
 * using n8n fork APIs with support for tags, projects, and collaboration features.
 */

import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { WorkflowManagementClient } from '../client/workflowManagementClient.js';

let workflowClient: WorkflowManagementClient | null = null;

/**
 * Initialize workflow management client
 */
function getWorkflowClient(n8nClient: N8nClient | null): WorkflowManagementClient {
  if (!n8nClient) {
    throw new UserError('n8n client not initialized. Please run init-n8n first.');
  }
  
  if (!workflowClient || workflowClient !== workflowClient) {
    workflowClient = new WorkflowManagementClient(n8nClient);
  }
  return workflowClient;
}

// Zod schemas for validation
const CreateWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required'),
  nodes: z.array(z.any()).min(1, 'At least one node is required'),
  connections: z.record(z.any()),
  tags: z.array(z.string()).optional().default([]),
  active: z.boolean().optional().default(false),
  projectId: z.string().optional(),
});

const UpdateWorkflowSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  name: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  connections: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

const ListWorkflowsSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
  active: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  ownedBy: z.string().optional(),
});

const ExecuteWorkflowSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  inputData: z.any().optional(),
  startNodes: z.array(z.string()).optional(),
  loadFromDatabase: z.boolean().optional().default(true),
});

const ExecutionStatusSchema = z.object({
  executionId: z.string().min(1, 'Execution ID is required'),
});

const ListExecutionsSchema = z.object({
  workflowId: z.string().optional(),
  status: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
});

const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  type: z.enum(['Personal', 'Team']).optional().default('Personal'),
});

const CreateTagSchema = z.object({
  name: z.string().min(1, 'Tag name is required'),
});

const ShareWorkflowSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  role: z.enum(['workflow:owner', 'workflow:editor', 'workflow:user']).optional().default('workflow:user'),
});

const WorkflowAnalyticsSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  granularity: z.enum(['day', 'week', 'month']).optional().default('day'),
});

const GlobalAnalyticsSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  projectId: z.string().optional(),
});

const BulkActivateSchema = z.object({
  workflowIds: z.array(z.string()).min(1, 'At least one workflow ID is required'),
  active: z.boolean(),
});

const ExportWorkflowsSchema = z.object({
  workflowIds: z.array(z.string()).min(1, 'At least one workflow ID is required'),
  includeCredentials: z.boolean().optional().default(false),
  format: z.enum(['json', 'zip']).optional().default('json'),
});

/**
 * Register all workflow management tools
 */
export function registerWorkflowManagementTools(server: any) {
  const getClient = () => {
    // This is a simplified approach - in a real implementation, we'd need access to the global client
    throw new UserError('Workflow management tools require integration with global n8n client');
  };

  // Create Workflow Tool
  server.addTool({
    name: 'create-workflow-advanced',
    description: 'Create a new n8n workflow with advanced configuration options',
    parameters: CreateWorkflowSchema,
    annotations: {
      title: 'Create Advanced Workflow',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (params: z.infer<typeof CreateWorkflowSchema>) => {
      try {
        const client = getWorkflowClient(getClient());
        
        const workflow = await client.createWorkflow({
          name: params.name,
          nodes: params.nodes,
          connections: params.connections,
          tags: params.tags,
          active: params.active,
          settings: {},
          staticData: {},
          meta: { templateCredsSetupCompleted: false },
          pinData: {},
        });

        // Move to project if specified
        if (params.projectId && workflow.id) {
          await client.moveWorkflowToProject(workflow.id, params.projectId);
        }

        return `✅ Advanced workflow "${params.name}" created successfully${params.active ? ' and activated' : ''}. ID: ${workflow.id}`;
      } catch (error) {
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to create workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Update Workflow Tool
  server.addTool({
    name: 'update-workflow-advanced',
    description: 'Update an existing n8n workflow with advanced options',
    parameters: UpdateWorkflowSchema,
    annotations: {
      title: 'Update Advanced Workflow',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (params: z.infer<typeof UpdateWorkflowSchema>) => {
      try {
        const client = getWorkflowClient(getClient());
        
        const updates: any = {};
        if (params.name !== undefined) updates.name = params.name;
        if (params.nodes !== undefined) updates.nodes = params.nodes;
        if (params.connections !== undefined) updates.connections = params.connections;
        if (params.tags !== undefined) updates.tags = params.tags;
        if (params.active !== undefined) updates.active = params.active;

        const workflow = await client.updateWorkflow(params.workflowId, updates);

        return `✅ Workflow updated successfully. Name: ${workflow.name}, Active: ${workflow.active}`;
      } catch (error) {
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to update workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // List Workflows with Advanced Filtering
  server.addTool({
    name: 'list-workflows-advanced',
    description: 'List workflows with advanced filtering options including project and ownership filters',
    parameters: ListWorkflowsSchema,
    annotations: {
      title: 'List Advanced Workflows',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (params: z.infer<typeof ListWorkflowsSchema>) => {
      try {
        const client = getWorkflowClient(getClient());
        
        const result = await client.listWorkflows({
          limit: params.limit,
          offset: params.offset,
          active: params.active,
          tags: params.tags,
          projectId: params.projectId,
          ownedBy: params.ownedBy,
        });

        const workflows = result.workflows.map(workflow => ({
          id: workflow.id,
          name: workflow.name,
          active: workflow.active,
          tags: workflow.tags,
          nodeCount: workflow.nodes.length,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        }));

        return {
          workflows,
          totalCount: result.totalCount,
          summary: `📋 Found ${workflows.length} workflows (${result.totalCount} total)`,
        };
      } catch (error) {
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to list workflows: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Execute Workflow Tool
  server.addTool({
    name: 'execute-workflow-advanced',
    description: 'Execute a workflow manually with advanced execution options',
    parameters: ExecuteWorkflowSchema,
    annotations: {
      title: 'Execute Advanced Workflow',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (params: z.infer<typeof ExecuteWorkflowSchema>) => {
      try {
        const client = getWorkflowClient(getClient());
        
        const execution = await client.executeWorkflow(params.workflowId, params.inputData, {
          startNodes: params.startNodes,
          loadFromDatabase: params.loadFromDatabase,
        });

        return {
          executionId: execution.id,
          workflowId: execution.workflowId,
          status: execution.status,
          mode: execution.mode,
          startedAt: execution.startedAt,
          message: `🚀 Workflow execution started with ID: ${execution.id}`,
        };
      } catch (error) {
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to execute workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Get Execution Status Tool
  server.addTool({
    name: 'get-execution-status-advanced',
    description: 'Get detailed status and information about a workflow execution',
    parameters: ExecutionStatusSchema,
    annotations: {
      title: 'Get Advanced Execution Status',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (params: z.infer<typeof ExecutionStatusSchema>) => {
      try {
        const client = getWorkflowClient(getClient());
        
        const execution = await client.getExecution(params.executionId);

        const duration = execution.stoppedAt && execution.startedAt ?
          new Date(execution.stoppedAt).getTime() - new Date(execution.startedAt).getTime() : null;

        return {
          execution: {
            id: execution.id,
            workflowId: execution.workflowId,
            status: execution.status,
            mode: execution.mode,
            startedAt: execution.startedAt,
            stoppedAt: execution.stoppedAt,
            finished: execution.finished,
            duration: duration ? `${Math.round(duration / 1000)}s` : null,
          },
          message: `📊 Execution ${params.executionId} status: ${execution.status}`,
        };
      } catch (error) {
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to get execution status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // List Executions Tool
  server.addTool({
    name: 'list-executions-advanced',
    description: 'List workflow executions with advanced filtering and pagination',
    parameters: ListExecutionsSchema,
    annotations: {
      title: 'List Advanced Executions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (params: z.infer<typeof ListExecutionsSchema>) => {
      try {
        const client = getWorkflowClient(getClient());
        
        const result = await client.listExecutions({
          workflowId: params.workflowId,
          status: params.status,
          limit: params.limit,
          offset: params.offset,
        });

        const executions = result.executions.map(execution => {
          const duration = execution.stoppedAt && execution.startedAt ?
            new Date(execution.stoppedAt).getTime() - new Date(execution.startedAt).getTime() : null;

          return {
            id: execution.id,
            workflowId: execution.workflowId,
            status: execution.status,
            mode: execution.mode,
            startedAt: execution.startedAt,
            stoppedAt: execution.stoppedAt,
            duration: duration ? `${Math.round(duration / 1000)}s` : null,
            finished: execution.finished,
          };
        });

        return {
          executions,
          totalCount: result.totalCount,
          summary: `📋 Found ${executions.length} executions (${result.totalCount} total)`,
        };
      } catch (error) {
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to list executions: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Create Project Tool
  server.addTool({
    name: 'create-project-advanced',
    description: 'Create a new project for organizing workflows',
    parameters: CreateProjectSchema,
    annotations: {
      title: 'Create Advanced Project',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (params: z.infer<typeof CreateProjectSchema>) => {
      try {
        const client = getWorkflowClient(getClient());
        
        const project = await client.createProject({
          name: params.name,
          type: params.type,
        });

        return {
          project: {
            id: project.id,
            name: project.name,
            type: project.type,
            createdAt: project.createdAt,
          },
          message: `✅ Project "${params.name}" created successfully`,
        };
      } catch (error) {
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // List Projects Tool
  server.addTool({
    name: 'list-projects-advanced',
    description: 'List all projects with detailed information',
    parameters: z.object({}),
    annotations: {
      title: 'List Advanced Projects',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async () => {
      try {
        const client = getWorkflowClient(getClient());
        
        const projects = await client.listProjects();

        const formattedProjects = projects.map(project => ({
          id: project.id,
          name: project.name,
          type: project.type,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        }));

        return {
          projects: formattedProjects,
          message: `📁 Found ${projects.length} projects`,
        };
      } catch (error) {
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to list projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Create Tag Tool
  server.addTool({
    name: 'create-tag-advanced',
    description: 'Create a new tag for organizing workflows',
    parameters: CreateTagSchema,
    annotations: {
      title: 'Create Advanced Tag',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (params: z.infer<typeof CreateTagSchema>) => {
      try {
        const client = getWorkflowClient(getClient());
        
        const tag = await client.createTag({ name: params.name });

        return {
          tag: {
            id: tag.id,
            name: tag.name,
            createdAt: tag.createdAt,
          },
          message: `🏷️ Tag "${params.name}" created successfully`,
        };
      } catch (error) {
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to create tag: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // List Tags Tool
  server.addTool({
    name: 'list-tags-advanced',
    description: 'List all available tags with details',
    parameters: z.object({}),
    annotations: {
      title: 'List Advanced Tags',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async () => {
      try {
        const client = getWorkflowClient(getClient());
        
        const tags = await client.listTags();

        const formattedTags = tags.map(tag => ({
          id: tag.id,
          name: tag.name,
          createdAt: tag.createdAt,
        }));

        return {
          tags: formattedTags,
          message: `🏷️ Found ${tags.length} tags`,
        };
      } catch (error) {
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to list tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  });

  // Note: Advanced features like analytics, collaboration, and bulk operations
  // are included as stubs to demonstrate the complete API structure, but would
  // require extensions to the base N8nClient to fully implement.
  
  server.addTool({
    name: 'get-workflow-analytics',
    description: 'Get detailed analytics for a specific workflow (requires n8n fork API extension)',
    parameters: WorkflowAnalyticsSchema,
    annotations: {
      title: 'Get Workflow Analytics',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (params: z.infer<typeof WorkflowAnalyticsSchema>) => {
      throw new UserError('Workflow analytics not yet implemented - requires n8n fork API extension. This tool provides a preview of the planned functionality.');
    },
  });

  server.addTool({
    name: 'share-workflow',
    description: 'Share a workflow with another user (requires n8n fork API extension)',
    parameters: ShareWorkflowSchema,
    annotations: {
      title: 'Share Workflow',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (params: z.infer<typeof ShareWorkflowSchema>) => {
      throw new UserError('Workflow sharing not yet implemented - requires n8n fork API extension. This tool provides a preview of the planned functionality.');
    },
  });

  server.addTool({
    name: 'bulk-activate-workflows',
    description: 'Activate or deactivate multiple workflows at once (requires n8n fork API extension)',
    parameters: BulkActivateSchema,
    annotations: {
      title: 'Bulk Activate Workflows',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (params: z.infer<typeof BulkActivateSchema>) => {
      throw new UserError('Bulk workflow operations not yet implemented - requires n8n fork API extension. This tool provides a preview of the planned functionality.');
    },
  });
}