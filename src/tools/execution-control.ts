/**
 * Execution Control Tools for n8n MCP Server
 *
 * Provides sophisticated execution control tools for canceling, retrying,
 * and partial workflow execution with advanced state management.
 */

import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { ExecutionStateManager } from '../utils/executionState.js';
import {
  ExecutionAction,
  ExecutionState,
  RetryStrategy,
  CancellationReason,
  ExecutionPriority,
  ExecutionControlRequest,
  BatchExecutionControlRequest,
} from '../types/executionTypes.js';

// Zod schemas for validation
const ExecutionControlSchema = z.object({
  executionId: z.string().min(1, 'Execution ID is required'),
  action: z.enum(['pause', 'resume', 'stop', 'cancel', 'retry', 'retry-from-node', 'skip-node', 'execute-partial']),
  reason: z.string().optional(),
  force: z.boolean().optional().default(false),
  parameters: z.record(z.string(), z.any()).optional(),
});

const RetryExecutionSchema = z.object({
  executionId: z.string().min(1, 'Execution ID is required'),
  strategy: z.enum(['immediate', 'linear', 'exponential', 'custom']).optional().default('exponential'),
  maxRetries: z.number().min(1).max(10).optional().default(3),
  retryDelay: z.number().min(0).max(300000).optional(), // Max 5 minutes
  retryFromNode: z.string().optional(),
  skipNodes: z.array(z.string()).optional(),
  onlyFailedNodes: z.boolean().optional().default(true),
});

const CancelExecutionSchema = z.object({
  executionId: z.string().min(1, 'Execution ID is required'),
  reason: z.enum(['user-requested', 'timeout', 'resource-limit', 'error-threshold', 'dependency-failure', 'system-shutdown', 'policy-violation']).optional().default('user-requested'),
  force: z.boolean().optional().default(false),
  gracefulShutdown: z.boolean().optional().default(true),
});

const PartialExecutionSchema = z.object({
  executionId: z.string().min(1, 'Execution ID is required'),
  targetNodes: z.array(z.string()).min(1, 'At least one target node is required'),
  startFromNode: z.string().optional(),
  executeUntilNode: z.string().optional(),
  skipNodes: z.array(z.string()).optional(),
  preserveState: z.boolean().optional().default(true),
});

const BatchExecutionControlSchema = z.object({
  executionIds: z.array(z.string()).min(1).max(50, 'Maximum 50 executions allowed in batch'),
  action: z.enum(['pause', 'resume', 'stop', 'cancel', 'retry']),
  continueOnFailure: z.boolean().optional().default(true),
  reason: z.string().optional(),
  parameters: z.record(z.string(), z.any()).optional(),
});

const ExecutionCheckpointSchema = z.object({
  executionId: z.string().min(1, 'Execution ID is required'),
  description: z.string().min(1, 'Checkpoint description is required'),
  metadata: z.record(z.string(), z.any()).optional(),
});

const RestoreCheckpointSchema = z.object({
  checkpointId: z.string().min(1, 'Checkpoint ID is required'),
  preserveProgress: z.boolean().optional().default(false),
});

const ExecutionAnalyticsSchema = z.object({
  executionId: z.string().min(1, 'Execution ID is required'),
  includePerformanceMetrics: z.boolean().optional().default(true),
  includeOptimizationSuggestions: z.boolean().optional().default(true),
  includeErrorAnalysis: z.boolean().optional().default(true),
});

const ExecutionMonitoringSchema = z.object({
  executionIds: z.array(z.string()).optional(),
  states: z.array(z.enum(['pending', 'running', 'paused', 'stopping', 'stopped', 'cancelled', 'completed', 'failed', 'timeout', 'waiting', 'retrying', 'partial'])).optional(),
  includeHistory: z.boolean().optional().default(false),
  includeMetrics: z.boolean().optional().default(false),
  limit: z.number().min(1).max(100).optional().default(20),
});

// Global execution state manager instance
let executionStateManager: ExecutionStateManager | null = null;

// Function to get the execution state manager instance
const getExecutionStateManager = () => {
  if (!executionStateManager) {
    executionStateManager = new ExecutionStateManager();
  }
  return executionStateManager;
};

