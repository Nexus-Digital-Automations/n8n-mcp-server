import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { N8nWorkflow } from '../types/n8n.js';

// Zod schemas for workflow analytics and intelligence
const WorkflowAnalysisSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  analysisType: z
    .enum(['complexity', 'performance', 'optimization', 'comprehensive'])
    .optional()
    .default('comprehensive'),
  includeRecommendations: z.boolean().optional().default(true),
  historicalData: z.boolean().optional().default(true),
});

const ComplexityMetricsSchema = z.object({
  workflowId: z.string().optional(),
  threshold: z.enum(['low', 'medium', 'high', 'all']).optional().default('all'),
  sortBy: z.enum(['complexity', 'nodes', 'connections', 'depth']).optional().default('complexity'),
});

const BottleneckAnalysisSchema = z.object({
  workflowId: z.string().optional(),
  timeframe: z.enum(['hour', 'day', 'week', 'month']).optional().default('week'),
  threshold: z.number().min(0).max(100).optional().default(80),
});

const OptimizationSuggestionsSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  focusAreas: z
    .array(z.enum(['performance', 'reliability', 'maintainability', 'cost', 'security']))
    .optional()
    .default(['performance', 'reliability']),
  priority: z.enum(['critical', 'high', 'medium', 'low', 'all']).optional().default('all'),
});

const WorkflowComparisonSchema = z.object({
  workflowIds: z.array(z.string()).min(2, 'At least 2 workflows required for comparison'),
  metrics: z
    .array(z.enum(['complexity', 'performance', 'reliability', 'cost', 'maintainability']))
    .optional()
    .default(['complexity', 'performance', 'reliability']),
});

