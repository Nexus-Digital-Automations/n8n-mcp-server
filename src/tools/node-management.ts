import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import {
  N8nCommunityPackage,
  N8nNodeTypeDescription,
  N8nWorkflow,
  N8nNode,
  ApiResponse,
  CommunityPackageInstallRequest,
  CommunityPackageUpdateRequest,
  NodeSearchResult,
  NodeUsageStats,
  NodeUpdateRequest,
  DynamicNodeOptions,
  AINodeClassification,
  AINodeSuggestion,
} from '../types/n8n.js';

// Validation Schemas
const PackageNameSchema = z.object({
  packageName: z.string().min(1, 'Package name is required'),
});

const InstallPackageSchema = z.object({
  name: z.string().min(1, 'Package name is required'),
  version: z.string().optional(),
});

const SearchNodesSchema = z.object({
  nodeType: z.string().optional(),
  workflowId: z.string().optional(),
  activeOnly: z.boolean().optional().default(false),
  limit: z.number().min(1).max(100).optional().default(50),
});

const NodeTypeSchema = z.object({
  nodeType: z.string().min(1, 'Node type is required'),
});

const UpdateNodeSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  nodeId: z.string().min(1, 'Node ID is required'),
  updates: z.object({
    name: z.string().optional(),
    parameters: z.record(z.unknown()).optional(),
    disabled: z.boolean().optional(),
    notes: z.string().optional(),
    position: z.tuple([z.number(), z.number()]).optional(),
  }),
});

const DynamicParametersSchema = z.object({
  property: z.string().min(1, 'Property name is required'),
  nodeType: z.string().min(1, 'Node type is required'),
  currentNodeParameters: z.record(z.unknown()).optional().default({}),
  credentials: z.record(z.unknown()).optional(),
  path: z.string().optional(),
  methodName: z.string().optional(),
  loadOptionsMethod: z.string().optional(),
});

// Helper Functions
function formatPackageList(packages: N8nCommunityPackage[]): string {
  if (packages.length === 0) {
    return 'No community packages installed.';
  }

  return packages
    .map(pkg => {
      const nodeCount = pkg.installedNodes?.length || 0;
      const status = pkg.failedLoading ? ' (⚠️ Failed Loading)' : '';
      return `• ${pkg.packageName}@${pkg.installedVersion}${status}\n  ${nodeCount} node(s) installed\n  Updated: ${new Date(pkg.updatedAt).toLocaleString()}`;
    })
    .join('\n\n');
}

function formatNodeTypeList(nodeTypes: N8nNodeTypeDescription[]): string {
  if (nodeTypes.length === 0) {
    return 'No node types found.';
  }

  return nodeTypes
    .map(node => {
      const groups = node.group.join(', ');
      const credentials = node.credentials?.length
        ? `\n  Credentials: ${node.credentials.map(c => c.name).join(', ')}`
        : '';
      return `• ${node.displayName} (${node.name})\n  Version: ${node.version}\n  Groups: ${groups}${credentials}\n  ${node.description}`;
    })
    .join('\n\n');
}

function formatSearchResults(results: NodeSearchResult[]): string {
  if (results.length === 0) {
    return 'No nodes found matching the search criteria.';
  }

  return results
    .map(result => {
      const status = result.isWorkflowActive ? '✅ Active' : '❌ Inactive';
      const disabled = result.node.disabled ? ' (Disabled)' : '';
      return `• ${result.node.name} (${result.node.type})${disabled}\n  Workflow: ${result.workflowName} (${result.workflowId})\n  Status: ${status}\n  Position: [${result.node.position.join(', ')}]`;
    })
    .join('\n\n');
}

function formatUsageStats(stats: NodeUsageStats[]): string {
  if (stats.length === 0) {
    return 'No usage statistics found.';
  }

  return stats
    .map(stat => {
      const lastUsed = stat.lastUsed
        ? `\n  Last Used: ${new Date(stat.lastUsed).toLocaleString()}`
        : '';
      return `• ${stat.nodeType}\n  Total Usage: ${stat.totalCount} times\n  Active Workflows: ${stat.activeWorkflowCount}${lastUsed}`;
    })
    .join('\n\n');
}

