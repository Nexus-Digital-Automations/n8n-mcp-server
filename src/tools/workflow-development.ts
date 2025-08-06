import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { N8nNode } from '../types/n8n.js';
import {
  discoverWorkflowVariables,
  extractAvailableVariables,
} from '../utils/variableDiscovery.js';
import { getNodeDocumentation, getFunctionDocumentation } from '../utils/documentationAccess.js';

// Zod schemas for validation
const _WorkflowIdSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
});

const DiscoverVariablesSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  nodeId: z.string().optional(),
  includeGlobalVariables: z.boolean().optional().default(true),
  includeNodeOutputs: z.boolean().optional().default(true),
  includeExpressionFunctions: z.boolean().optional().default(false),
});

const NodeDocumentationSchema = z.object({
  nodeType: z.string().min(1, 'Node type is required'),
  includeExamples: z.boolean().optional().default(true),
  includeFunctions: z.boolean().optional().default(true),
});

const FunctionDocumentationSchema = z.object({
  functionName: z.string().min(1, 'Function name is required'),
  category: z
    .enum(['date', 'string', 'number', 'array', 'object', 'workflow', 'utility'])
    .optional(),
});

const DynamicNodeCreationSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  nodeType: z.string().min(1, 'Node type is required'),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.unknown()).optional(),
  name: z.string().optional(),
  connectTo: z
    .array(
      z.object({
        nodeId: z.string(),
        outputIndex: z.number().optional().default(0),
        inputIndex: z.number().optional().default(0),
      })
    )
    .optional(),
});

const WorkflowValidationSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  checkConnections: z.boolean().optional().default(true),
  checkNodeConfiguration: z.boolean().optional().default(true),
  checkCredentials: z.boolean().optional().default(true),
  suggestImprovements: z.boolean().optional().default(false),
});

const ExpressionEvaluationSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  nodeId: z.string().min(1, 'Node ID is required'),
  expression: z.string().min(1, 'Expression is required'),
  executionId: z.string().optional(),
  inputData: z.record(z.unknown()).optional(),
});

