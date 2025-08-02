import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';

// Zod schemas for AI configuration validation
const AINodeConfigSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  nodeId: z.string().min(1, 'Node ID is required'),
  config: z.record(z.any()),
});

const AIPromptTestSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  nodeId: z.string().min(1, 'Node ID is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  sampleData: z.record(z.any()).optional(),
});

const AIModelSelectionSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  nodeId: z.string().min(1, 'Node ID is required'),
  modelType: z.enum(['openai', 'anthropic', 'local', 'custom']),
  modelName: z.string().min(1, 'Model name is required'),
  parameters: z.record(z.any()).optional(),
});

const AIMemoryConfigSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  nodeId: z.string().min(1, 'Node ID is required'),
  memoryType: z.enum(['buffer', 'summary', 'conversation', 'vector']),
  maxTokens: z.number().min(1).max(100000).optional(),
  context: z.record(z.any()).optional(),
});

// Tool registration function for AI configuration tools
export function createAIConfigTools(getClient: () => N8nClient | null, server: any) {
  // List AI nodes in workflow
  server.addTool({
    name: 'list-ai-nodes',
    description: 'List all AI-enabled nodes in a specific workflow or across all workflows',
    parameters: z.object({
      workflowId: z.string().optional(),
    }),
    annotations: {
      title: 'List AI Nodes',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: { workflowId?: string }) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const aiNodeTypes = [
          'openai',
          'anthropic',
          'chatgpt',
          'gpt3',
          'gpt4',
          'claude',
          'mistral',
          'llama',
          'huggingface',
          'cohere',
          'ai-agent',
          'ai-memory',
          'ai-tool',
          'ai-chain',
          'langchain',
        ];

        if (args.workflowId) {
          // Get specific workflow and analyze its nodes
          const workflow = await client.getWorkflow(args.workflowId);
          const aiNodes =
            workflow.nodes?.filter(node =>
              aiNodeTypes.some(
                aiType =>
                  node.type?.toLowerCase().includes(aiType) ||
                  node.name?.toLowerCase().includes('ai') ||
                  node.parameters?.model !== undefined
              )
            ) || [];

          if (aiNodes.length === 0) {
            return `No AI nodes found in workflow "${workflow.name}" (${args.workflowId})`;
          }

          let result = `Found ${aiNodes.length} AI node(s) in workflow "${workflow.name}":\n\n`;
          aiNodes.forEach((node, index) => {
            result += `${index + 1}. **${node.name}** (${node.type})\n`;
            result += `   - Node ID: ${node.id}\n`;
            result += `   - Position: (${node.position?.[0] || 0}, ${node.position?.[1] || 0})\n`;
            if (node.parameters?.model) {
              result += `   - Model: ${node.parameters.model}\n`;
            }
            if (node.parameters?.temperature) {
              result += `   - Temperature: ${node.parameters.temperature}\n`;
            }
            result += '\n';
          });

          return result;
        } else {
          // List AI nodes across all workflows
          const workflows = await client.getWorkflows({ limit: 100 });
          let totalAINodes = 0;
          let result = 'AI nodes found across all workflows:\n\n';

          for (const workflow of workflows.data) {
            const aiNodes =
              workflow.nodes?.filter(node =>
                aiNodeTypes.some(
                  aiType =>
                    node.type?.toLowerCase().includes(aiType) ||
                    node.name?.toLowerCase().includes('ai') ||
                    node.parameters?.model !== undefined
                )
              ) || [];

            if (aiNodes.length > 0) {
              totalAINodes += aiNodes.length;
              result += `**${workflow.name}** (${workflow.id}): ${aiNodes.length} AI node(s)\n`;
              aiNodes.forEach(node => {
                result += `  - ${node.name} (${node.type})\n`;
              });
              result += '\n';
            }
          }

          if (totalAINodes === 0) {
            return 'No AI nodes found in any workflows.';
          }

          return `Total AI nodes found: ${totalAINodes}\n\n${result}`;
        }
      } catch (error: any) {
        throw new UserError(`Failed to list AI nodes: ${error.message}`);
      }
    },
  });

  // Get AI node configuration
  server.addTool({
    name: 'get-ai-node-config',
    description:
      'Get the configuration of a specific AI node including model settings, prompts, and parameters',
    parameters: z.object({
      workflowId: z.string().min(1, 'Workflow ID is required'),
      nodeId: z.string().min(1, 'Node ID is required'),
    }),
    annotations: {
      title: 'Get AI Node Configuration',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: { workflowId: string; nodeId: string }) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        const node = workflow.nodes?.find(n => n.id === args.nodeId);

        if (!node) {
          throw new UserError(
            `Node with ID "${args.nodeId}" not found in workflow "${args.workflowId}"`
          );
        }

        const config = {
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          position: node.position,
          parameters: node.parameters || {},
          credentials: node.credentials || {},
          typeVersion: node.typeVersion,
          disabled: node.disabled || false,
        };

        // Extract AI-specific configuration
        const aiConfig: any = {
          ...config,
          aiSpecific: {
            model: config.parameters.model || null,
            temperature: config.parameters.temperature || null,
            maxTokens: config.parameters.maxTokens || config.parameters.max_tokens || null,
            systemPrompt: config.parameters.systemPrompt || config.parameters.system_prompt || null,
            userPrompt: config.parameters.prompt || config.parameters.userPrompt || null,
            memory: config.parameters.memory || null,
            tools: config.parameters.tools || null,
            context: config.parameters.context || null,
          },
        };

        return (
          `AI Node Configuration for "${node.name}" (${node.type}):\n\n` +
          `**Basic Information:**\n` +
          `- Node ID: ${aiConfig.nodeId}\n` +
          `- Node Type: ${aiConfig.nodeType}\n` +
          `- Type Version: ${aiConfig.typeVersion}\n` +
          `- Disabled: ${aiConfig.disabled}\n` +
          `- Position: (${aiConfig.position?.[0] || 0}, ${aiConfig.position?.[1] || 0})\n\n` +
          `**AI-Specific Configuration:**\n` +
          `- Model: ${aiConfig.aiSpecific.model || 'Not configured'}\n` +
          `- Temperature: ${aiConfig.aiSpecific.temperature || 'Not set'}\n` +
          `- Max Tokens: ${aiConfig.aiSpecific.maxTokens || 'Not set'}\n` +
          `- System Prompt: ${aiConfig.aiSpecific.systemPrompt ? 'Configured' : 'Not set'}\n` +
          `- User Prompt: ${aiConfig.aiSpecific.userPrompt ? 'Configured' : 'Not set'}\n` +
          `- Memory: ${aiConfig.aiSpecific.memory || 'Not configured'}\n` +
          `- Tools: ${aiConfig.aiSpecific.tools ? 'Configured' : 'Not set'}\n` +
          `- Context: ${aiConfig.aiSpecific.context ? 'Configured' : 'Not set'}\n\n` +
          `**Full Parameters:**\n\`\`\`json\n${JSON.stringify(config.parameters, null, 2)}\n\`\`\`\n\n` +
          `**Credentials:**\n\`\`\`json\n${JSON.stringify(config.credentials, null, 2)}\n\`\`\``
        );
      } catch (error: any) {
        throw new UserError(`Failed to get AI node configuration: ${error.message}`);
      }
    },
  });

  // Update AI node configuration
  server.addTool({
    name: 'update-ai-node-config',
    description:
      'Update the configuration of an AI node including model settings, prompts, and parameters',
    parameters: AINodeConfigSchema,
    annotations: {
      title: 'Update AI Node Configuration',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof AINodeConfigSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        const nodeIndex = workflow.nodes?.findIndex(n => n.id === args.nodeId);

        if (nodeIndex === -1 || nodeIndex === undefined) {
          throw new UserError(
            `Node with ID "${args.nodeId}" not found in workflow "${args.workflowId}"`
          );
        }

        // Update the node configuration
        if (workflow.nodes) {
          workflow.nodes[nodeIndex].parameters = {
            ...workflow.nodes[nodeIndex].parameters,
            ...args.config,
          };
        }

        // Update the workflow
        await client.updateWorkflow(args.workflowId, {
          nodes: workflow.nodes as Array<Record<string, unknown>>,
          connections: workflow.connections,
        });

        return (
          `Successfully updated AI node configuration for "${workflow.nodes?.[nodeIndex]?.name}" in workflow "${workflow.name}".\n\n` +
          `Updated parameters:\n\`\`\`json\n${JSON.stringify(args.config, null, 2)}\n\`\`\``
        );
      } catch (error: any) {
        throw new UserError(`Failed to update AI node configuration: ${error.message}`);
      }
    },
  });

  // Test AI prompt with sample data
  server.addTool({
    name: 'test-ai-prompt',
    description:
      'Test an AI node prompt with sample data to validate functionality before execution',
    parameters: AIPromptTestSchema,
    annotations: {
      title: 'Test AI Prompt',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof AIPromptTestSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        const node = workflow.nodes?.find(n => n.id === args.nodeId);

        if (!node) {
          throw new UserError(
            `Node with ID "${args.nodeId}" not found in workflow "${args.workflowId}"`
          );
        }

        // Simulate prompt testing (in a real implementation, this would execute the node with test data)
        const testResult = {
          nodeId: args.nodeId,
          nodeName: node.name,
          nodeType: node.type,
          prompt: args.prompt,
          sampleData: args.sampleData || {},
          model: node.parameters?.model || 'Unknown',
          timestamp: new Date().toISOString(),
          // Simulated response (in real implementation, would be actual AI response)
          simulatedResponse: `[TEST MODE] This is a simulated response for prompt: "${args.prompt}". In a real implementation, this would execute the AI node with the provided sample data and return the actual AI response.`,
          status: 'test_completed',
          validationResults: {
            promptValid: args.prompt.length > 0,
            dataStructureValid: typeof args.sampleData === 'object',
            nodeConfigurationValid: !!node.parameters?.model,
          },
        };

        return (
          `AI Prompt Test Results:\n\n` +
          `**Node Information:**\n` +
          `- Node: ${testResult.nodeName} (${testResult.nodeType})\n` +
          `- Model: ${testResult.model}\n` +
          `- Test Time: ${testResult.timestamp}\n\n` +
          `**Test Input:**\n` +
          `- Prompt: "${testResult.prompt}"\n` +
          `- Sample Data: ${JSON.stringify(testResult.sampleData, null, 2)}\n\n` +
          `**Validation Results:**\n` +
          `- Prompt Valid: ${testResult.validationResults.promptValid ? '✅' : '❌'}\n` +
          `- Data Structure Valid: ${testResult.validationResults.dataStructureValid ? '✅' : '❌'}\n` +
          `- Node Configuration Valid: ${testResult.validationResults.nodeConfigurationValid ? '✅' : '❌'}\n\n` +
          `**Simulated Response:**\n${testResult.simulatedResponse}\n\n` +
          `**Note:** This is a test simulation. To execute the actual AI node, use the 'execute-workflow' tool.`
        );
      } catch (error: any) {
        throw new UserError(`Failed to test AI prompt: ${error.message}`);
      }
    },
  });

  // Configure AI model selection
  server.addTool({
    name: 'configure-ai-model',
    description: 'Configure AI model selection and parameters for an AI node',
    parameters: AIModelSelectionSchema,
    annotations: {
      title: 'Configure AI Model',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof AIModelSelectionSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        const nodeIndex = workflow.nodes?.findIndex(n => n.id === args.nodeId);

        if (nodeIndex === -1 || nodeIndex === undefined) {
          throw new UserError(
            `Node with ID "${args.nodeId}" not found in workflow "${args.workflowId}"`
          );
        }

        // Update model configuration
        const modelConfig = {
          model: args.modelName,
          modelType: args.modelType,
          ...args.parameters,
        };

        if (workflow.nodes) {
          workflow.nodes[nodeIndex].parameters = {
            ...workflow.nodes[nodeIndex].parameters,
            ...modelConfig,
          };
        }

        // Update the workflow
        await client.updateWorkflow(args.workflowId, {
          nodes: workflow.nodes as Array<Record<string, unknown>>,
          connections: workflow.connections,
        });

        return (
          `Successfully configured AI model for node "${workflow.nodes?.[nodeIndex]?.name}":\n\n` +
          `**Model Configuration:**\n` +
          `- Model Type: ${args.modelType}\n` +
          `- Model Name: ${args.modelName}\n` +
          `- Additional Parameters: ${JSON.stringify(args.parameters || {}, null, 2)}\n\n` +
          `The workflow has been updated and is ready for use with the new model configuration.`
        );
      } catch (error: any) {
        throw new UserError(`Failed to configure AI model: ${error.message}`);
      }
    },
  });

  // Configure AI memory and context
  server.addTool({
    name: 'configure-ai-memory',
    description: 'Configure AI memory, context, and $fromAI() functionality for an AI node',
    parameters: AIMemoryConfigSchema,
    annotations: {
      title: 'Configure AI Memory',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof AIMemoryConfigSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        const nodeIndex = workflow.nodes?.findIndex(n => n.id === args.nodeId);

        if (nodeIndex === -1 || nodeIndex === undefined) {
          throw new UserError(
            `Node with ID "${args.nodeId}" not found in workflow "${args.workflowId}"`
          );
        }

        // Configure memory settings
        const memoryConfig = {
          memory: {
            type: args.memoryType,
            maxTokens: args.maxTokens,
            context: args.context,
            fromAI: true, // Enable $fromAI() functionality
          },
        };

        if (workflow.nodes) {
          workflow.nodes[nodeIndex].parameters = {
            ...workflow.nodes[nodeIndex].parameters,
            ...memoryConfig,
          };
        }

        // Update the workflow
        await client.updateWorkflow(args.workflowId, {
          nodes: workflow.nodes as Array<Record<string, unknown>>,
          connections: workflow.connections,
        });

        return (
          `Successfully configured AI memory for node "${workflow.nodes?.[nodeIndex]?.name}":\n\n` +
          `**Memory Configuration:**\n` +
          `- Memory Type: ${args.memoryType}\n` +
          `- Max Tokens: ${args.maxTokens || 'Unlimited'}\n` +
          `- Context Enabled: ${args.context ? 'Yes' : 'No'}\n` +
          `- $fromAI() Function: Enabled\n\n` +
          `**Usage:**\n` +
          `- Use $fromAI() in expressions to access AI-generated data\n` +
          `- Memory will be maintained across workflow executions\n` +
          `- Context data: ${JSON.stringify(args.context || {}, null, 2)}`
        );
      } catch (error: any) {
        throw new UserError(`Failed to configure AI memory: ${error.message}`);
      }
    },
  });
}