// Tool registration function
export function createExecutionControlTools(getClient: () => N8nClient | null, server: any) {
  // Basic execution control tool
  server.addTool({
    name: 'control-execution',
    description: 'Control execution state with actions like pause, resume, stop, or cancel',
    parameters: ExecutionControlSchema,
    annotations: {
      title: 'Control Execution',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ExecutionControlSchema>) => {
      try {
        const client = getClient();
        if (!client) {
          throw new UserError('n8n client not initialized. Please run init-n8n first.');
        }

        const stateManager = getExecutionStateManager();

        // Get execution details first
        let execution;
        try {
          execution = await client.getExecution(args.executionId);
        } catch (error) {
          throw new UserError(`Execution ${args.executionId} not found: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Initialize execution tracking if not already done
        let context = stateManager.getExecutionContext(args.executionId);
        if (!context) {
          const enhancedExecution = stateManager.initializeExecution(execution);
          context = stateManager.getExecutionContext(args.executionId)!;
        }

        // Create control request
        const request: ExecutionControlRequest = {
          executionId: args.executionId,
          action: args.action as ExecutionAction,
          requestedAt: new Date().toISOString(),
          requestedBy: 'mcp-user',
          parameters: {
            reason: args.reason as CancellationReason,
            force: args.force,
            ...args.parameters,
          },
        };

        // Process the control request
        const response = await stateManager.processControlRequest(request);

        if (!response.success) {
          return (
            `❌ **Execution Control Failed**\n\n` +
            `- **Execution ID:** ${args.executionId}\n` +
            `- **Action:** ${args.action}\n` +
            `- **Error:** ${response.error?.message || response.message}\n` +
            (response.error?.details ? `- **Details:** ${JSON.stringify(response.error.details, null, 2)}\n` : '') +
            `\nThe execution control action could not be completed.`
          );
        }

        const statusIcon = getStatusIcon(response.executionState || context.execution.enhancedState);

        return (
          `✅ **Execution Control Successful**\n\n` +
          `- **Execution ID:** ${args.executionId}\n` +
          `- **Action:** ${args.action}\n` +
          `- **New State:** ${statusIcon} ${response.executionState}\n` +
          `- **Timestamp:** ${new Date(response.timestamp).toLocaleString()}\n` +
          (response.data?.checkpointId ? `- **Checkpoint:** ${response.data.checkpointId}\n` : '') +
          (response.data?.estimatedCompletion ? `- **Estimated Completion:** ${new Date(response.data.estimatedCompletion).toLocaleString()}\n` : '') +
          (response.data?.affectedNodes ? `- **Affected Nodes:** ${response.data.affectedNodes.length}\n` : '') +
          `\n${response.message}`
        );
      } catch (error) {
        throw new UserError(
          `Failed to control execution: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Advanced retry tool
  server.addTool({
    name: 'retry-execution',
    description: 'Retry failed execution with advanced options including retry strategy, node selection, and custom parameters',
    parameters: RetryExecutionSchema,
    annotations: {
      title: 'Retry Execution',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof RetryExecutionSchema>) => {
      try {
        const client = getClient();
        if (!client) {
          throw new UserError('n8n client not initialized. Please run init-n8n first.');
        }

        const stateManager = getExecutionStateManager();

        // Get execution details
        const execution = await client.getExecution(args.executionId);
        
        // Initialize or get execution context
        let context = stateManager.getExecutionContext(args.executionId);
        if (!context) {
          stateManager.initializeExecution(execution);
          context = stateManager.getExecutionContext(args.executionId)!;
        }

        // Check if execution can be retried
        if (!stateManager.canRetryExecution(args.executionId)) {
          const currentRetryCount = context.execution.retryInfo?.attemptCount || 0;
          const maxRetries = context.execution.controlConfig.maxExecutionRetries || 3;
          
          return (
            `❌ **Cannot Retry Execution**\n\n` +
            `- **Execution ID:** ${args.executionId}\n` +
            `- **Current State:** ${context.execution.enhancedState}\n` +
            `- **Retry Count:** ${currentRetryCount}/${maxRetries}\n` +
            `- **Reason:** ${currentRetryCount >= maxRetries ? 'Maximum retries exceeded' : 'Execution state does not allow retry'}\n\n` +
            `The execution cannot be retried in its current state or has exceeded the maximum retry limit.`
          );
        }

        // Create retry request
        const request: ExecutionControlRequest = {
          executionId: args.executionId,
          action: args.retryFromNode ? 'retry-from-node' : 'retry',
          requestedAt: new Date().toISOString(),
          requestedBy: 'mcp-user',
          parameters: {
            retryStrategy: args.strategy,
            maxRetries: args.maxRetries,
            retryDelay: args.retryDelay,
            startFromNode: args.retryFromNode,
            skipNodes: args.skipNodes,
          },
        };

        const response = await stateManager.processControlRequest(request);

        if (!response.success) {
          return (
            `❌ **Retry Failed**\n\n` +
            `- **Execution ID:** ${args.executionId}\n` +
            `- **Error:** ${response.error?.message || response.message}\n\n` +
            `The execution retry could not be initiated.`
          );
        }

        const retryInfo = context.execution.retryInfo!;
        const estimatedDelay = response.data?.performanceImpact?.estimatedDelay || 0;

        return (
          `🔄 **Execution Retry Initiated**\n\n` +
          `- **Execution ID:** ${args.executionId}\n` +
          `- **Strategy:** ${args.strategy}\n` +
          `- **Attempt:** ${retryInfo.attemptCount}/${retryInfo.maxAttempts}\n` +
          `- **Next Retry:** ${retryInfo.nextRetryAt ? new Date(retryInfo.nextRetryAt).toLocaleString() : 'Immediate'}\n` +
          `- **Estimated Delay:** ${estimatedDelay}ms\n` +
          (args.retryFromNode ? `- **Starting From Node:** ${args.retryFromNode}\n` : '') +
          (args.skipNodes?.length ? `- **Skipping Nodes:** ${args.skipNodes.join(', ')}\n` : '') +
          `\n${response.message}`
        );
      } catch (error) {
        throw new UserError(
          `Failed to retry execution: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Cancel execution tool
  server.addTool({
    name: 'cancel-execution',
    description: 'Cancel execution with specified reason and options for graceful or forced cancellation',
    parameters: CancelExecutionSchema,
    annotations: {
      title: 'Cancel Execution',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof CancelExecutionSchema>) => {
      try {
        const client = getClient();
        if (!client) {
          throw new UserError('n8n client not initialized. Please run init-n8n first.');
        }

        const stateManager = getExecutionStateManager();

        // Get execution details
        const execution = await client.getExecution(args.executionId);
        
        // Initialize or get execution context
        let context = stateManager.getExecutionContext(args.executionId);
        if (!context) {
          stateManager.initializeExecution(execution);
          context = stateManager.getExecutionContext(args.executionId)!;
        }

        // Create cancel request
        const request: ExecutionControlRequest = {
          executionId: args.executionId,
          action: 'cancel',
          requestedAt: new Date().toISOString(),
          requestedBy: 'mcp-user',
          parameters: {
            reason: args.reason as CancellationReason,
            force: args.force,
          },
        };

        const response = await stateManager.processControlRequest(request);

        if (!response.success) {
          return (
            `❌ **Cancellation Failed**\n\n` +
            `- **Execution ID:** ${args.executionId}\n` +
            `- **Error:** ${response.error?.message || response.message}\n\n` +
            `The execution could not be cancelled.`
          );
        }

        const cancellationInfo = context.execution.cancellation!;

        return (
          `🚫 **Execution Cancelled**\n\n` +
          `- **Execution ID:** ${args.executionId}\n` +
          `- **Reason:** ${cancellationInfo.reason}\n` +
          `- **Requested At:** ${new Date(cancellationInfo.requestedAt).toLocaleString()}\n` +
          `- **Cancelled At:** ${new Date(cancellationInfo.cancelledAt!).toLocaleString()}\n` +
          `- **Cancellation Type:** ${args.force ? 'Forced' : 'Graceful'}\n` +
          `\n${response.message}`
        );
      } catch (error) {
        throw new UserError(
          `Failed to cancel execution: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Partial execution tool
  server.addTool({
    name: 'execute-partial-workflow',
    description: 'Execute specific nodes or workflow segments with options for node selection and execution boundaries',
    parameters: PartialExecutionSchema,
    annotations: {
      title: 'Execute Partial Workflow',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof PartialExecutionSchema>) => {
      try {
        const client = getClient();
        if (!client) {
          throw new UserError('n8n client not initialized. Please run init-n8n first.');
        }

        const stateManager = getExecutionStateManager();

        // Get execution details
        const execution = await client.getExecution(args.executionId);
        
        // Initialize or get execution context
        let context = stateManager.getExecutionContext(args.executionId);
        if (!context) {
          stateManager.initializeExecution(execution);
          context = stateManager.getExecutionContext(args.executionId)!;
        }

        // Validate target nodes exist
        const workflowNodes = execution.workflowData?.nodes || [];
        const nodeIds = workflowNodes.map(node => node.id);
        const invalidNodes = args.targetNodes.filter(nodeId => !nodeIds.includes(nodeId));
        
        if (invalidNodes.length > 0) {
          return (
            `❌ **Invalid Target Nodes**\n\n` +
            `- **Execution ID:** ${args.executionId}\n` +
            `- **Invalid Nodes:** ${invalidNodes.join(', ')}\n` +
            `- **Available Nodes:** ${nodeIds.join(', ')}\n\n` +
            `Please specify valid node IDs from the workflow.`
          );
        }

        // Update execution partial execution info
        context.execution.partialExecution = {
          targetNodes: args.targetNodes,
          startFromNode: args.startFromNode,
          executeUntilNode: args.executeUntilNode,
          skipNodes: args.skipNodes,
        };

        // Create execute-partial request
        const request: ExecutionControlRequest = {
          executionId: args.executionId,
          action: 'execute-partial',
          requestedAt: new Date().toISOString(),
          requestedBy: 'mcp-user',
          parameters: {
            targetNodes: args.targetNodes,
            startFromNode: args.startFromNode,
            executeUntilNode: args.executeUntilNode,
            skipNodes: args.skipNodes,
            preserveState: args.preserveState,
          },
        };

        // Update execution state
        stateManager.updateExecutionState(args.executionId, 'partial');

        return (
          `🎯 **Partial Execution Configured**\n\n` +
          `- **Execution ID:** ${args.executionId}\n` +
          `- **Target Nodes:** ${args.targetNodes.length} nodes\n` +
          `  - ${args.targetNodes.join(', ')}\n` +
          (args.startFromNode ? `- **Start From:** ${args.startFromNode}\n` : '') +
          (args.executeUntilNode ? `- **Execute Until:** ${args.executeUntilNode}\n` : '') +
          (args.skipNodes?.length ? `- **Skip Nodes:** ${args.skipNodes.join(', ')}\n` : '') +
          `- **Preserve State:** ${args.preserveState ? 'Yes' : 'No'}\n` +
          `\nThe execution has been configured for partial workflow execution. ` +
          `Use 'control-execution' with action 'resume' to start the partial execution.`
        );
      } catch (error) {
        throw new UserError(
          `Failed to configure partial execution: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Batch execution control tool
  server.addTool({
    name: 'batch-control-executions',
    description: 'Control multiple executions simultaneously with options for different actions and failure handling',
    parameters: BatchExecutionControlSchema,
    annotations: {
      title: 'Batch Control Executions',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof BatchExecutionControlSchema>) => {
      try {
        const client = getClient();
        if (!client) {
          throw new UserError('n8n client not initialized. Please run init-n8n first.');
        }

        const stateManager = getExecutionStateManager();

        // Create batch request
        const batchRequest: BatchExecutionControlRequest = {
          executionIds: args.executionIds,
          action: args.action as ExecutionAction,
          requestedAt: new Date().toISOString(),
          requestedBy: 'mcp-user',
          continueOnFailure: args.continueOnFailure,
          parameters: {
            reason: args.reason as CancellationReason,
            ...args.parameters,
          },
        };

        const results: Array<{
          executionId: string;
          success: boolean;
          message: string;
          newState?: ExecutionState;
          error?: string;
        }> = [];

        let successCount = 0;
        let failureCount = 0;

        for (const executionId of args.executionIds) {
          try {
            // Get execution details
            const execution = await client.getExecution(executionId);
            
            // Initialize or get execution context
            let context = stateManager.getExecutionContext(executionId);
            if (!context) {
              stateManager.initializeExecution(execution);
              context = stateManager.getExecutionContext(executionId)!;
            }

            // Create individual control request
            const request: ExecutionControlRequest = {
              executionId,
              action: batchRequest.action,
              requestedAt: batchRequest.requestedAt,
              requestedBy: batchRequest.requestedBy,
              parameters: batchRequest.parameters,
            };

            const response = await stateManager.processControlRequest(request);

            if (response.success) {
              successCount++;
              results.push({
                executionId,
                success: true,
                message: response.message,
                newState: response.executionState,
              });
            } else {
              failureCount++;
              results.push({
                executionId,
                success: false,
                message: response.message,
                error: response.error?.message,
              });

              if (!args.continueOnFailure) {
                break;
              }
            }
          } catch (error) {
            failureCount++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            results.push({
              executionId,
              success: false,
              message: `Failed to process execution: ${errorMessage}`,
              error: errorMessage,
            });

            if (!args.continueOnFailure) {
              break;
            }
          }
        }

        const overallSuccess = failureCount === 0;
        const successRate = Math.round((successCount / args.executionIds.length) * 100);

        let output = `${overallSuccess ? '✅' : '⚠️'} **Batch Execution Control ${overallSuccess ? 'Completed' : 'Partially Completed'}**\n\n`;
        output += `- **Action:** ${args.action}\n`;
        output += `- **Total Executions:** ${args.executionIds.length}\n`;
        output += `- **Successful:** ${successCount}\n`;
        output += `- **Failed:** ${failureCount}\n`;
        output += `- **Success Rate:** ${successRate}%\n`;
        output += `- **Continue on Failure:** ${args.continueOnFailure ? 'Yes' : 'No'}\n\n`;

        output += `**Individual Results:**\n`;
        results.forEach((result, index) => {
          const statusIcon = result.success ? '✅' : '❌';
          output += `${index + 1}. ${statusIcon} **${result.executionId}**\n`;
          output += `   - Status: ${result.success ? 'Success' : 'Failed'}\n`;
          if (result.newState) {
            output += `   - New State: ${result.newState}\n`;
          }
          output += `   - Message: ${result.message}\n`;
          if (result.error) {
            output += `   - Error: ${result.error}\n`;
          }
          output += '\n';
        });

        return output;
      } catch (error) {
        throw new UserError(
          `Failed to process batch execution control: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Create execution checkpoint tool
  server.addTool({
    name: 'create-execution-checkpoint',
    description: 'Create a checkpoint for execution state that can be restored later',
    parameters: ExecutionCheckpointSchema,
    annotations: {
      title: 'Create Execution Checkpoint',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ExecutionCheckpointSchema>) => {
      try {
        const client = getClient();
        if (!client) {
          throw new UserError('n8n client not initialized. Please run init-n8n first.');
        }

        const stateManager = getExecutionStateManager();

        // Get execution details
        const execution = await client.getExecution(args.executionId);
        
        // Initialize or get execution context
        let context = stateManager.getExecutionContext(args.executionId);
        if (!context) {
          stateManager.initializeExecution(execution);
          context = stateManager.getExecutionContext(args.executionId)!;
        }

        // Create checkpoint
        const checkpoint = stateManager.createCheckpoint(
          args.executionId,
          args.description,
          args.metadata || {}
        );

        if (!checkpoint) {
          return (
            `❌ **Checkpoint Creation Failed**\n\n` +
            `- **Execution ID:** ${args.executionId}\n` +
            `- **Reason:** Unable to create checkpoint for execution\n\n` +
            `The execution may not be in a valid state for checkpoint creation.`
          );
        }

        return (
          `💾 **Checkpoint Created Successfully**\n\n` +
          `- **Checkpoint ID:** ${checkpoint.checkpointId}\n` +
          `- **Execution ID:** ${args.executionId}\n` +
          `- **Description:** ${checkpoint.description}\n` +
          `- **Timestamp:** ${new Date(checkpoint.timestamp).toLocaleString()}\n` +
          `- **Completed Nodes:** ${checkpoint.completedNodes.length}\n` +
          `- **Node States:** ${checkpoint.nodeStates.length}\n` +
          (Object.keys(checkpoint.metadata).length > 0 ? `- **Metadata:** ${JSON.stringify(checkpoint.metadata, null, 2)}\n` : '') +
          `\nThe checkpoint can be used to restore the execution to this state later.`
        );
      } catch (error) {
        throw new UserError(
          `Failed to create checkpoint: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Restore from checkpoint tool
  server.addTool({
    name: 'restore-execution-checkpoint',
    description: 'Restore execution from a previously created checkpoint',
    parameters: RestoreCheckpointSchema,
    annotations: {
      title: 'Restore Execution Checkpoint',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof RestoreCheckpointSchema>) => {
      try {
        const stateManager = getExecutionStateManager();

        // Restore from checkpoint
        const success = stateManager.restoreFromCheckpoint(args.checkpointId);

        if (!success) {
          return (
            `❌ **Checkpoint Restoration Failed**\n\n` +
            `- **Checkpoint ID:** ${args.checkpointId}\n` +
            `- **Reason:** Checkpoint not found or restoration failed\n\n` +
            `The checkpoint may not exist or the execution may not be in a valid state for restoration.`
          );
        }

        return (
          `🔄 **Checkpoint Restored Successfully**\n\n` +
          `- **Checkpoint ID:** ${args.checkpointId}\n` +
          `- **Preserve Progress:** ${args.preserveProgress ? 'Yes' : 'No'}\n` +
          `- **Restoration Time:** ${new Date().toLocaleString()}\n\n` +
          `The execution has been restored to the checkpoint state. ` +
          `Use 'control-execution' with action 'resume' to continue from this point.`
        );
      } catch (error) {
        throw new UserError(
          `Failed to restore checkpoint: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Execution analytics tool
  server.addTool({
    name: 'get-execution-analytics',
    description: 'Get detailed analytics and performance insights for an execution including optimization suggestions',
    parameters: ExecutionAnalyticsSchema,
    annotations: {
      title: 'Get Execution Analytics',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ExecutionAnalyticsSchema>) => {
      try {
        const stateManager = getExecutionStateManager();

        // Get analytics
        const analytics = stateManager.getExecutionAnalytics(args.executionId);

        if (!analytics) {
          return (
            `❌ **Analytics Not Available**\n\n` +
            `- **Execution ID:** ${args.executionId}\n` +
            `- **Reason:** Execution not found or analytics not generated\n\n` +
            `The execution may not exist or may not have enough data for analytics.`
          );
        }

        let output = `📊 **Execution Analytics**\n\n`;
        output += `- **Execution ID:** ${args.executionId}\n`;
        output += `- **Analysis Time:** ${new Date(analytics.timestamp).toLocaleString()}\n\n`;

        if (args.includePerformanceMetrics) {
          output += `**Performance Metrics:**\n`;
          output += `- **Total Duration:** ${formatDuration(analytics.performance.totalDuration)}\n`;
          output += `- **Memory Peak:** ${formatBytes(analytics.performance.memoryPeak)}\n`;
          output += `- **CPU Average:** ${analytics.performance.cpuAverage}%\n`;
          output += `- **Node Execution Times:**\n`;

          const sortedNodes = Object.entries(analytics.performance.nodeExecutionTimes)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);

          sortedNodes.forEach(([nodeId, duration]) => {
            output += `  - ${nodeId}: ${formatDuration(duration)}\n`;
          });
          output += '\n';
        }

        if (args.includeErrorAnalysis && analytics.errors.length > 0) {
          output += `**Error Analysis:**\n`;
          analytics.errors.forEach((error, index) => {
            output += `${index + 1}. **Node:** ${error.nodeId}\n`;
            output += `   - **Type:** ${error.errorType}\n`;
            output += `   - **Message:** ${error.errorMessage}\n`;
            output += `   - **Retry Count:** ${error.retryCount}\n`;
            output += `   - **Resolution:** ${error.resolution}\n\n`;
          });
        }

        output += `**Execution Flow:**\n`;
        output += `- **Critical Path:** ${analytics.flow.criticalPath.slice(0, 5).join(' → ')}\n`;
        if (analytics.flow.bottlenecks.length > 0) {
          output += `- **Top Bottlenecks:**\n`;
          analytics.flow.bottlenecks.slice(0, 3).forEach(bottleneck => {
            output += `  - ${bottleneck.nodeId}: ${formatDuration(bottleneck.duration)} (${bottleneck.type})\n`;
          });
        }
        output += '\n';

        if (args.includeOptimizationSuggestions && analytics.optimizations.length > 0) {
          output += `**Optimization Suggestions:**\n`;
          analytics.optimizations.forEach((suggestion, index) => {
            const priorityIcon = suggestion.priority === 'high' ? '🔴' : suggestion.priority === 'medium' ? '🟡' : '🟢';
            output += `${index + 1}. ${priorityIcon} **${suggestion.type.charAt(0).toUpperCase() + suggestion.type.slice(1)}**\n`;
            output += `   - **Description:** ${suggestion.description}\n`;
            output += `   - **Estimated Impact:** ${suggestion.estimatedImpact}\n`;
            output += `   - **Priority:** ${suggestion.priority}\n\n`;
          });
        }

        return output;
      } catch (error) {
        throw new UserError(
          `Failed to get execution analytics: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Monitor executions tool
  server.addTool({
    name: 'monitor-executions',
    description: 'Monitor multiple executions with real-time status, history, and metrics',
    parameters: ExecutionMonitoringSchema,
    annotations: {
      title: 'Monitor Executions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ExecutionMonitoringSchema>) => {
      try {
        const client = getClient();
        if (!client) {
          throw new UserError('n8n client not initialized. Please run init-n8n first.');
        }

        const stateManager = getExecutionStateManager();

        // Get executions to monitor
        let executionIds = args.executionIds;
        if (!executionIds) {
          // Get recent executions if none specified
          const response = await client.getExecutions({ limit: args.limit });
          executionIds = response.data.map(exec => exec.id);
        }

        const monitoringResults: any[] = [];

        for (const executionId of executionIds.slice(0, args.limit)) {
          try {
            const execution = await client.getExecution(executionId);
            const context = stateManager.getExecutionContext(executionId);

            // Filter by state if specified
            if (args.states && context) {
              if (!args.states.includes(context.execution.enhancedState as any)) {
                continue;
              }
            }

            const result: any = {
              executionId,
              status: execution.status,
              enhancedState: context?.execution.enhancedState || 'unknown',
              startedAt: execution.startedAt,
              stoppedAt: execution.stoppedAt,
              workflowId: execution.workflowId,
              mode: execution.mode,
            };

            if (context) {
              result.progress = context.execution.progress;
              result.availableActions = context.availableActions;

              if (args.includeMetrics) {
                result.metrics = context.execution.metrics;
              }

              if (args.includeHistory) {
                result.history = context.history;
              }
            }

            monitoringResults.push(result);
          } catch (error) {
            // Skip executions that can't be accessed
            continue;
          }
        }

        if (monitoringResults.length === 0) {
          return (
            `📊 **No Executions Found**\n\n` +
            `No executions match the specified criteria for monitoring.`
          );
        }

        let output = `📊 **Execution Monitoring Dashboard**\n\n`;
        output += `- **Total Executions:** ${monitoringResults.length}\n`;
        output += `- **Monitoring Time:** ${new Date().toLocaleString()}\n\n`;

        // Group by state
        const stateGroups: Record<string, any[]> = {};
        monitoringResults.forEach(result => {
          const state = result.enhancedState || result.status;
          if (!stateGroups[state]) {
            stateGroups[state] = [];
          }
          stateGroups[state].push(result);
        });

        output += `**State Summary:**\n`;
        Object.entries(stateGroups).forEach(([state, executions]) => {
          const icon = getStatusIcon(state as ExecutionState);
          output += `- ${icon} ${state}: ${executions.length}\n`;
        });
        output += '\n';

        output += `**Execution Details:**\n`;
        monitoringResults.forEach((result, index) => {
          const statusIcon = getStatusIcon(result.enhancedState || result.status);
          output += `${index + 1}. ${statusIcon} **${result.executionId}**\n`;
          output += `   - **State:** ${result.enhancedState || result.status}\n`;
          output += `   - **Workflow:** ${result.workflowId}\n`;
          output += `   - **Started:** ${new Date(result.startedAt).toLocaleString()}\n`;
          if (result.stoppedAt) {
            output += `   - **Stopped:** ${new Date(result.stoppedAt).toLocaleString()}\n`;
          }
          if (result.progress) {
            output += `   - **Progress:** ${result.progress.percentComplete}% (${result.progress.completedNodes}/${result.progress.totalNodes} nodes)\n`;
          }
          if (result.availableActions?.length > 0) {
            output += `   - **Available Actions:** ${result.availableActions.join(', ')}\n`;
          }
          output += '\n';
        });

        return output;
      } catch (error) {
        throw new UserError(
          `Failed to monitor executions: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });
}

// Helper functions

function getStatusIcon(state: ExecutionState | string): string {
  switch (state) {
    case 'running':
      return '🔄';
    case 'completed':
    case 'success':
      return '✅';
    case 'failed':
    case 'error':
      return '❌';
    case 'cancelled':
      return '🚫';
    case 'paused':
      return '⏸️';
    case 'stopped':
      return '⏹️';
    case 'waiting':
      return '⏳';
    case 'retrying':
      return '🔁';
    case 'partial':
      return '🎯';
    case 'timeout':
      return '⏰';
    default:
      return '⚪';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else if (ms < 3600000) {
    return `${(ms / 60000).toFixed(1)}m`;
  } else {
    return `${(ms / 3600000).toFixed(1)}h`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}