// Tool registration function for workflow analytics and intelligence tools
export function createAnalyticsTools(getClient: () => N8nClient | null, server: any) {
  // Analyze workflow complexity and structure
  server.addTool({
    name: 'analyze-workflow-complexity',
    description:
      'Analyze workflow complexity, structure, and provide detailed metrics on maintainability and performance characteristics',
    parameters: WorkflowAnalysisSchema,
    annotations: {
      title: 'Analyze Workflow Complexity',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof WorkflowAnalysisSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);

        if (!workflow.nodes || workflow.nodes.length === 0) {
          return `Workflow "${workflow.name}" has no nodes to analyze.`;
        }

        // Calculate complexity metrics
        const metrics = {
          nodeCount: workflow.nodes.length,
          uniqueNodeTypes: [...new Set(workflow.nodes.map(node => node.type))].length,
          connections: Object.keys(workflow.connections || {}).length,
          maxDepth: 0,
          cyclomaticComplexity: 0,
          maintainabilityIndex: 0,
          cognitiveComplexity: 0,
        };

        // Calculate workflow depth (longest path)
        const calculateDepth = (
          nodeId: string,
          visited: Set<string>,
          currentDepth: number
        ): number => {
          if (visited.has(nodeId)) return currentDepth; // Cycle detection
          visited.add(nodeId);

          const _connections = workflow.connections?.[nodeId];
          if (!_connections || Object.keys(_connections).length === 0) {
            return currentDepth;
          }

          let maxChildDepth = currentDepth;
          Object.values(_connections).forEach((outputConnections: any) => {
            if (Array.isArray(outputConnections)) {
              outputConnections.forEach((conn: any) => {
                if (conn.node) {
                  const childDepth = calculateDepth(conn.node, new Set(visited), currentDepth + 1);
                  maxChildDepth = Math.max(maxChildDepth, childDepth);
                }
              });
            }
          });

          return maxChildDepth;
        };

        // Find starting nodes (nodes with no inputs)
        const allTargetNodes = new Set<string>();
        Object.values(workflow.connections || {}).forEach((nodeConnections: any) => {
          Object.values(nodeConnections).forEach((outputs: any) => {
            if (Array.isArray(outputs)) {
              outputs.forEach((conn: any) => {
                if (conn.node) allTargetNodes.add(conn.node);
              });
            }
          });
        });

        const startingNodes = workflow.nodes.filter(node => !allTargetNodes.has(node.id));

        // Calculate maximum depth
        startingNodes.forEach(node => {
          const depth = calculateDepth(node.id, new Set(), 1);
          metrics.maxDepth = Math.max(metrics.maxDepth, depth);
        });

        // Calculate cyclomatic complexity (simplified)
        metrics.cyclomaticComplexity = metrics.connections - metrics.nodeCount + 2;
        if (metrics.cyclomaticComplexity < 1) metrics.cyclomaticComplexity = 1;

        // Calculate cognitive complexity (based on node types and nesting)
        metrics.cognitiveComplexity = workflow.nodes.reduce((complexity, node) => {
          let nodeComplexity = 1; // Base complexity

          // Add complexity for different node types
          const nodeType = node.type.toLowerCase();
          if (
            nodeType.includes('if') ||
            nodeType.includes('switch') ||
            nodeType.includes('merge')
          ) {
            nodeComplexity += 2; // Conditional logic
          } else if (nodeType.includes('loop') || nodeType.includes('split')) {
            nodeComplexity += 3; // Iteration/branching
          } else if (nodeType.includes('code') || nodeType.includes('function')) {
            nodeComplexity += 1; // Custom logic
          }

          return complexity + nodeComplexity;
        }, 0);

        // Calculate maintainability index (0-100 scale)
        const averageNodeComplexity = metrics.cognitiveComplexity / metrics.nodeCount;
        const typeComplexity = metrics.uniqueNodeTypes / metrics.nodeCount;
        metrics.maintainabilityIndex = Math.max(
          0,
          Math.min(
            100,
            100 - averageNodeComplexity * 10 - typeComplexity * 20 - metrics.maxDepth * 5
          )
        );

        // Complexity classification
        const getComplexityLevel = (score: number): string => {
          if (score <= 5) return '🟢 Low';
          if (score <= 15) return '🟡 Medium';
          if (score <= 25) return '🟠 High';
          return '🔴 Very High';
        };

        let analysis = `# Workflow Complexity Analysis: "${workflow.name}"\n\n`;

        // Basic metrics
        analysis += `## 📊 Structure Metrics\n`;
        analysis += `- **Total Nodes**: ${metrics.nodeCount}\n`;
        analysis += `- **Unique Node Types**: ${metrics.uniqueNodeTypes}\n`;
        analysis += `- **Connections**: ${metrics.connections}\n`;
        analysis += `- **Maximum Depth**: ${metrics.maxDepth} levels\n`;
        analysis += `- **Starting Nodes**: ${startingNodes.length}\n\n`;

        // Complexity metrics
        analysis += `## 🧮 Complexity Metrics\n`;
        analysis += `- **Cyclomatic Complexity**: ${metrics.cyclomaticComplexity} ${getComplexityLevel(metrics.cyclomaticComplexity)}\n`;
        analysis += `- **Cognitive Complexity**: ${metrics.cognitiveComplexity} ${getComplexityLevel(metrics.cognitiveComplexity)}\n`;
        analysis += `- **Maintainability Index**: ${metrics.maintainabilityIndex.toFixed(1)}/100\n\n`;

        // Node type breakdown
        const nodeTypeDistribution = workflow.nodes.reduce(
          (dist, node) => {
            const type = node.type;
            dist[type] = (dist[type] || 0) + 1;
            return dist;
          },
          {} as Record<string, number>
        );

        analysis += `## 🔧 Node Type Distribution\n`;
        Object.entries(nodeTypeDistribution)
          .sort((a, b) => b[1] - a[1])
          .forEach(([type, count]) => {
            const percentage = ((count / metrics.nodeCount) * 100).toFixed(1);
            analysis += `- **${type}**: ${count} nodes (${percentage}%)\n`;
          });
        analysis += '\n';

        // Performance analysis
        if (args.historicalData) {
          try {
            const executions = await client.getExecutions({ limit: 50 });
            const workflowExecutions = executions.data.filter(
              exec => exec.workflowId === args.workflowId
            );

            if (workflowExecutions.length > 0) {
              const avgExecutionTime =
                workflowExecutions
                  .filter(exec => exec.stoppedAt)
                  .reduce((sum, exec) => {
                    const duration =
                      new Date(exec.stoppedAt!).getTime() - new Date(exec.startedAt).getTime();
                    return sum + duration;
                  }, 0) / workflowExecutions.length;

              const successRate =
                (workflowExecutions.filter(exec => exec.status === 'success').length /
                  workflowExecutions.length) *
                100;

              analysis += `## ⚡ Performance Metrics\n`;
              analysis += `- **Average Execution Time**: ${(avgExecutionTime / 1000).toFixed(2)}s\n`;
              analysis += `- **Success Rate**: ${successRate.toFixed(1)}%\n`;
              analysis += `- **Recent Executions**: ${workflowExecutions.length}\n\n`;
            }
          } catch (_error) {
            // Performance data not available
          }
        }

        // Analysis and recommendations
        if (args.includeRecommendations) {
          analysis += `## 💡 Analysis & Recommendations\n\n`;

          const recommendations = [];

          if (metrics.nodeCount > 50) {
            recommendations.push(
              '**Workflow Size**: Consider breaking this workflow into smaller, more manageable sub-workflows'
            );
          }

          if (metrics.maxDepth > 10) {
            recommendations.push(
              '**Workflow Depth**: High nesting level detected - consider flattening the workflow structure'
            );
          }

          if (metrics.cyclomaticComplexity > 15) {
            recommendations.push(
              '**Cyclomatic Complexity**: High complexity - consider simplifying conditional logic and branching'
            );
          }

          if (metrics.cognitiveComplexity > 25) {
            recommendations.push(
              '**Cognitive Complexity**: Workflow may be difficult to understand - consider adding documentation and simplifying logic'
            );
          }

          if (metrics.maintainabilityIndex < 60) {
            recommendations.push(
              '**Maintainability**: Low maintainability score - consider refactoring for better code organization'
            );
          }

          if (metrics.uniqueNodeTypes / metrics.nodeCount > 0.8) {
            recommendations.push(
              '**Node Diversity**: High variety of node types - ensure team familiarity with all node types used'
            );
          }

          // Performance-based recommendations
          const heavyNodeTypes = Object.entries(nodeTypeDistribution).filter(([type]) =>
            ['code', 'function', 'python', 'http-request', 'webhook'].some(heavy =>
              type.toLowerCase().includes(heavy)
            )
          );

          if (heavyNodeTypes.length > 0) {
            recommendations.push(
              '**Performance**: Resource-intensive nodes detected - monitor execution times and consider optimization'
            );
          }

          if (recommendations.length === 0) {
            recommendations.push(
              '**Overall**: Workflow structure appears well-organized with reasonable complexity levels'
            );
          }

          recommendations.forEach((rec, index) => {
            analysis += `${index + 1}. ${rec}\n`;
          });
          analysis += '\n';

          // Complexity score interpretation
          analysis += `## 📈 Complexity Score Interpretation\n`;
          analysis += `- **Low (1-5)**: Simple, easy to understand and maintain\n`;
          analysis += `- **Medium (6-15)**: Moderate complexity, requires some expertise\n`;
          analysis += `- **High (16-25)**: Complex, requires careful management and documentation\n`;
          analysis += `- **Very High (26+)**: Very complex, consider refactoring or breaking down\n\n`;

          analysis += `**Overall Assessment**: This workflow has a **${getComplexityLevel(metrics.cognitiveComplexity)}** complexity level.`;
        }

        return analysis;
      } catch (error: any) {
        throw new UserError(`Failed to analyze workflow complexity: ${error.message}`);
      }
    },
  });

  // Get complexity metrics for multiple workflows
  server.addTool({
    name: 'get-complexity-metrics',
    description:
      'Get complexity metrics for workflows, sorted by complexity level to identify the most complex workflows requiring attention',
    parameters: ComplexityMetricsSchema,
    annotations: {
      title: 'Get Complexity Metrics',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ComplexityMetricsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        let workflows: N8nWorkflow[] = [];

        if (args.workflowId) {
          const workflow = await client.getWorkflow(args.workflowId);
          workflows = [workflow];
        } else {
          const response = await client.getWorkflows({ limit: 50 });
          workflows = response.data;
        }

        const complexityData = workflows.map(workflow => {
          const nodeCount = workflow.nodes?.length || 0;
          const uniqueNodeTypes = workflow.nodes
            ? [...new Set(workflow.nodes.map(node => node.type))].length
            : 0;
          const _connections = Object.keys(workflow.connections || {}).length;

          // Calculate simplified complexity score
          const typeComplexity = nodeCount > 0 ? uniqueNodeTypes / nodeCount : 0;
          const _structuralComplexity = nodeCount + _connections;
          const cognitiveComplexity = (workflow.nodes || []).reduce((complexity, node) => {
            const nodeType = node.type.toLowerCase();
            let nodeComplexity = 1;

            if (
              nodeType.includes('if') ||
              nodeType.includes('switch') ||
              nodeType.includes('merge')
            ) {
              nodeComplexity += 2;
            } else if (nodeType.includes('loop') || nodeType.includes('split')) {
              nodeComplexity += 3;
            } else if (nodeType.includes('code') || nodeType.includes('function')) {
              nodeComplexity += 1;
            }

            return complexity + nodeComplexity;
          }, 0);

          const overallComplexity = cognitiveComplexity + typeComplexity * 10;

          return {
            id: workflow.id,
            name: workflow.name,
            active: workflow.active,
            nodeCount,
            uniqueNodeTypes,
            _connections,
            cognitiveComplexity,
            overallComplexity,
            complexityLevel:
              overallComplexity <= 5
                ? 'low'
                : overallComplexity <= 15
                  ? 'medium'
                  : overallComplexity <= 25
                    ? 'high'
                    : 'very-high',
          };
        });

        // Filter by threshold
        const filteredData =
          args.threshold === 'all'
            ? complexityData
            : complexityData.filter(item => {
                switch (args.threshold) {
                  case 'low':
                    return item.complexityLevel === 'low';
                  case 'medium':
                    return item.complexityLevel === 'medium';
                  case 'high':
                    return item.complexityLevel === 'high' || item.complexityLevel === 'very-high';
                  default:
                    return true;
                }
              });

        // Sort by selected criteria
        filteredData.sort((a, b) => {
          switch (args.sortBy) {
            case 'complexity':
              return b.overallComplexity - a.overallComplexity;
            case 'nodes':
              return b.nodeCount - a.nodeCount;
            case 'connections':
              return b._connections - a._connections;
            case 'depth':
              return b.cognitiveComplexity - a.cognitiveComplexity;
            default:
              return b.overallComplexity - a.overallComplexity;
          }
        });

        if (filteredData.length === 0) {
          return `No workflows found matching the complexity threshold: ${args.threshold}`;
        }

        let report = `# Workflow Complexity Metrics Report\n\n`;
        report += `**Analysis Date**: ${new Date().toLocaleString()}\n`;
        report += `**Workflows Analyzed**: ${filteredData.length}\n`;
        report += `**Sorted By**: ${args.sortBy}\n`;
        report += `**Complexity Filter**: ${args.threshold}\n\n`;

        // Summary statistics
        const avgComplexity =
          filteredData.reduce((sum, item) => sum + item.overallComplexity, 0) / filteredData.length;
        const avgNodes =
          filteredData.reduce((sum, item) => sum + item.nodeCount, 0) / filteredData.length;

        report += `## 📊 Summary Statistics\n`;
        report += `- **Average Complexity**: ${avgComplexity.toFixed(1)}\n`;
        report += `- **Average Node Count**: ${avgNodes.toFixed(1)}\n`;
        report += `- **Most Complex**: ${filteredData[0]?.name} (${filteredData[0]?.overallComplexity.toFixed(1)})\n`;
        report += `- **Least Complex**: ${filteredData[filteredData.length - 1]?.name} (${filteredData[filteredData.length - 1]?.overallComplexity.toFixed(1)})\n\n`;

        // Complexity distribution
        const distribution = filteredData.reduce(
          (dist, item) => {
            dist[item.complexityLevel] = (dist[item.complexityLevel] || 0) + 1;
            return dist;
          },
          {} as Record<string, number>
        );

        report += `## 📈 Complexity Distribution\n`;
        Object.entries(distribution).forEach(([level, count]) => {
          const percentage = ((count / filteredData.length) * 100).toFixed(1);
          const indicator =
            level === 'low' ? '🟢' : level === 'medium' ? '🟡' : level === 'high' ? '🟠' : '🔴';
          report += `- **${indicator} ${level.charAt(0).toUpperCase() + level.slice(1)}**: ${count} workflows (${percentage}%)\n`;
        });
        report += '\n';

        // Detailed workflow metrics table
        report += `## 📋 Detailed Metrics\n\n`;
        report += `| Workflow | Status | Nodes | Types | Connections | Complexity | Level |\n`;
        report += `|----------|--------|-------|-------|-------------|------------|-------|\n`;

        filteredData.slice(0, 20).forEach(item => {
          // Limit to top 20
          const statusIcon = item.active ? '🟢' : '🔴';
          const complexityIcon =
            item.complexityLevel === 'low'
              ? '🟢'
              : item.complexityLevel === 'medium'
                ? '🟡'
                : item.complexityLevel === 'high'
                  ? '🟠'
                  : '🔴';

          report += `| ${item.name} | ${statusIcon} | ${item.nodeCount} | ${item.uniqueNodeTypes} | ${item._connections} | ${item.overallComplexity.toFixed(1)} | ${complexityIcon} ${item.complexityLevel} |\n`;
        });

        if (filteredData.length > 20) {
          report += `\n*Showing top 20 workflows. Total: ${filteredData.length} workflows.*\n`;
        }

        report += '\n## 💡 Quick Actions\n';
        report += `- Use \`analyze-workflow-complexity\` for detailed analysis of specific workflows\n`;
        report += `- Use \`get-optimization-suggestions\` for improvement recommendations\n`;
        report += `- Use \`identify-bottlenecks\` to find performance issues\n`;

        return report;
      } catch (error: any) {
        throw new UserError(`Failed to get complexity metrics: ${error.message}`);
      }
    },
  });

  // Identify performance bottlenecks
  server.addTool({
    name: 'identify-bottlenecks',
    description:
      'Identify performance bottlenecks in workflows by analyzing execution patterns, slow nodes, and resource usage',
    parameters: BottleneckAnalysisSchema,
    annotations: {
      title: 'Identify Bottlenecks',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof BottleneckAnalysisSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        // Calculate timeframe
        const now = new Date();
        const timeframeDuration = {
          hour: 1 * 60 * 60 * 1000,
          day: 24 * 60 * 60 * 1000,
          week: 7 * 24 * 60 * 60 * 1000,
          month: 30 * 24 * 60 * 60 * 1000,
        };

        const startTime = new Date(now.getTime() - timeframeDuration[args.timeframe]);

        let workflows: N8nWorkflow[] = [];
        if (args.workflowId) {
          const workflow = await client.getWorkflow(args.workflowId);
          workflows = [workflow];
        } else {
          const response = await client.getWorkflows({ limit: 30 });
          workflows = response.data.filter(w => w.active); // Focus on active workflows
        }

        let report = `# Performance Bottleneck Analysis\n\n`;
        report += `**Analysis Period**: ${startTime.toLocaleString()} to ${now.toLocaleString()}\n`;
        report += `**Timeframe**: ${args.timeframe}\n`;
        report += `**Performance Threshold**: ${args.threshold}th percentile\n`;
        report += `**Workflows Analyzed**: ${workflows.length}\n\n`;

        const bottleneckData = [];

        for (const workflow of workflows) {
          try {
            // Get execution data
            const executions = await client.getExecutions({ limit: 100 });
            const workflowExecutions = executions.data.filter(
              exec => exec.workflowId === workflow.id && new Date(exec.startedAt) >= startTime
            );

            if (workflowExecutions.length === 0) continue;

            // Calculate execution metrics
            const executionTimes = workflowExecutions
              .filter(exec => exec.stoppedAt && exec.status === 'success')
              .map(
                exec => new Date(exec.stoppedAt!).getTime() - new Date(exec.startedAt).getTime()
              );

            if (executionTimes.length === 0) continue;

            const avgExecutionTime =
              executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
            const maxExecutionTime = Math.max(...executionTimes);
            const minExecutionTime = Math.min(...executionTimes);

            // Calculate percentile threshold
            const sortedTimes = executionTimes.sort((a, b) => a - b);
            const thresholdIndex = Math.floor((args.threshold / 100) * sortedTimes.length);
            const thresholdTime =
              sortedTimes[thresholdIndex] || sortedTimes[sortedTimes.length - 1];

            // Identify slow executions
            const slowExecutions = workflowExecutions.filter(exec => {
              if (!exec.stoppedAt) return false;
              const duration =
                new Date(exec.stoppedAt).getTime() - new Date(exec.startedAt).getTime();
              return duration >= thresholdTime;
            });

            // Calculate failure rate
            const failedExecutions = workflowExecutions.filter(exec => exec.status === 'error');
            const failureRate = (failedExecutions.length / workflowExecutions.length) * 100;

            // Analyze workflow structure for potential bottlenecks
            const structuralIssues = [];
            const nodeCount = workflow.nodes?.length || 0;

            if (nodeCount > 50) {
              structuralIssues.push('Large workflow size may impact performance');
            }

            const heavyNodes = (workflow.nodes || []).filter(node => {
              const nodeType = node.type.toLowerCase();
              return [
                'http-request',
                'webhook',
                'code',
                'function',
                'python',
                'mysql',
                'postgres',
              ].some(type => nodeType.includes(type));
            });

            if (heavyNodes.length > nodeCount * 0.3) {
              structuralIssues.push('High percentage of resource-intensive nodes');
            }

            // Identify potential node bottlenecks
            const problematicNodeTypes = (workflow.nodes || []).reduce(
              (types, node) => {
                const nodeType = node.type;
                types[nodeType] = (types[nodeType] || 0) + 1;
                return types;
              },
              {} as Record<string, number>
            );

            const nodeBottlenecks = Object.entries(problematicNodeTypes)
              .filter(([type, count]) => {
                const lowercaseType = type.toLowerCase();
                return (
                  (lowercaseType.includes('http') ||
                    lowercaseType.includes('webhook') ||
                    lowercaseType.includes('code') ||
                    lowercaseType.includes('function')) &&
                  count > 5
                );
              })
              .map(([type, count]) => `${count}x ${type} nodes`);

            bottleneckData.push({
              workflow,
              metrics: {
                executionCount: workflowExecutions.length,
                avgExecutionTime,
                maxExecutionTime,
                minExecutionTime,
                slowExecutions: slowExecutions.length,
                failureRate,
                thresholdTime,
              },
              issues: {
                structural: structuralIssues,
                nodeBottlenecks,
                heavyNodeCount: heavyNodes.length,
              },
            });
          } catch (_error) {
            // Skip workflows that can't be analyzed
            continue;
          }
        }

        // Sort by potential bottleneck severity
        bottleneckData.sort((a, b) => {
          const scoreA =
            a.metrics.avgExecutionTime / 1000 +
            a.metrics.failureRate * 100 +
            a.issues.heavyNodeCount * 10;
          const scoreB =
            b.metrics.avgExecutionTime / 1000 +
            b.metrics.failureRate * 100 +
            b.issues.heavyNodeCount * 10;
          return scoreB - scoreA;
        });

        if (bottleneckData.length === 0) {
          report += `No performance data available for the selected timeframe and workflows.\n`;
          report += `This could mean:\n`;
          report += `- No executions occurred in the specified timeframe\n`;
          report += `- Selected workflows are not active\n`;
          report += `- Execution data is not accessible\n`;
          return report;
        }

        // Summary statistics
        const totalExecutions = bottleneckData.reduce(
          (sum, data) => sum + data.metrics.executionCount,
          0
        );
        const avgFailureRate =
          bottleneckData.reduce((sum, data) => sum + data.metrics.failureRate, 0) /
          bottleneckData.length;
        const overallAvgTime =
          bottleneckData.reduce((sum, data) => sum + data.metrics.avgExecutionTime, 0) /
          bottleneckData.length;

        report += `## 📊 Performance Summary\n`;
        report += `- **Total Executions**: ${totalExecutions}\n`;
        report += `- **Average Execution Time**: ${(overallAvgTime / 1000).toFixed(2)}s\n`;
        report += `- **Average Failure Rate**: ${avgFailureRate.toFixed(2)}%\n`;
        report += `- **Workflows with Issues**: ${
          bottleneckData.filter(
            data =>
              data.metrics.avgExecutionTime > 30000 ||
              data.metrics.failureRate > 5 ||
              data.issues.structural.length > 0
          ).length
        }\n\n`;

        // Top bottlenecks
        report += `## 🚨 Performance Bottlenecks\n\n`;

        const topBottlenecks = bottleneckData.slice(0, 10);
        topBottlenecks.forEach((data, index) => {
          const severity =
            data.metrics.avgExecutionTime > 60000 || data.metrics.failureRate > 10
              ? '🔴 Critical'
              : data.metrics.avgExecutionTime > 30000 || data.metrics.failureRate > 5
                ? '🟠 High'
                : data.metrics.avgExecutionTime > 15000 || data.metrics.failureRate > 2
                  ? '🟡 Medium'
                  : '🟢 Low';

          report += `### ${index + 1}. ${data.workflow.name} (${severity})\n`;
          report += `**Performance Metrics:**\n`;
          report += `- Average Execution Time: ${(data.metrics.avgExecutionTime / 1000).toFixed(2)}s\n`;
          report += `- Max Execution Time: ${(data.metrics.maxExecutionTime / 1000).toFixed(2)}s\n`;
          report += `- Slow Executions (>${(data.metrics.thresholdTime / 1000).toFixed(1)}s): ${data.metrics.slowExecutions}/${data.metrics.executionCount}\n`;
          report += `- Failure Rate: ${data.metrics.failureRate.toFixed(2)}%\n`;

          if (data.issues.structural.length > 0 || data.issues.nodeBottlenecks.length > 0) {
            report += `**Identified Issues:**\n`;
            data.issues.structural.forEach(issue => {
              report += `- ⚠️ ${issue}\n`;
            });
            data.issues.nodeBottlenecks.forEach(bottleneck => {
              report += `- 🔧 ${bottleneck} may cause performance issues\n`;
            });
          }

          report += `**Recommendations:**\n`;
          const recommendations = [];

          if (data.metrics.avgExecutionTime > 30000) {
            recommendations.push(
              'Optimize long-running operations and consider workflow splitting'
            );
          }
          if (data.metrics.failureRate > 5) {
            recommendations.push('Investigate and improve error handling for reliability');
          }
          if (data.issues.heavyNodeCount > 5) {
            recommendations.push('Review resource-intensive nodes for optimization opportunities');
          }
          if (data.issues.structural.length > 0) {
            recommendations.push('Consider workflow restructuring for better performance');
          }
          if (recommendations.length === 0) {
            recommendations.push('Monitor performance trends for any degradation');
          }

          recommendations.forEach(rec => {
            report += `- 💡 ${rec}\n`;
          });
          report += '\n';
        });

        // Performance optimization tips
        report += `## 🔧 General Optimization Tips\n`;
        report += `1. **Node Optimization**: Minimize HTTP requests and external API calls\n`;
        report += `2. **Workflow Structure**: Break large workflows into smaller, manageable pieces\n`;
        report += `3. **Error Handling**: Implement proper error handling to reduce failure rates\n`;
        report += `4. **Resource Management**: Use efficient data processing patterns\n`;
        report += `5. **Monitoring**: Set up alerts for performance degradation\n\n`;

        report += `## 📈 Performance Tracking\n`;
        report += `- Use \`track-workflow-performance\` for detailed performance monitoring\n`;
        report += `- Use \`get-optimization-suggestions\` for specific improvement recommendations\n`;
        report += `- Use \`analyze-workflow-complexity\` to understand structural complexity\n`;

        return report;
      } catch (error: any) {
        throw new UserError(`Failed to identify bottlenecks: ${error.message}`);
      }
    },
  });

  // Get optimization suggestions
  server.addTool({
    name: 'get-optimization-suggestions',
    description:
      'Get specific optimization suggestions for workflows based on structure analysis, performance data, and best practices',
    parameters: OptimizationSuggestionsSchema,
    annotations: {
      title: 'Get Optimization Suggestions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof OptimizationSuggestionsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);

        if (!workflow.nodes || workflow.nodes.length === 0) {
          return `Workflow "${workflow.name}" has no nodes to optimize.`;
        }

        let suggestions = `# Optimization Suggestions: "${workflow.name}"\n\n`;
        suggestions += `**Analysis Date**: ${new Date().toLocaleString()}\n`;
        suggestions += `**Focus Areas**: ${args.focusAreas.join(', ')}\n`;
        suggestions += `**Priority Filter**: ${args.priority}\n\n`;

        const optimizations: Array<{
          category: string;
          priority: 'critical' | 'high' | 'medium' | 'low';
          title: string;
          description: string;
          impact: string;
          effort: string;
          implementation: string[];
        }> = [];

        // Analyze workflow structure
        const nodeCount = workflow.nodes.length;
        const nodeTypes = workflow.nodes.reduce(
          (types, node) => {
            types[node.type] = (types[node.type] || 0) + 1;
            return types;
          },
          {} as Record<string, number>
        );

        const _connections = Object.keys(workflow.connections || {}).length;

        // Performance optimizations
        if (args.focusAreas.includes('performance')) {
          // Check for HTTP request optimization
          const httpNodes = Object.entries(nodeTypes).filter(
            ([type]) =>
              type.toLowerCase().includes('http') || type.toLowerCase().includes('webhook')
          );

          if (httpNodes.length > 0) {
            const totalHttpNodes = httpNodes.reduce((sum, [, count]) => sum + count, 0);
            if (totalHttpNodes > 5) {
              optimizations.push({
                category: 'Performance',
                priority: 'high',
                title: 'Optimize HTTP Request Patterns',
                description: `Found ${totalHttpNodes} HTTP/webhook nodes. Multiple sequential HTTP requests can significantly impact performance.`,
                impact: 'High - Can reduce execution time by 30-70%',
                effort: 'Medium - Requires workflow restructuring',
                implementation: [
                  'Batch HTTP requests where possible',
                  'Implement parallel execution for independent requests',
                  'Add request caching for frequently accessed data',
                  'Use HTTP request node pooling settings',
                  'Consider using bulk API endpoints',
                ],
              });
            }
          }

          // Check for code node optimization
          const codeNodes = Object.entries(nodeTypes).filter(
            ([type]) =>
              type.toLowerCase().includes('code') || type.toLowerCase().includes('function')
          );

          if (codeNodes.length > 0) {
            optimizations.push({
              category: 'Performance',
              priority: 'medium',
              title: 'Code Node Performance Review',
              description:
                'Custom code nodes can be performance bottlenecks if not optimized properly.',
              impact: 'Medium - Can improve execution speed by 20-40%',
              effort: 'Low - Code review and optimization',
              implementation: [
                'Review custom code for inefficient loops or operations',
                'Minimize external library usage in code nodes',
                'Use built-in n8n nodes instead of custom code where possible',
                'Implement proper error handling in code nodes',
                'Consider moving complex logic to external services',
              ],
            });
          }

          // Check workflow size
          if (nodeCount > 30) {
            optimizations.push({
              category: 'Performance',
              priority: nodeCount > 50 ? 'critical' : 'high',
              title: 'Workflow Size Optimization',
              description: `Large workflow with ${nodeCount} nodes may have performance and maintainability issues.`,
              impact: 'High - Improves execution speed and reliability',
              effort: 'High - Requires workflow restructuring',
              implementation: [
                'Break workflow into smaller, focused sub-workflows',
                'Use workflow triggers to chain related processes',
                'Implement modular design patterns',
                'Consider using n8n sub-workflow nodes',
                'Document workflow dependencies and data flow',
              ],
            });
          }
        }

        // Reliability optimizations
        if (args.focusAreas.includes('reliability')) {
          // Check for error handling
          const errorHandlingNodes = workflow.nodes.filter(
            node =>
              node.parameters && JSON.stringify(node.parameters).toLowerCase().includes('error')
          );

          if (errorHandlingNodes.length < Math.ceil(nodeCount * 0.1)) {
            optimizations.push({
              category: 'Reliability',
              priority: 'high',
              title: 'Implement Comprehensive Error Handling',
              description:
                'Insufficient error handling detected. Robust error handling is crucial for workflow reliability.',
              impact: 'High - Significantly improves workflow reliability',
              effort: 'Medium - Add error handling nodes and logic',
              implementation: [
                'Add error handling nodes after critical operations',
                'Implement retry logic for transient failures',
                'Set up error notification workflows',
                'Use try-catch patterns in code nodes',
                'Configure proper timeout values for external requests',
              ],
            });
          }

          // Check for monitoring and logging
          const monitoringNodes = workflow.nodes.filter(
            node =>
              node.type.toLowerCase().includes('webhook') ||
              node.type.toLowerCase().includes('slack') ||
              node.type.toLowerCase().includes('email') ||
              node.type.toLowerCase().includes('log')
          );

          if (monitoringNodes.length === 0) {
            optimizations.push({
              category: 'Reliability',
              priority: 'medium',
              title: 'Add Monitoring and Alerting',
              description:
                'No monitoring or alerting nodes detected. Proper monitoring is essential for production workflows.',
              impact: 'Medium - Improves issue detection and resolution',
              effort: 'Low - Add monitoring nodes',
              implementation: [
                'Add Slack or email notification nodes for critical failures',
                'Implement health check endpoints',
                'Set up workflow execution logging',
                'Create dashboards for workflow performance monitoring',
                'Configure alerting thresholds',
              ],
            });
          }
        }

        // Maintainability optimizations
        if (args.focusAreas.includes('maintainability')) {
          // Check for documentation
          const documentedNodes = workflow.nodes.filter(
            node => node.notes && node.notes.trim().length > 0
          );
          const documentationRatio = documentedNodes.length / nodeCount;

          if (documentationRatio < 0.3) {
            optimizations.push({
              category: 'Maintainability',
              priority: 'medium',
              title: 'Improve Workflow Documentation',
              description: `Only ${(documentationRatio * 100).toFixed(1)}% of nodes have documentation. Good documentation is crucial for maintainability.`,
              impact: 'Medium - Improves team collaboration and maintenance',
              effort: 'Low - Add node descriptions and comments',
              implementation: [
                'Add descriptive notes to all complex nodes',
                'Document input/output data structures',
                'Create workflow overview documentation',
                'Use descriptive node names',
                'Document any special configuration requirements',
              ],
            });
          }

          // Check for node naming conventions
          const defaultNamedNodes = workflow.nodes.filter(
            node =>
              node.name === node.type ||
              (node.name.startsWith(node.type) && node.name.length < node.type.length + 5)
          );

          if (defaultNamedNodes.length > nodeCount * 0.5) {
            optimizations.push({
              category: 'Maintainability',
              priority: 'low',
              title: 'Improve Node Naming Conventions',
              description:
                'Many nodes are using default names, which makes the workflow harder to understand.',
              impact: 'Low - Improves workflow readability',
              effort: 'Low - Rename nodes with descriptive names',
              implementation: [
                'Use descriptive, business-focused node names',
                'Follow consistent naming conventions',
                'Include the purpose or data being processed in names',
                'Avoid technical jargon in node names',
                'Use action-oriented naming (e.g., "Send Welcome Email")',
              ],
            });
          }
        }

        // Cost optimizations
        if (args.focusAreas.includes('cost')) {
          // Check for inefficient operations
          const expensiveOperations = workflow.nodes.filter(node => {
            const type = node.type.toLowerCase();
            return (
              type.includes('http') ||
              type.includes('webhook') ||
              type.includes('ai') ||
              type.includes('openai') ||
              type.includes('anthropic')
            );
          });

          if (expensiveOperations.length > 0) {
            optimizations.push({
              category: 'Cost',
              priority: 'medium',
              title: 'Optimize External Service Usage',
              description: `Found ${expensiveOperations.length} nodes that may incur external costs. Optimization can reduce operational expenses.`,
              impact: 'Medium - Can reduce operational costs by 20-50%',
              effort: 'Medium - Requires optimization of external calls',
              implementation: [
                'Implement caching for frequently requested data',
                'Batch API requests to reduce call volume',
                'Use webhook endpoints instead of polling where possible',
                'Optimize AI prompts to reduce token usage',
                'Consider using less expensive alternative services',
              ],
            });
          }
        }

        // Security optimizations
        if (args.focusAreas.includes('security')) {
          // Check for credential usage
          const nodesWithCredentials = workflow.nodes.filter(
            node => node.credentials && Object.keys(node.credentials).length > 0
          );

          const credentialTypes = [
            ...new Set(nodesWithCredentials.flatMap(node => Object.keys(node.credentials || {}))),
          ];

          if (credentialTypes.length > 3) {
            optimizations.push({
              category: 'Security',
              priority: 'high',
              title: 'Consolidate and Review Credentials',
              description: `Workflow uses ${credentialTypes.length} different credential types. Review for security best practices.`,
              impact: 'High - Improves security posture',
              effort: 'Medium - Review and consolidate credentials',
              implementation: [
                'Audit all credential usage and permissions',
                'Use least-privilege principle for API access',
                'Regularly rotate credentials used in workflows',
                'Consider using service accounts instead of user credentials',
                'Implement credential usage monitoring',
              ],
            });
          }

          // Check for data handling
          const dataProcessingNodes = workflow.nodes.filter(node => {
            const type = node.type.toLowerCase();
            return (
              type.includes('set') ||
              type.includes('code') ||
              type.includes('function') ||
              type.includes('merge')
            );
          });

          if (dataProcessingNodes.length > 0) {
            optimizations.push({
              category: 'Security',
              priority: 'medium',
              title: 'Review Data Processing Security',
              description:
                'Workflow processes data through multiple nodes. Ensure sensitive data is handled securely.',
              impact: 'Medium - Improves data security compliance',
              effort: 'Medium - Review and secure data processing',
              implementation: [
                'Identify and classify sensitive data in the workflow',
                'Implement data encryption for sensitive information',
                'Add data validation and sanitization',
                'Review data retention and deletion policies',
                'Ensure compliance with data protection regulations',
              ],
            });
          }
        }

        // Filter by priority
        const filteredOptimizations =
          args.priority === 'all'
            ? optimizations
            : optimizations.filter(opt => opt.priority === args.priority);

        if (filteredOptimizations.length === 0) {
          suggestions += `No optimization suggestions found for the specified criteria.\n`;
          suggestions += `Try adjusting the focus areas or priority level to see more suggestions.`;
          return suggestions;
        }

        // Sort by priority
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        filteredOptimizations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        // Group by category
        const categorizedSuggestions = filteredOptimizations.reduce(
          (groups, opt) => {
            if (!groups[opt.category]) groups[opt.category] = [];
            groups[opt.category].push(opt);
            return groups;
          },
          {} as Record<string, typeof optimizations>
        );

        // Generate suggestions by category
        Object.entries(categorizedSuggestions).forEach(([category, categoryOptimizations]) => {
          suggestions += `## ${category} Optimizations\n\n`;

          categoryOptimizations.forEach((opt, index) => {
            const priorityIcon =
              opt.priority === 'critical'
                ? '🔴'
                : opt.priority === 'high'
                  ? '🟠'
                  : opt.priority === 'medium'
                    ? '🟡'
                    : '🟢';

            suggestions += `### ${index + 1}. ${opt.title} ${priorityIcon}\n`;
            suggestions += `**Priority**: ${opt.priority.charAt(0).toUpperCase() + opt.priority.slice(1)}\n`;
            suggestions += `**Description**: ${opt.description}\n`;
            suggestions += `**Expected Impact**: ${opt.impact}\n`;
            suggestions += `**Implementation Effort**: ${opt.effort}\n\n`;
            suggestions += `**Implementation Steps**:\n`;
            opt.implementation.forEach((step, stepIndex) => {
              suggestions += `${stepIndex + 1}. ${step}\n`;
            });
            suggestions += '\n';
          });
        });

        // Summary and next steps
        suggestions += `## 📋 Summary\n`;
        suggestions += `- **Total Suggestions**: ${filteredOptimizations.length}\n`;
        suggestions += `- **Critical Priority**: ${filteredOptimizations.filter(opt => opt.priority === 'critical').length}\n`;
        suggestions += `- **High Priority**: ${filteredOptimizations.filter(opt => opt.priority === 'high').length}\n`;
        suggestions += `- **Medium Priority**: ${filteredOptimizations.filter(opt => opt.priority === 'medium').length}\n`;
        suggestions += `- **Low Priority**: ${filteredOptimizations.filter(opt => opt.priority === 'low').length}\n\n`;

        suggestions += `## 🎯 Recommended Action Plan\n`;
        const criticalAndHigh = filteredOptimizations.filter(
          opt => opt.priority === 'critical' || opt.priority === 'high'
        );
        if (criticalAndHigh.length > 0) {
          suggestions += `1. **Immediate Action**: Address ${criticalAndHigh.length} critical/high priority optimization(s)\n`;
          suggestions += `2. **Short Term**: Plan implementation of medium priority optimizations\n`;
          suggestions += `3. **Long Term**: Consider low priority improvements during maintenance cycles\n`;
        } else {
          suggestions += `1. **Maintenance**: Implement medium and low priority optimizations during regular maintenance\n`;
          suggestions += `2. **Monitoring**: Set up performance monitoring to track optimization effectiveness\n`;
        }

        suggestions += `\n## 🔧 Additional Tools\n`;
        suggestions += `- Use \`identify-bottlenecks\` to find specific performance issues\n`;
        suggestions += `- Use \`analyze-workflow-complexity\` for detailed structure analysis\n`;
        suggestions += `- Use \`track-workflow-performance\` to monitor optimization results\n`;

        return suggestions;
      } catch (error: any) {
        throw new UserError(`Failed to get optimization suggestions: ${error.message}`);
      }
    },
  });

  // Compare workflows
  server.addTool({
    name: 'compare-workflows',
    description:
      'Compare multiple workflows across various metrics to identify patterns, best practices, and optimization opportunities',
    parameters: WorkflowComparisonSchema,
    annotations: {
      title: 'Compare Workflows',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof WorkflowComparisonSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflows: N8nWorkflow[] = [];
        const workflowData: Array<{
          workflow: N8nWorkflow;
          metrics: {
            complexity: number;
            nodeCount: number;
            connections: number;
            uniqueNodeTypes: number;
            maintainabilityIndex: number;
            performance?: {
              avgExecutionTime: number;
              successRate: number;
              executionCount: number;
            };
          };
        }> = [];

        // Fetch all workflows
        for (const workflowId of args.workflowIds) {
          try {
            const workflow = await client.getWorkflow(workflowId);
            workflows.push(workflow);
          } catch (_error) {
            throw new UserError(`Workflow with ID "${workflowId}" not found`);
          }
        }

        // Calculate metrics for each workflow
        for (const workflow of workflows) {
          const nodeCount = workflow.nodes?.length || 0;
          const uniqueNodeTypes = workflow.nodes
            ? [...new Set(workflow.nodes.map(node => node.type))].length
            : 0;
          const _connections = Object.keys(workflow.connections || {}).length;

          // Calculate complexity
          const cognitiveComplexity = (workflow.nodes || []).reduce((complexity, node) => {
            const nodeType = node.type.toLowerCase();
            let nodeComplexity = 1;

            if (
              nodeType.includes('if') ||
              nodeType.includes('switch') ||
              nodeType.includes('merge')
            ) {
              nodeComplexity += 2;
            } else if (nodeType.includes('loop') || nodeType.includes('split')) {
              nodeComplexity += 3;
            } else if (nodeType.includes('code') || nodeType.includes('function')) {
              nodeComplexity += 1;
            }

            return complexity + nodeComplexity;
          }, 0);

          // Calculate maintainability index
          const typeComplexity = nodeCount > 0 ? uniqueNodeTypes / nodeCount : 0;
          const avgNodeComplexity = nodeCount > 0 ? cognitiveComplexity / nodeCount : 0;
          const maintainabilityIndex = Math.max(
            0,
            Math.min(100, 100 - avgNodeComplexity * 10 - typeComplexity * 20 - _connections * 2)
          );

          let performanceMetrics;

          // Try to get performance data
          if (args.metrics.includes('performance')) {
            try {
              const executions = await client.getExecutions({ limit: 100 });
              const workflowExecutions = executions.data.filter(
                exec => exec.workflowId === workflow.id
              );

              if (workflowExecutions.length > 0) {
                const successfulExecutions = workflowExecutions.filter(
                  exec => exec.status === 'success' && exec.stoppedAt
                );
                const avgExecutionTime =
                  successfulExecutions.length > 0
                    ? successfulExecutions.reduce((sum, exec) => {
                        const duration =
                          new Date(exec.stoppedAt!).getTime() - new Date(exec.startedAt).getTime();
                        return sum + duration;
                      }, 0) / successfulExecutions.length
                    : 0;

                const successRate = (successfulExecutions.length / workflowExecutions.length) * 100;

                performanceMetrics = {
                  avgExecutionTime,
                  successRate,
                  executionCount: workflowExecutions.length,
                };
              }
            } catch (_error) {
              // Performance data not available
            }
          }

          workflowData.push({
            workflow,
            metrics: {
              complexity: cognitiveComplexity,
              nodeCount,
              connections: _connections,
              uniqueNodeTypes,
              maintainabilityIndex,
              performance: performanceMetrics,
            },
          });
        }

        let comparison = `# Workflow Comparison Report\n\n`;
        comparison += `**Comparison Date**: ${new Date().toLocaleString()}\n`;
        comparison += `**Workflows Compared**: ${workflows.length}\n`;
        comparison += `**Metrics Analyzed**: ${args.metrics.join(', ')}\n\n`;

        // Overview table
        comparison += `## 📊 Overview Comparison\n\n`;
        comparison += `| Workflow | Status | Nodes | Types | Connections | Complexity |\n`;
        comparison += `|----------|--------|-------|-------|-------------|------------|\n`;

        workflowData.forEach(data => {
          const statusIcon = data.workflow.active ? '🟢' : '🔴';
          comparison += `| ${data.workflow.name} | ${statusIcon} | ${data.metrics.nodeCount} | ${data.metrics.uniqueNodeTypes} | ${data.metrics.connections} | ${data.metrics.complexity} |\n`;
        });
        comparison += '\n';

        // Detailed metrics comparison
        if (args.metrics.includes('complexity')) {
          comparison += `## 🧮 Complexity Analysis\n\n`;

          const complexityStats = {
            avg:
              workflowData.reduce((sum, data) => sum + data.metrics.complexity, 0) /
              workflowData.length,
            min: Math.min(...workflowData.map(data => data.metrics.complexity)),
            max: Math.max(...workflowData.map(data => data.metrics.complexity)),
          };

          comparison += `**Complexity Statistics:**\n`;
          comparison += `- Average: ${complexityStats.avg.toFixed(1)}\n`;
          comparison += `- Range: ${complexityStats.min} - ${complexityStats.max}\n\n`;

          workflowData.forEach(data => {
            const complexityLevel =
              data.metrics.complexity <= 5
                ? '🟢 Low'
                : data.metrics.complexity <= 15
                  ? '🟡 Medium'
                  : data.metrics.complexity <= 25
                    ? '🟠 High'
                    : '🔴 Very High';

            comparison += `**${data.workflow.name}**: ${data.metrics.complexity} (${complexityLevel})\n`;
            comparison += `- Maintainability Index: ${data.metrics.maintainabilityIndex.toFixed(1)}/100\n`;
            comparison += `- Node Type Diversity: ${((data.metrics.uniqueNodeTypes / data.metrics.nodeCount) * 100).toFixed(1)}%\n\n`;
          });
        }

        if (
          args.metrics.includes('performance') &&
          workflowData.some(data => data.metrics.performance)
        ) {
          comparison += `## ⚡ Performance Comparison\n\n`;

          const performanceData = workflowData.filter(data => data.metrics.performance);

          if (performanceData.length > 0) {
            const avgExecutionTimes = performanceData.map(
              data => data.metrics.performance!.avgExecutionTime
            );
            const successRates = performanceData.map(data => data.metrics.performance!.successRate);

            comparison += `**Performance Statistics:**\n`;
            comparison += `- Average Execution Time: ${(avgExecutionTimes.reduce((a, b) => a + b, 0) / avgExecutionTimes.length / 1000).toFixed(2)}s\n`;
            comparison += `- Average Success Rate: ${(successRates.reduce((a, b) => a + b, 0) / successRates.length).toFixed(1)}%\n\n`;

            performanceData.forEach(data => {
              const perf = data.metrics.performance!;
              const perfRating =
                perf.avgExecutionTime < 5000 && perf.successRate > 95
                  ? '🟢 Excellent'
                  : perf.avgExecutionTime < 15000 && perf.successRate > 90
                    ? '🟡 Good'
                    : perf.avgExecutionTime < 30000 && perf.successRate > 80
                      ? '🟠 Fair'
                      : '🔴 Poor';

              comparison += `**${data.workflow.name}**: ${perfRating}\n`;
              comparison += `- Avg Execution Time: ${(perf.avgExecutionTime / 1000).toFixed(2)}s\n`;
              comparison += `- Success Rate: ${perf.successRate.toFixed(1)}%\n`;
              comparison += `- Executions Analyzed: ${perf.executionCount}\n\n`;
            });
          } else {
            comparison += `No performance data available for the selected workflows.\n\n`;
          }
        }

        if (args.metrics.includes('reliability')) {
          comparison += `## 🛡️ Reliability Analysis\n\n`;

          workflowData.forEach(data => {
            const errorHandling = (data.workflow.nodes || []).filter(
              node =>
                node.parameters && JSON.stringify(node.parameters).toLowerCase().includes('error')
            ).length;

            const monitoringNodes = (data.workflow.nodes || []).filter(
              node =>
                node.type.toLowerCase().includes('webhook') ||
                node.type.toLowerCase().includes('slack') ||
                node.type.toLowerCase().includes('email')
            ).length;

            const reliabilityScore =
              errorHandling * 20 +
              monitoringNodes * 15 +
              (data.metrics.performance?.successRate || 50);

            const reliabilityLevel =
              reliabilityScore >= 90
                ? '🟢 High'
                : reliabilityScore >= 70
                  ? '🟡 Medium'
                  : reliabilityScore >= 50
                    ? '🟠 Low'
                    : '🔴 Very Low';

            comparison += `**${data.workflow.name}**: ${reliabilityLevel} (${reliabilityScore.toFixed(0)}/100)\n`;
            comparison += `- Error Handling Nodes: ${errorHandling}\n`;
            comparison += `- Monitoring/Alerting Nodes: ${monitoringNodes}\n`;
            if (data.metrics.performance) {
              comparison += `- Success Rate: ${data.metrics.performance.successRate.toFixed(1)}%\n`;
            }
            comparison += '\n';
          });
        }

        if (args.metrics.includes('maintainability')) {
          comparison += `## 🔧 Maintainability Comparison\n\n`;

          workflowData.forEach(data => {
            const documentedNodes = (data.workflow.nodes || []).filter(
              node => node.notes && node.notes.trim().length > 0
            ).length;

            const documentationRatio =
              data.metrics.nodeCount > 0 ? (documentedNodes / data.metrics.nodeCount) * 100 : 0;

            const maintainabilityLevel =
              data.metrics.maintainabilityIndex >= 80
                ? '🟢 High'
                : data.metrics.maintainabilityIndex >= 60
                  ? '🟡 Medium'
                  : data.metrics.maintainabilityIndex >= 40
                    ? '🟠 Low'
                    : '🔴 Very Low';

            comparison += `**${data.workflow.name}**: ${maintainabilityLevel}\n`;
            comparison += `- Maintainability Index: ${data.metrics.maintainabilityIndex.toFixed(1)}/100\n`;
            comparison += `- Documentation Coverage: ${documentationRatio.toFixed(1)}%\n`;
            comparison += `- Node Type Diversity: ${data.metrics.uniqueNodeTypes}/${data.metrics.nodeCount}\n\n`;
          });
        }

        if (args.metrics.includes('cost')) {
          comparison += `## 💰 Cost Analysis\n\n`;

          workflowData.forEach(data => {
            const expensiveNodes = (data.workflow.nodes || []).filter(node => {
              const type = node.type.toLowerCase();
              return (
                type.includes('http') ||
                type.includes('webhook') ||
                type.includes('ai') ||
                type.includes('openai') ||
                type.includes('anthropic') ||
                type.includes('mysql') ||
                type.includes('postgres')
              );
            }).length;

            const costRisk = expensiveNodes / data.metrics.nodeCount;
            const costLevel =
              costRisk < 0.2
                ? '🟢 Low'
                : costRisk < 0.4
                  ? '🟡 Medium'
                  : costRisk < 0.6
                    ? '🟠 High'
                    : '🔴 Very High';

            comparison += `**${data.workflow.name}**: ${costLevel} Cost Risk\n`;
            comparison += `- External Service Nodes: ${expensiveNodes}/${data.metrics.nodeCount}\n`;
            comparison += `- Cost Risk Ratio: ${(costRisk * 100).toFixed(1)}%\n`;
            if (data.metrics.performance) {
              const estimatedMonthlyCost =
                expensiveNodes * data.metrics.performance.executionCount * 0.01 * 30;
              comparison += `- Estimated Monthly Cost: $${estimatedMonthlyCost.toFixed(2)}\n`;
            }
            comparison += '\n';
          });
        }

        // Best practices identification
        comparison += `## 🏆 Best Practices Identified\n\n`;

        const bestComplexity = workflowData.reduce((best, current) =>
          current.metrics.complexity < best.metrics.complexity ? current : best
        );

        const bestMaintainability = workflowData.reduce((best, current) =>
          current.metrics.maintainabilityIndex > best.metrics.maintainabilityIndex ? current : best
        );

        comparison += `**Lowest Complexity**: ${bestComplexity.workflow.name} (${bestComplexity.metrics.complexity})\n`;
        comparison += `**Highest Maintainability**: ${bestMaintainability.workflow.name} (${bestMaintainability.metrics.maintainabilityIndex.toFixed(1)}/100)\n`;

        if (workflowData.some(data => data.metrics.performance)) {
          const bestPerformance = workflowData
            .filter(data => data.metrics.performance)
            .reduce((best, current) =>
              current.metrics.performance!.successRate >
              (best.metrics.performance?.successRate || 0)
                ? current
                : best
            );

          comparison += `**Best Performance**: ${bestPerformance.workflow.name} (${bestPerformance.metrics.performance!.successRate.toFixed(1)}% success rate)\n`;
        }

        // Recommendations
        comparison += `\n## 💡 Recommendations\n\n`;

        const recommendations = [];

        const highComplexityWorkflows = workflowData.filter(data => data.metrics.complexity > 20);
        if (highComplexityWorkflows.length > 0) {
          recommendations.push(
            `**Complexity Reduction**: ${highComplexityWorkflows.map(d => d.workflow.name).join(', ')} have high complexity and should be reviewed for simplification`
          );
        }

        const lowMaintainabilityWorkflows = workflowData.filter(
          data => data.metrics.maintainabilityIndex < 60
        );
        if (lowMaintainabilityWorkflows.length > 0) {
          recommendations.push(
            `**Maintainability Improvement**: ${lowMaintainabilityWorkflows.map(d => d.workflow.name).join(', ')} need better documentation and structure`
          );
        }

        const poorPerformanceWorkflows = workflowData.filter(
          data =>
            data.metrics.performance &&
            (data.metrics.performance.successRate < 90 ||
              data.metrics.performance.avgExecutionTime > 30000)
        );
        if (poorPerformanceWorkflows.length > 0) {
          recommendations.push(
            `**Performance Optimization**: ${poorPerformanceWorkflows.map(d => d.workflow.name).join(', ')} need performance improvements`
          );
        }

        if (recommendations.length === 0) {
          recommendations.push(
            'All workflows appear to be well-structured and performing adequately'
          );
        }

        recommendations.forEach((rec, index) => {
          comparison += `${index + 1}. ${rec}\n`;
        });

        comparison += `\n## 🔧 Next Steps\n`;
        comparison += `- Use \`get-optimization-suggestions\` for specific improvement recommendations\n`;
        comparison += `- Use \`analyze-workflow-complexity\` for detailed analysis of individual workflows\n`;
        comparison += `- Use \`identify-bottlenecks\` to find specific performance issues\n`;

        return comparison;
      } catch (error: any) {
        throw new UserError(`Failed to compare workflows: ${error.message}`);
      }
    },
  });
}