export function createNodeManagementTools(getClient: () => N8nClient | null, server: any) {
  // Community Package Management Tools
  server.addTool({
    name: 'list-community-packages',
    description: 'List all installed community packages and their node types',
    parameters: z.object({}),
    annotations: {
      title: 'List Community Packages',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async () => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const response = await client.getCommunityPackages();
        return formatPackageList(response.data);
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to list community packages: ${error.message}`);
        }
        throw new UserError('Failed to list community packages with unknown error');
      }
    },
  });

  server.addTool({
    name: 'install-community-package',
    description: 'Install a community package from npm registry',
    parameters: InstallPackageSchema,
    annotations: {
      title: 'Install Community Package',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof InstallPackageSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const packageData: CommunityPackageInstallRequest = {
          name: args.name,
          version: args.version,
        };

        const installedPackage = await client.installCommunityPackage(packageData);
        const nodeCount = installedPackage.installedNodes?.length || 0;

        return `✅ Successfully installed package: ${installedPackage.packageName}@${installedPackage.installedVersion}\n\nInstalled ${nodeCount} new node type(s):\n${installedPackage.installedNodes?.map(node => `• ${node.displayName} (${node.name})`).join('\n') || 'No nodes listed'}`;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('already installed')) {
            throw new UserError(
              `Package ${args.name} is already installed. Use update-community-package to update it.`
            );
          }
          throw new UserError(`Failed to install package: ${error.message}`);
        }
        throw new UserError('Failed to install package with unknown error');
      }
    },
  });

  server.addTool({
    name: 'update-community-package',
    description: 'Update an installed community package to a newer version',
    parameters: InstallPackageSchema,
    annotations: {
      title: 'Update Community Package',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof InstallPackageSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const packageData: CommunityPackageUpdateRequest = {
          name: args.name,
          version: args.version,
        };

        const updatedPackage = await client.updateCommunityPackage(args.name, packageData);
        const nodeCount = updatedPackage.installedNodes?.length || 0;

        return `✅ Successfully updated package: ${updatedPackage.packageName}@${updatedPackage.installedVersion}\n\nPackage contains ${nodeCount} node type(s):\n${updatedPackage.installedNodes?.map(node => `• ${node.displayName} (${node.name})`).join('\n') || 'No nodes listed'}`;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found') || error.message.includes('not installed')) {
            throw new UserError(
              `Package ${args.name} is not installed. Use install-community-package to install it first.`
            );
          }
          throw new UserError(`Failed to update package: ${error.message}`);
        }
        throw new UserError('Failed to update package with unknown error');
      }
    },
  });

  server.addTool({
    name: 'uninstall-community-package',
    description: 'Remove a community package and all its node types',
    parameters: PackageNameSchema,
    annotations: {
      title: 'Uninstall Community Package',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof PackageNameSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        await client.uninstallCommunityPackage(args.packageName);
        return `✅ Successfully uninstalled package: ${args.packageName}\n\n⚠️ Note: Any workflows using nodes from this package may no longer function correctly.`;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found') || error.message.includes('not installed')) {
            throw new UserError(`Package ${args.packageName} is not installed.`);
          }
          throw new UserError(`Failed to uninstall package: ${error.message}`);
        }
        throw new UserError('Failed to uninstall package with unknown error');
      }
    },
  });

  // Node Type Discovery Tools
  server.addTool({
    name: 'list-node-types',
    description: 'List all available node types (core and community)',
    parameters: z.object({
      communityOnly: z.boolean().optional().default(false),
      limit: z.number().min(1).max(500).optional().default(100),
    }),
    annotations: {
      title: 'List Node Types',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: { communityOnly?: boolean; limit?: number }) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const nodeTypes = args.communityOnly
          ? await client.getCommunityNodeTypes()
          : await client.getNodeTypes();

        const limitedResults = nodeTypes.slice(0, args.limit);
        const hasMore = nodeTypes.length > (args.limit || 100);

        let result = formatNodeTypeList(limitedResults);
        if (hasMore) {
          result += `\n\n... and ${nodeTypes.length - (args.limit || 100)} more node types. Use a higher limit to see more.`;
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to list node types: ${error.message}`);
        }
        throw new UserError('Failed to list node types with unknown error');
      }
    },
  });

  server.addTool({
    name: 'get-node-type-details',
    description:
      'Get detailed information about a specific node type including parameters and credentials',
    parameters: NodeTypeSchema,
    annotations: {
      title: 'Get Node Type Details',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof NodeTypeSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const nodeType = await client.getNodeType(args.nodeType);

        const credentials =
          nodeType.credentials
            ?.map(cred => `• ${cred.name}${cred.required ? ' (Required)' : ' (Optional)'}`)
            .join('\n') || 'None';

        const properties = nodeType.properties
          .slice(0, 10)
          .map(
            prop =>
              `• ${prop.displayName} (${prop.name}): ${prop.type}${prop.required ? ' *' : ''}\n  ${prop.description || 'No description'}`
          )
          .join('\n');

        const hasMoreProps = nodeType.properties.length > 10;

        return (
          `📋 Node Type: ${nodeType.displayName}\n\n` +
          `🔧 Technical Name: ${nodeType.name}\n` +
          `📦 Version: ${nodeType.version}\n` +
          `📁 Groups: ${nodeType.group.join(', ')}\n` +
          `📝 Description: ${nodeType.description}\n\n` +
          `🔐 Credentials:\n${credentials}\n\n` +
          `⚙️ Parameters${hasMoreProps ? ' (showing first 10)' : ''}:\n${properties}` +
          (hasMoreProps ? '\n\n... and more parameters available' : '') +
          (nodeType.documentationUrl ? `\n\n📖 Documentation: ${nodeType.documentationUrl}` : '')
        );
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            throw new UserError(
              `Node type '${args.nodeType}' not found. Check the name and try again.`
            );
          }
          throw new UserError(`Failed to get node type details: ${error.message}`);
        }
        throw new UserError('Failed to get node type details with unknown error');
      }
    },
  });

  // Workflow Node Analysis Tools
  server.addTool({
    name: 'search-workflow-nodes',
    description: 'Search for nodes across workflows by type, name, or workflow criteria',
    parameters: SearchNodesSchema,
    annotations: {
      title: 'Search Workflow Nodes',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof SearchNodesSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const results: NodeSearchResult[] = [];

        if (args.workflowId) {
          // Search within specific workflow
          const workflow = await client.getWorkflow(args.workflowId);
          const nodes = workflow.nodes || [];

          const filteredNodes = nodes.filter(
            node => !args.nodeType || node.type.includes(args.nodeType)
          );

          results.push(
            ...filteredNodes.map(node => ({
              workflowId: workflow.id,
              workflowName: workflow.name,
              node,
              isWorkflowActive: workflow.active,
            }))
          );
        } else {
          // Search across all workflows
          const workflowsResponse = await client.getWorkflows({ limit: args.limit });
          const workflows = workflowsResponse.data.filter(wf => !args.activeOnly || wf.active);

          for (const workflow of workflows) {
            const fullWorkflow = await client.getWorkflow(workflow.id);
            const nodes = fullWorkflow.nodes || [];

            const filteredNodes = nodes.filter(
              node => !args.nodeType || node.type.includes(args.nodeType)
            );

            results.push(
              ...filteredNodes.map(node => ({
                workflowId: workflow.id,
                workflowName: workflow.name,
                node,
                isWorkflowActive: workflow.active,
              }))
            );
          }
        }

        const limitedResults = results.slice(0, args.limit);
        return formatSearchResults(limitedResults);
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to search nodes: ${error.message}`);
        }
        throw new UserError('Failed to search nodes with unknown error');
      }
    },
  });

  server.addTool({
    name: 'analyze-node-usage',
    description: 'Analyze usage statistics for node types across all workflows',
    parameters: z.object({
      nodeType: z.string().optional(),
      includeInactive: z.boolean().optional().default(false),
    }),
    annotations: {
      title: 'Analyze Node Usage',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args: { nodeType?: string; includeInactive?: boolean }) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflowsResponse = await client.getWorkflows({ limit: 100 });
        const workflows = workflowsResponse.data;
        const usageMap: Record<string, NodeUsageStats> = {};

        for (const workflow of workflows) {
          if (!args.includeInactive && !workflow.active) continue;

          const fullWorkflow = await client.getWorkflow(workflow.id);
          const nodes = fullWorkflow.nodes || [];

          for (const node of nodes) {
            if (args.nodeType && !node.type.includes(args.nodeType)) continue;

            if (!usageMap[node.type]) {
              usageMap[node.type] = {
                nodeType: node.type,
                totalCount: 0,
                activeWorkflowCount: 0,
                workflowIds: [],
              };
            }

            usageMap[node.type].totalCount++;
            if (workflow.active) {
              usageMap[node.type].activeWorkflowCount++;
            }
            if (!usageMap[node.type].workflowIds.includes(workflow.id)) {
              usageMap[node.type].workflowIds.push(workflow.id);
            }
          }
        }

        const stats = Object.values(usageMap).sort((a, b) => b.totalCount - a.totalCount);
        return formatUsageStats(stats);
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to analyze node usage: ${error.message}`);
        }
        throw new UserError('Failed to analyze node usage with unknown error');
      }
    },
  });

  server.addTool({
    name: 'update-workflow-node',
    description: 'Update properties of a specific node within a workflow',
    parameters: UpdateNodeSchema,
    annotations: {
      title: 'Update Workflow Node',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof UpdateNodeSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);
        const nodes = workflow.nodes || [];

        const nodeIndex = nodes.findIndex(node => node.id === args.nodeId);
        if (nodeIndex === -1) {
          throw new UserError(
            `Node with ID '${args.nodeId}' not found in workflow '${args.workflowId}'`
          );
        }

        const originalNode = nodes[nodeIndex];
        const updatedNode = {
          ...originalNode,
          ...args.updates,
          id: originalNode.id, // Preserve original ID
          type: originalNode.type, // Preserve original type
        };

        nodes[nodeIndex] = updatedNode;

        await client.updateWorkflow(args.workflowId, {
          nodes: nodes as Array<Record<string, unknown>>,
        });

        const changes = Object.keys(args.updates)
          .map(
            key =>
              `• ${key}: ${JSON.stringify((originalNode as any)[key])} → ${JSON.stringify((args.updates as any)[key])}`
          )
          .join('\n');

        return `✅ Successfully updated node '${originalNode.name}' in workflow '${workflow.name}'\n\nChanges made:\n${changes}`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to update node: ${error.message}`);
        }
        throw new UserError('Failed to update node with unknown error');
      }
    },
  });

  // Dynamic Parameters and AI Tools
  server.addTool({
    name: 'get-dynamic-node-parameters',
    description: 'Get dynamic parameter options for a node type based on current configuration',
    parameters: DynamicParametersSchema,
    annotations: {
      title: 'Get Dynamic Node Parameters',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof DynamicParametersSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const options: DynamicNodeOptions = {
          property: args.property,
          currentNodeParameters: args.currentNodeParameters,
          credentials: args.credentials,
          path: args.path,
          methodName: args.methodName,
          loadOptionsMethod: args.loadOptionsMethod,
        };

        const parameters = await client.getDynamicNodeParameters(options);

        if (parameters.length === 0) {
          return `No dynamic parameters found for property '${args.property}' on node type '${args.nodeType}'`;
        }

        const formatted = parameters
          .map(
            param => `• ${param.displayName}: ${param.value}${param.type ? ` (${param.type})` : ''}`
          )
          .join('\n');

        return `🔧 Dynamic parameters for '${args.property}':\n\n${formatted}`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to get dynamic parameters: ${error.message}`);
        }
        throw new UserError('Failed to get dynamic parameters with unknown error');
      }
    },
  });

  server.addTool({
    name: 'classify-ai-node',
    description: 'Use AI to classify and analyze a node type for AI capabilities and integrations',
    parameters: NodeTypeSchema,
    annotations: {
      title: 'Classify AI Node',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof NodeTypeSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const classification = await client.classifyAINode(args.nodeType);

        const capabilities =
          classification.aiCapabilities.length > 0
            ? classification.aiCapabilities.map(cap => `• ${cap}`).join('\n')
            : 'None identified';

        const integrations =
          classification.suggestedIntegrations.length > 0
            ? classification.suggestedIntegrations.map(int => `• ${int}`).join('\n')
            : 'None suggested';

        return (
          `🤖 AI Classification for ${args.nodeType}\n\n` +
          `Is AI Node: ${classification.isAINode ? '✅ Yes' : '❌ No'}\n` +
          `Confidence Score: ${Math.round(classification.confidenceScore * 100)}%\n\n` +
          `🎯 AI Capabilities:\n${capabilities}\n\n` +
          `🔗 Suggested Integrations:\n${integrations}`
        );
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to classify AI node: ${error.message}`);
        }
        throw new UserError('Failed to classify AI node with unknown error');
      }
    },
  });

  server.addTool({
    name: 'get-ai-node-suggestions',
    description: 'Get AI-powered suggestions for optimizing or enhancing a node type',
    parameters: NodeTypeSchema,
    annotations: {
      title: 'Get AI Node Suggestions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof NodeTypeSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const suggestions = await client.getAINodeSuggestions(args.nodeType);

        if (suggestions.length === 0) {
          return `No AI suggestions available for node type '${args.nodeType}'`;
        }

        const formatted = suggestions
          .map((suggestion, index) => {
            const alternatives =
              suggestion.alternativeNodes.length > 0
                ? `\n  Alternative nodes: ${suggestion.alternativeNodes.join(', ')}`
                : '';

            return (
              `${index + 1}. ${suggestion.suggestion}\n` +
              `   Reasoning: ${suggestion.reasoning}\n` +
              `   Confidence: ${Math.round(suggestion.confidence * 100)}%${alternatives}`
            );
          })
          .join('\n\n');

        return `💡 AI Suggestions for ${args.nodeType}:\n\n${formatted}`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to get AI suggestions: ${error.message}`);
        }
        throw new UserError('Failed to get AI suggestions with unknown error');
      }
    },
  });
}