// Tool registration function
export function createWorkflowDevelopmentTools(getClient: () => N8nClient | null, server: any) {
  // Variable discovery tool
  server.addTool({
    name: 'discover-workflow-variables',
    description:
      'Discover available variables and data within a workflow context for development assistance',
    parameters: DiscoverVariablesSchema,
    annotations: {
      title: 'Discover Workflow Variables',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    execute: async (args: z.infer<typeof DiscoverVariablesSchema>, { log }: any) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized');
      }

      log.info('Discovering workflow variables', {
        workflowId: args.workflowId,
        nodeId: args.nodeId,
      });

      try {
        // Get workflow data
        const workflow = await client.getWorkflow(args.workflowId);

        // Discover variables in workflow context
        const variables = await discoverWorkflowVariables(workflow, args.nodeId, {
          includeGlobal: args.includeGlobalVariables,
          includeNodeOutputs: args.includeNodeOutputs,
          includeExpressionFunctions: args.includeExpressionFunctions,
        });

        log.info('Variable discovery completed', {
          variableCount: Object.keys(variables).length,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  workflowId: args.workflowId,
                  nodeId: args.nodeId,
                  variables,
                  discoveredAt: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        log.error('Failed to discover workflow variables', {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new UserError(
          `Failed to discover workflow variables: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Node documentation access tool
  server.addTool({
    name: 'get-node-documentation',
    description:
      'Get comprehensive documentation for a specific node type including parameters, examples, and usage patterns',
    parameters: NodeDocumentationSchema,
    annotations: {
      title: 'Get Node Documentation',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    execute: async (args: z.infer<typeof NodeDocumentationSchema>, { log }: any) => {
      log.info('Retrieving node documentation', { nodeType: args.nodeType });

      try {
        const documentation = await getNodeDocumentation(args.nodeType, {
          includeExamples: args.includeExamples,
          includeFunctions: args.includeFunctions,
        });

        log.info('Node documentation retrieved', {
          nodeType: args.nodeType,
          hasExamples: documentation.examples?.length ?? 0 > 0,
          hasFunctions: documentation.functions?.length ?? 0 > 0,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(documentation, null, 2),
            },
          ],
        };
      } catch (error) {
        log.error('Failed to retrieve node documentation', {
          nodeType: args.nodeType,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new UserError(
          `Failed to retrieve node documentation: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Function documentation access tool
  server.addTool({
    name: 'get-function-documentation',
    description:
      'Get documentation for built-in n8n expression functions with examples and usage patterns',
    parameters: FunctionDocumentationSchema,
    annotations: {
      title: 'Get Function Documentation',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    execute: async (args: z.infer<typeof FunctionDocumentationSchema>, { log }: any) => {
      log.info('Retrieving function documentation', {
        functionName: args.functionName,
        category: args.category,
      });

      try {
        const documentation = await getFunctionDocumentation(args.functionName, args.category);

        log.info('Function documentation retrieved', {
          functionName: args.functionName,
          hasExamples: documentation.examples?.length > 0,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(documentation, null, 2),
            },
          ],
        };
      } catch (error) {
        log.error('Failed to retrieve function documentation', {
          functionName: args.functionName,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new UserError(
          `Failed to retrieve function documentation: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Dynamic node creation tool
  server.addTool({
    name: 'create-workflow-node',
    description: 'Dynamically create and connect a new node in a workflow during development',
    parameters: DynamicNodeCreationSchema,
    annotations: {
      title: 'Create Workflow Node',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
    execute: async (args: z.infer<typeof DynamicNodeCreationSchema>, { log }: any) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized');
      }

      log.info('Creating new workflow node', {
        workflowId: args.workflowId,
        nodeType: args.nodeType,
        position: args.position,
      });

      try {
        // Get current workflow
        const workflow = await client.getWorkflow(args.workflowId);

        // Generate unique node ID
        const nodeId = `${args.nodeType}_${Date.now()}`;
        const nodeName = args.name || `${args.nodeType} ${Date.now()}`;

        // Create new node
        const newNode: N8nNode = {
          id: nodeId,
          name: nodeName,
          type: args.nodeType,
          typeVersion: 1,
          position: args.position,
          parameters: args.parameters || {},
        };

        // Add node to workflow
        const updatedNodes = [...(workflow.nodes || []), newNode];
        const updatedConnections = { ...workflow.connections };

        // Create connections if specified
        if (args.connectTo && args.connectTo.length > 0) {
          for (const connection of args.connectTo) {
            const sourceNodeConnections = updatedConnections[connection.nodeId] || {};
            const outputConnections = (sourceNodeConnections as any).main || [];

            if (!outputConnections[connection.outputIndex]) {
              outputConnections[connection.outputIndex] = [];
            }

            outputConnections[connection.outputIndex].push({
              node: nodeId,
              type: 'main',
              index: connection.inputIndex,
            });

            updatedConnections[connection.nodeId] = {
              ...sourceNodeConnections,
              main: outputConnections,
            };
          }
        }

        // Update workflow
        await client.updateWorkflow(args.workflowId, {
          nodes: updatedNodes,
          connections: updatedConnections,
        });

        log.info('Workflow node created successfully', {
          workflowId: args.workflowId,
          nodeId,
          nodeName,
          connectionCount: args.connectTo?.length || 0,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  nodeId,
                  nodeName,
                  nodeType: args.nodeType,
                  position: args.position,
                  connections: args.connectTo,
                  workflowId: args.workflowId,
                  updatedAt: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        log.error('Failed to create workflow node', {
          workflowId: args.workflowId,
          nodeType: args.nodeType,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new UserError(
          `Failed to create workflow node: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Workflow validation tool
  server.addTool({
    name: 'validate-workflow',
    description:
      'Validate workflow configuration and connections, providing development assistance and suggestions',
    parameters: WorkflowValidationSchema,
    annotations: {
      title: 'Validate Workflow',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    execute: async (args: z.infer<typeof WorkflowValidationSchema>, { log }: any) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized');
      }

      log.info('Validating workflow', {
        workflowId: args.workflowId,
        checks: {
          connections: args.checkConnections,
          nodeConfiguration: args.checkNodeConfiguration,
          credentials: args.checkCredentials,
        },
      });

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        const validationResults = {
          isValid: true,
          issues: [] as Array<{
            type: 'error' | 'warning' | 'suggestion';
            category: 'connection' | 'configuration' | 'credential' | 'performance';
            message: string;
            nodeId?: string;
            suggestion?: string;
          }>,
          suggestions: [] as Array<{
            type: 'improvement' | 'optimization' | 'best_practice';
            message: string;
            nodeId?: string;
            implementation?: string;
          }>,
        };

        // Validate connections
        if (args.checkConnections && workflow.nodes) {
          for (const node of workflow.nodes) {
            // Check if node has required connections
            const nodeConnections = workflow.connections[node.id];
            if (!nodeConnections && node.type !== 'n8n-nodes-base.manualTrigger') {
              validationResults.issues.push({
                type: 'warning',
                category: 'connection',
                message: `Node "${node.name}" has no connections`,
                nodeId: node.id,
                suggestion: 'Connect this node to other nodes in the workflow',
              });
            }
          }
        }

        // Validate node configuration
        if (args.checkNodeConfiguration && workflow.nodes) {
          for (const node of workflow.nodes) {
            // Check for disabled nodes
            if (node.disabled) {
              validationResults.issues.push({
                type: 'warning',
                category: 'configuration',
                message: `Node "${node.name}" is disabled`,
                nodeId: node.id,
                suggestion: 'Enable the node if it should be active in the workflow',
              });
            }

            // Check for empty parameters that might be required
            if (!node.parameters || Object.keys(node.parameters).length === 0) {
              validationResults.issues.push({
                type: 'warning',
                category: 'configuration',
                message: `Node "${node.name}" has no parameters configured`,
                nodeId: node.id,
                suggestion: 'Review node configuration to ensure all required parameters are set',
              });
            }
          }
        }

        // Generate improvement suggestions
        if (args.suggestImprovements && workflow.nodes) {
          // Suggest error handling
          const hasErrorHandling = workflow.nodes.some(
            node =>
              node.type === 'n8n-nodes-base.errorTrigger' ||
              (node.parameters && node.parameters.continueOnFail)
          );

          if (!hasErrorHandling) {
            validationResults.suggestions.push({
              type: 'best_practice',
              message: 'Consider adding error handling to make your workflow more robust',
              implementation:
                'Add an Error Trigger node or enable "Continue on Fail" for critical nodes',
            });
          }

          // Suggest using notes for documentation
          const nodesWithoutNotes = workflow.nodes.filter(node => !node.notes);
          if (nodesWithoutNotes.length > workflow.nodes.length / 2) {
            validationResults.suggestions.push({
              type: 'best_practice',
              message: 'Consider adding notes to your nodes for better documentation',
              implementation: 'Add descriptive notes to explain what each node does',
            });
          }
        }

        // Set overall validation status
        validationResults.isValid = !validationResults.issues.some(issue => issue.type === 'error');

        log.info('Workflow validation completed', {
          workflowId: args.workflowId,
          isValid: validationResults.isValid,
          issueCount: validationResults.issues.length,
          suggestionCount: validationResults.suggestions.length,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  workflowId: args.workflowId,
                  workflowName: workflow.name,
                  validation: validationResults,
                  validatedAt: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        log.error('Failed to validate workflow', {
          workflowId: args.workflowId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new UserError(
          `Failed to validate workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Expression evaluation tool
  server.addTool({
    name: 'evaluate-expression',
    description:
      'Evaluate n8n expressions in the context of a workflow for development and testing',
    parameters: ExpressionEvaluationSchema,
    annotations: {
      title: 'Evaluate Expression',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
    },
    execute: async (args: z.infer<typeof ExpressionEvaluationSchema>, { log }: any) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized');
      }

      log.info('Evaluating expression', {
        workflowId: args.workflowId,
        nodeId: args.nodeId,
        expressionLength: args.expression.length,
      });

      try {
        // Get workflow and node context
        const workflow = await client.getWorkflow(args.workflowId);
        const node = workflow.nodes?.find(n => n.id === args.nodeId);

        if (!node) {
          throw new UserError(`Node with ID ${args.nodeId} not found in workflow`);
        }

        // For now, return a structured response indicating the expression would be evaluated
        // In a full implementation, this would connect to n8n's expression evaluator
        const evaluationResult = {
          expression: args.expression,
          context: {
            workflowId: args.workflowId,
            workflowName: workflow.name,
            nodeId: args.nodeId,
            nodeName: node.name,
            nodeType: node.type,
          },
          // This would contain the actual evaluation result in a full implementation
          result: {
            status: 'simulated',
            message: 'Expression evaluation is simulated in development mode',
            parsedExpression: args.expression,
            availableVariables: await extractAvailableVariables(workflow, args.nodeId),
          },
          inputData: args.inputData,
          evaluatedAt: new Date().toISOString(),
        };

        log.info('Expression evaluation completed', {
          workflowId: args.workflowId,
          nodeId: args.nodeId,
          status: evaluationResult.result.status,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(evaluationResult, null, 2),
            },
          ],
        };
      } catch (error) {
        log.error('Failed to evaluate expression', {
          workflowId: args.workflowId,
          nodeId: args.nodeId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new UserError(
          `Failed to evaluate expression: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });
}
