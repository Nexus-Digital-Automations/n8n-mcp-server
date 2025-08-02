import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { N8nExecution, PaginationOptions } from '../types/n8n.js';

// Zod schemas for validation
const ExecutionIdSchema = z.object({
  executionId: z.string().min(1, 'Execution ID is required'),
});

const ListExecutionsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

// Tool registration function
export function createExecutionTools(getClient: () => N8nClient | null, server: any) {
  // List executions tool
  server.addTool({
    name: 'list-executions',
    description: 'List all workflow executions in the n8n instance with pagination support',
    parameters: ListExecutionsSchema,
    annotations: {
      title: 'List n8n Executions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ListExecutionsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const options: PaginationOptions = {};
        if (args.limit) options.limit = args.limit;
        if (args.cursor) options.cursor = args.cursor;

        const response = await client.getExecutions(options);

        if (response.data.length === 0) {
          return 'No executions found in the n8n instance.';
        }

        let result = `Found ${response.data.length} execution(s):\n\n`;

        response.data.forEach((execution: N8nExecution, index: number) => {
          const statusIcon =
            execution.status === 'success'
              ? '✅'
              : execution.status === 'error'
                ? '❌'
                : execution.status === 'running'
                  ? '🔄'
                  : '⏳';

          result += `${index + 1}. **Execution ${execution.id}**\n`;
          result += `   - Status: ${statusIcon} ${execution.status}\n`;
          result += `   - Workflow ID: ${execution.workflowId}\n`;
          result += `   - Mode: ${execution.mode}\n`;
          result += `   - Started: ${new Date(execution.startedAt).toLocaleString()}\n`;

          if (execution.stoppedAt) {
            result += `   - Stopped: ${new Date(execution.stoppedAt).toLocaleString()}\n`;
          }

          if (execution.finished !== undefined) {
            result += `   - Finished: ${execution.finished ? 'Yes' : 'No'}\n`;
          }

          if (execution.retryOf) {
            result += `   - Retry Of: ${execution.retryOf}\n`;
          }

          result += '\n';
        });

        if (response.nextCursor) {
          result += `\n📄 Use cursor "${response.nextCursor}" to get the next page.`;
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to list executions: ${error.message}`);
        }
        throw new UserError('Failed to list executions with unknown error');
      }
    },
  });

  // Get execution tool
  server.addTool({
    name: 'get-execution',
    description: 'Get detailed information about a specific execution by ID',
    parameters: ExecutionIdSchema,
    annotations: {
      title: 'Get Execution Details',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ExecutionIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const execution = await client.getExecution(args.executionId);

        const statusIcon =
          execution.status === 'success'
            ? '✅'
            : execution.status === 'error'
              ? '❌'
              : execution.status === 'running'
                ? '🔄'
                : '⏳';

        let result = `# Execution: ${execution.id}\n\n`;
        result += `**Status:** ${statusIcon} ${execution.status}\n`;
        result += `**Workflow ID:** ${execution.workflowId}\n`;
        result += `**Mode:** ${execution.mode}\n`;
        result += `**Started At:** ${new Date(execution.startedAt).toLocaleString()}\n`;

        if (execution.stoppedAt) {
          result += `**Stopped At:** ${new Date(execution.stoppedAt).toLocaleString()}\n`;
        }

        result += `**Finished:** ${execution.finished ? 'Yes' : 'No'}\n`;

        if (execution.retryOf) {
          result += `**Retry Of:** ${execution.retryOf}\n`;
        }

        if (execution.retrySuccessId) {
          result += `**Retry Success ID:** ${execution.retrySuccessId}\n`;
        }

        if (execution.waitTill) {
          result += `**Wait Until:** ${new Date(execution.waitTill).toLocaleString()}\n`;
        }

        // Include workflow information if available
        if (execution.workflowData) {
          result += `\n## Workflow Information:\n`;
          result += `**Name:** ${execution.workflowData.name}\n`;
          result += `**Active:** ${execution.workflowData.active ? 'Yes' : 'No'}\n`;
          result += `**Nodes:** ${execution.workflowData.nodes?.length || 0}\n`;
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to get execution: ${error.message}`);
        }
        throw new UserError('Failed to get execution with unknown error');
      }
    },
  });

  // Delete execution tool
  server.addTool({
    name: 'delete-execution',
    description: 'Delete an execution from n8n permanently. WARNING: This action cannot be undone',
    parameters: ExecutionIdSchema,
    annotations: {
      title: 'Delete Execution',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ExecutionIdSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        await client.deleteExecution(args.executionId);
        return `✅ Successfully deleted execution with ID: ${args.executionId}`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to delete execution: ${error.message}`);
        }
        throw new UserError('Failed to delete execution with unknown error');
      }
    },
  });
}
