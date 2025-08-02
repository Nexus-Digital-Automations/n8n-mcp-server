import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { N8nWorkflow } from '../types/n8n.js';

// Zod schemas for monitoring and configuration
const WorkflowSettingsSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  settings: z.record(z.any()),
});

const ErrorNotificationSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  enableNotifications: z.boolean(),
  notificationSettings: z
    .object({
      email: z.string().email().optional(),
      webhook: z.string().url().optional(),
      slack: z.string().optional(),
      retryAttempts: z.number().min(0).max(10).optional().default(3),
      notifyOnFailure: z.boolean().optional().default(true),
      notifyOnSuccess: z.boolean().optional().default(false),
    })
    .optional(),
});

const PerformanceTrackingSchema = z.object({
  workflowId: z.string().optional(),
  timeframe: z.enum(['hour', 'day', 'week', 'month']).optional().default('day'),
  includeMetrics: z
    .array(
      z.enum(['execution-time', 'success-rate', 'error-rate', 'node-performance', 'resource-usage'])
    )
    .optional()
    .default(['execution-time', 'success-rate', 'error-rate']),
});

const WorkflowHealthSchema = z.object({
  workflowId: z.string().optional(),
  checkType: z.enum(['basic', 'detailed', 'comprehensive']).optional().default('basic'),
  includeRecommendations: z.boolean().optional().default(true),
});

const AlertRuleSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  ruleName: z.string().min(1, 'Rule name is required'),
  condition: z.enum([
    'execution-time-exceeds',
    'error-rate-exceeds',
    'success-rate-below',
    'consecutive-failures',
  ]),
  threshold: z.number().min(0),
  action: z.enum(['email', 'webhook', 'disable-workflow', 'log-only']),
  actionConfig: z.record(z.any()).optional(),
});

// Tool registration function for advanced monitoring tools
export function createMonitoringTools(getClient: () => N8nClient | null, server: any) {
  // Configure workflow settings
  server.addTool({
    name: 'configure-workflow-settings',
    description:
      'Configure advanced workflow settings including timeouts, retries, error handling, and execution policies',
    parameters: WorkflowSettingsSchema,
    annotations: {
      title: 'Configure Workflow Settings',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof WorkflowSettingsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);

        // Merge new settings with existing settings
        const updatedSettings = {
          ...workflow.settings,
          ...args.settings,
        };

        // Update the workflow with new settings
        await client.updateWorkflow(args.workflowId, {
          settings: updatedSettings,
        });

        return (
          `Successfully updated workflow settings for "${workflow.name}":\n\n` +
          `**Applied Settings:**\n\`\`\`json\n${JSON.stringify(args.settings, null, 2)}\n\`\`\`\n\n` +
          `**Current Complete Settings:**\n\`\`\`json\n${JSON.stringify(updatedSettings, null, 2)}\n\`\`\`\n\n` +
          `**Common Setting Options:**\n` +
          `- \`timeout\`: Execution timeout in seconds\n` +
          `- \`retryOnFail\`: Number of retry attempts on failure\n` +
          `- \`maxExecutionTime\`: Maximum execution time limit\n` +
          `- \`saveExecutionProgress\`: Save intermediate execution data\n` +
          `- \`saveDataErrorExecution\`: Save data on error executions\n` +
          `- \`saveDataSuccessExecution\`: Save data on successful executions\n` +
          `- \`saveManualExecutions\`: Save manually triggered executions\n` +
          `- \`callerPolicy\`: Execution caller policy restrictions\n` +
          `- \`errorWorkflow\`: Workflow to run on error\n` +
          `- \`timezone\`: Timezone for scheduled executions`
        );
      } catch (error: any) {
        throw new UserError(`Failed to configure workflow settings: ${error.message}`);
      }
    },
  });

  // Setup error notifications
  server.addTool({
    name: 'setup-error-notifications',
    description:
      'Configure error notifications and alerting for workflow failures and performance issues',
    parameters: ErrorNotificationSchema,
    annotations: {
      title: 'Setup Error Notifications',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ErrorNotificationSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);

        // Configure notification settings
        const notificationConfig = {
          errorNotifications: args.enableNotifications,
          notificationSettings: args.notificationSettings || {},
          configuredAt: new Date().toISOString(),
        };

        // Update workflow settings with notification configuration
        const updatedSettings = {
          ...workflow.settings,
          notifications: notificationConfig,
        };

        await client.updateWorkflow(args.workflowId, {
          settings: updatedSettings,
        });

        return (
          `${args.enableNotifications ? '✅ Enabled' : '❌ Disabled'} error notifications for workflow "${workflow.name}":\n\n` +
          `**Notification Configuration:**\n` +
          `- Notifications Enabled: ${args.enableNotifications ? 'Yes' : 'No'}\n` +
          `- Retry Attempts: ${args.notificationSettings?.retryAttempts || 3}\n` +
          `- Notify on Failure: ${args.notificationSettings?.notifyOnFailure ? 'Yes' : 'No'}\n` +
          `- Notify on Success: ${args.notificationSettings?.notifyOnSuccess ? 'Yes' : 'No'}\n\n` +
          `**Notification Channels:**\n` +
          `- Email: ${args.notificationSettings?.email || 'Not configured'}\n` +
          `- Webhook: ${args.notificationSettings?.webhook || 'Not configured'}\n` +
          `- Slack: ${args.notificationSettings?.slack || 'Not configured'}\n\n` +
          `**Full Configuration:**\n\`\`\`json\n${JSON.stringify(notificationConfig, null, 2)}\n\`\`\`\n\n` +
          `**Note:** In a production environment, you would also need to configure the actual notification channels (email server, webhook endpoints, Slack integration) in your n8n instance settings.`
        );
      } catch (error: any) {
        throw new UserError(`Failed to setup error notifications: ${error.message}`);
      }
    },
  });

  // Performance tracking and metrics
  server.addTool({
    name: 'track-workflow-performance',
    description:
      'Track and analyze workflow performance metrics including execution times, success rates, and resource usage',
    parameters: PerformanceTrackingSchema,
    annotations: {
      title: 'Track Workflow Performance',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof PerformanceTrackingSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        // Calculate timeframe for analysis
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
          const response = await client.getWorkflows({ limit: 50 });
          workflows = response.data;
        }

        let performanceReport = `**Workflow Performance Report** (${args.timeframe})\n`;
        performanceReport += `**Analysis Period:** ${startTime.toLocaleString()} to ${now.toLocaleString()}\n\n`;

        for (const workflow of workflows) {
          // Get recent executions for the workflow
          const executions = await client.getExecutions({
            limit: 100,
          });

          // Filter executions by timeframe and workflow ID
          const recentExecutions = executions.data.filter(
            execution =>
              execution.workflowId === workflow.id && new Date(execution.startedAt) >= startTime
          );

          if (recentExecutions.length === 0 && args.workflowId) {
            return `No executions found for workflow "${workflow.name}" in the specified timeframe (${args.timeframe}).`;
          }

          if (recentExecutions.length === 0) {
            continue; // Skip workflows with no recent executions
          }

          const metrics = {
            totalExecutions: recentExecutions.length,
            successfulExecutions: recentExecutions.filter(e => e.status === 'success').length,
            failedExecutions: recentExecutions.filter(e => e.status === 'error').length,
            runningExecutions: recentExecutions.filter(e => e.status === 'running').length,
            averageExecutionTime: 0,
            minExecutionTime: 0,
            maxExecutionTime: 0,
            successRate: 0,
            errorRate: 0,
          };

          // Calculate execution times for completed executions
          const completedExecutions = recentExecutions.filter(
            e => e.status === 'success' || e.status === 'error'
          );

          if (completedExecutions.length > 0) {
            const executionTimes = completedExecutions
              .filter(e => e.stoppedAt)
              .map(e => new Date(e.stoppedAt!).getTime() - new Date(e.startedAt).getTime());

            if (executionTimes.length > 0) {
              metrics.averageExecutionTime =
                executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
              metrics.minExecutionTime = Math.min(...executionTimes);
              metrics.maxExecutionTime = Math.max(...executionTimes);
            }
          }

          metrics.successRate = (metrics.successfulExecutions / metrics.totalExecutions) * 100;
          metrics.errorRate = (metrics.failedExecutions / metrics.totalExecutions) * 100;

          performanceReport += `### ${workflow.name} (${workflow.id})\n`;
          performanceReport += `**Status:** ${workflow.active ? '🟢 Active' : '🔴 Inactive'}\n\n`;

          // Execution metrics
          if (args.includeMetrics.includes('execution-time')) {
            performanceReport += `**Execution Time Metrics:**\n`;
            performanceReport += `- Average: ${(metrics.averageExecutionTime / 1000).toFixed(2)}s\n`;
            performanceReport += `- Minimum: ${(metrics.minExecutionTime / 1000).toFixed(2)}s\n`;
            performanceReport += `- Maximum: ${(metrics.maxExecutionTime / 1000).toFixed(2)}s\n\n`;
          }

          // Success/Error rates
          if (
            args.includeMetrics.includes('success-rate') ||
            args.includeMetrics.includes('error-rate')
          ) {
            performanceReport += `**Execution Statistics:**\n`;
            performanceReport += `- Total Executions: ${metrics.totalExecutions}\n`;
            performanceReport += `- Successful: ${metrics.successfulExecutions} (${metrics.successRate.toFixed(1)}%)\n`;
            performanceReport += `- Failed: ${metrics.failedExecutions} (${metrics.errorRate.toFixed(1)}%)\n`;
            performanceReport += `- Running: ${metrics.runningExecutions}\n\n`;
          }

          // Performance assessment
          const performanceRating =
            metrics.successRate >= 95 && metrics.averageExecutionTime < 10000
              ? '🟢 Excellent'
              : metrics.successRate >= 90 && metrics.averageExecutionTime < 30000
                ? '🟡 Good'
                : metrics.successRate >= 80
                  ? '🟠 Fair'
                  : '🔴 Poor';

          performanceReport += `**Performance Rating:** ${performanceRating}\n`;

          // Recommendations
          const recommendations = [];
          if (metrics.errorRate > 10) {
            recommendations.push(
              'High error rate detected - review workflow logic and error handling'
            );
          }
          if (metrics.averageExecutionTime > 30000) {
            recommendations.push(
              'Long execution times - consider optimizing slow nodes or breaking into smaller workflows'
            );
          }
          if (metrics.successRate < 90) {
            recommendations.push('Low success rate - investigate common failure patterns');
          }
          if (recommendations.length === 0) {
            recommendations.push('Workflow is performing well - no immediate optimizations needed');
          }

          performanceReport += `**Recommendations:**\n`;
          recommendations.forEach(rec => {
            performanceReport += `- ${rec}\n`;
          });
          performanceReport += '\n';
        }

        if (workflows.length === 0 || performanceReport.split('###').length <= 1) {
          return `No workflows with recent executions found in the specified timeframe (${args.timeframe}).`;
        }

        return performanceReport;
      } catch (error: any) {
        throw new UserError(`Failed to track workflow performance: ${error.message}`);
      }
    },
  });

  // Workflow health check
  server.addTool({
    name: 'check-workflow-health',
    description:
      'Perform comprehensive health checks on workflows including configuration validation, dependency analysis, and optimization recommendations',
    parameters: WorkflowHealthSchema,
    annotations: {
      title: 'Check Workflow Health',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof WorkflowHealthSchema>) => {
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
          const response = await client.getWorkflows({ limit: 20 });
          workflows = response.data;
        }

        let healthReport = `**Workflow Health Check Report**\n`;
        healthReport += `**Check Type:** ${args.checkType}\n`;
        healthReport += `**Generated:** ${new Date().toLocaleString()}\n\n`;

        for (const workflow of workflows) {
          const healthScore = {
            configuration: 100,
            security: 100,
            performance: 100,
            reliability: 100,
            maintainability: 100,
            overall: 100,
          };

          const issues = [];
          const warnings = [];
          const recommendations = [];

          // Basic health checks
          if (!workflow.nodes || workflow.nodes.length === 0) {
            issues.push('Workflow has no nodes');
            healthScore.configuration -= 50;
          }

          if (!workflow.active) {
            warnings.push('Workflow is inactive');
            healthScore.reliability -= 10;
          }

          // Node analysis
          if (workflow.nodes && workflow.nodes.length > 0) {
            const nodeTypes = workflow.nodes.map(node => node.type);
            const uniqueNodeTypes = [...new Set(nodeTypes)];

            // Check for common issues
            if (workflow.nodes.length > 50) {
              warnings.push(
                'Workflow has many nodes (>50) - consider breaking into smaller workflows'
              );
              healthScore.maintainability -= 20;
            }

            // Check for missing credentials
            const nodesWithCredentials = workflow.nodes.filter(
              node => node.credentials && Object.keys(node.credentials).length > 0
            );

            if (
              nodesWithCredentials.length === 0 &&
              uniqueNodeTypes.some(type =>
                ['http-request', 'gmail', 'slack', 'webhook'].some(cred =>
                  type.toLowerCase().includes(cred)
                )
              )
            ) {
              issues.push(
                'Nodes that typically require credentials found without credential configuration'
              );
              healthScore.security -= 30;
            }

            // Performance analysis
            if (args.checkType === 'detailed' || args.checkType === 'comprehensive') {
              const heavyNodes = workflow.nodes.filter(node =>
                ['code', 'function', 'python', 'loop', 'merge'].some(heavy =>
                  node.type.toLowerCase().includes(heavy)
                )
              );

              if (heavyNodes.length > workflow.nodes.length * 0.3) {
                warnings.push('High percentage of resource-intensive nodes detected');
                healthScore.performance -= 15;
              }
            }

            // Comprehensive analysis
            if (args.checkType === 'comprehensive') {
              // Check for error handling
              const errorHandlingNodes = workflow.nodes.filter(
                node => node.parameters && JSON.stringify(node.parameters).includes('error')
              );

              if (errorHandlingNodes.length === 0) {
                recommendations.push('Consider adding error handling nodes for better reliability');
                healthScore.reliability -= 10;
              }

              // Check for testing/debugging features
              const debugNodes = workflow.nodes.filter(node =>
                ['sticky-note', 'no-op', 'set'].includes(node.type.toLowerCase())
              );

              if (debugNodes.length === 0 && workflow.nodes.length > 5) {
                recommendations.push(
                  'Consider adding debugging/documentation nodes for better maintainability'
                );
                healthScore.maintainability -= 5;
              }
            }
          }

          // Calculate overall health score
          healthScore.overall = Math.round(
            (healthScore.configuration +
              healthScore.security +
              healthScore.performance +
              healthScore.reliability +
              healthScore.maintainability) /
              5
          );

          // Health rating
          const healthRating =
            healthScore.overall >= 90
              ? '🟢 Excellent'
              : healthScore.overall >= 80
                ? '🟡 Good'
                : healthScore.overall >= 70
                  ? '🟠 Fair'
                  : healthScore.overall >= 60
                    ? '🔴 Poor'
                    : '🚨 Critical';

          healthReport += `### ${workflow.name} (${workflow.id})\n`;
          healthReport += `**Overall Health:** ${healthRating} (${healthScore.overall}/100)\n\n`;

          if (args.checkType === 'detailed' || args.checkType === 'comprehensive') {
            healthReport += `**Detailed Scores:**\n`;
            healthReport += `- Configuration: ${healthScore.configuration}/100\n`;
            healthReport += `- Security: ${healthScore.security}/100\n`;
            healthReport += `- Performance: ${healthScore.performance}/100\n`;
            healthReport += `- Reliability: ${healthScore.reliability}/100\n`;
            healthReport += `- Maintainability: ${healthScore.maintainability}/100\n\n`;
          }

          if (issues.length > 0) {
            healthReport += `**❌ Issues (${issues.length}):**\n`;
            issues.forEach(issue => {
              healthReport += `- ${issue}\n`;
            });
            healthReport += '\n';
          }

          if (warnings.length > 0) {
            healthReport += `**⚠️ Warnings (${warnings.length}):**\n`;
            warnings.forEach(warning => {
              healthReport += `- ${warning}\n`;
            });
            healthReport += '\n';
          }

          if (args.includeRecommendations && recommendations.length > 0) {
            healthReport += `**💡 Recommendations (${recommendations.length}):**\n`;
            recommendations.forEach(rec => {
              healthReport += `- ${rec}\n`;
            });
            healthReport += '\n';
          }

          // Basic workflow info
          healthReport += `**Workflow Details:**\n`;
          healthReport += `- Status: ${workflow.active ? '🟢 Active' : '🔴 Inactive'}\n`;
          healthReport += `- Nodes: ${workflow.nodes?.length || 0}\n`;
          healthReport += `- Tags: ${workflow.tags?.join(', ') || 'None'}\n`;
          if (workflow.updatedAt) {
            healthReport += `- Last Modified: ${new Date(workflow.updatedAt).toLocaleString()}\n`;
          }
          healthReport += '\n';
        }

        return healthReport;
      } catch (error: any) {
        throw new UserError(`Failed to check workflow health: ${error.message}`);
      }
    },
  });

  // Create alert rules
  server.addTool({
    name: 'create-alert-rule',
    description:
      'Create custom alert rules for workflow monitoring based on performance thresholds and conditions',
    parameters: AlertRuleSchema,
    annotations: {
      title: 'Create Alert Rule',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof AlertRuleSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const workflow = await client.getWorkflow(args.workflowId);

        // Create alert rule configuration
        const alertRule = {
          id: `alert_${Date.now()}`,
          name: args.ruleName,
          condition: args.condition,
          threshold: args.threshold,
          action: args.action,
          actionConfig: args.actionConfig || {},
          enabled: true,
          createdAt: new Date().toISOString(),
        };

        // Get existing alert rules or initialize empty array
        const currentSettings = workflow.settings || {};
        const existingAlerts = Array.isArray(currentSettings.alertRules)
          ? currentSettings.alertRules
          : [];

        // Add new alert rule
        const updatedAlerts = [...existingAlerts, alertRule];

        // Update workflow settings with new alert rules
        await client.updateWorkflow(args.workflowId, {
          settings: {
            ...currentSettings,
            alertRules: updatedAlerts,
          },
        });

        // Generate threshold description
        const thresholdDescription = {
          'execution-time-exceeds': `execution time exceeds ${args.threshold} seconds`,
          'error-rate-exceeds': `error rate exceeds ${args.threshold}%`,
          'success-rate-below': `success rate falls below ${args.threshold}%`,
          'consecutive-failures': `${args.threshold} consecutive failures occur`,
        };

        const actionDescription = {
          email: 'send email notification',
          webhook: 'trigger webhook',
          'disable-workflow': 'automatically disable workflow',
          'log-only': 'log to system logs only',
        };

        return (
          `✅ Successfully created alert rule "${args.ruleName}" for workflow "${workflow.name}":\n\n` +
          `**Alert Rule Configuration:**\n` +
          `- Rule ID: ${alertRule.id}\n` +
          `- Condition: When ${thresholdDescription[args.condition]}\n` +
          `- Action: ${actionDescription[args.action]}\n` +
          `- Status: ✅ Enabled\n\n` +
          `**Action Configuration:**\n\`\`\`json\n${JSON.stringify(args.actionConfig || {}, null, 2)}\n\`\`\`\n\n` +
          `**Total Alert Rules:** ${updatedAlerts.length}\n\n` +
          `**Note:** Alert rules are stored in workflow settings. In a production environment, you would implement monitoring services to actively check these conditions and trigger the specified actions.`
        );
      } catch (error: any) {
        throw new UserError(`Failed to create alert rule: ${error.message}`);
      }
    },
  });

  // Get monitoring dashboard
  server.addTool({
    name: 'get-monitoring-dashboard',
    description:
      'Get a comprehensive monitoring dashboard with real-time status of workflows, alerts, and system health',
    parameters: z.object({
      includeInactive: z.boolean().optional().default(false),
      timeframe: z.enum(['hour', 'day', 'week']).optional().default('day'),
    }),
    annotations: {
      title: 'Get Monitoring Dashboard',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: { includeInactive?: boolean; timeframe?: string }) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        // Get all workflows
        const workflowsResponse = await client.getWorkflows({ limit: 100 });
        const allWorkflows = workflowsResponse.data;

        const workflows = args.includeInactive ? allWorkflows : allWorkflows.filter(w => w.active);

        // Get recent executions for all workflows
        const now = new Date();
        const timeframeDuration = {
          hour: 1 * 60 * 60 * 1000,
          day: 24 * 60 * 60 * 1000,
          week: 7 * 24 * 60 * 60 * 1000,
        };

        const startTime = new Date(
          now.getTime() - timeframeDuration[args.timeframe as keyof typeof timeframeDuration]
        );

        let dashboard = `# 📊 n8n Monitoring Dashboard\n\n`;
        dashboard += `**Generated:** ${now.toLocaleString()}\n`;
        dashboard += `**Timeframe:** Last ${args.timeframe}\n`;
        dashboard += `**Update Frequency:** Real-time\n\n`;

        // System overview
        dashboard += `## 🖥️ System Overview\n\n`;
        dashboard += `| Metric | Value |\n`;
        dashboard += `|--------|-------|\n`;
        dashboard += `| Total Workflows | ${allWorkflows.length} |\n`;
        dashboard += `| Active Workflows | ${allWorkflows.filter(w => w.active).length} |\n`;
        dashboard += `| Inactive Workflows | ${allWorkflows.filter(w => !w.active).length} |\n`;

        // Workflow status summary
        let totalExecutions = 0;
        let totalSuccessful = 0;
        let totalFailed = 0;
        let totalRunning = 0;
        const workflowStatuses = [];

        for (const workflow of workflows.slice(0, 10)) {
          // Limit to 10 workflows for dashboard
          try {
            const executions = await client.getExecutions({
              limit: 50,
            });

            const recentExecutions = executions.data.filter(
              execution =>
                execution.workflowId === workflow.id && new Date(execution.startedAt) >= startTime
            );

            const successful = recentExecutions.filter(e => e.status === 'success').length;
            const failed = recentExecutions.filter(e => e.status === 'error').length;
            const running = recentExecutions.filter(e => e.status === 'running').length;

            totalExecutions += recentExecutions.length;
            totalSuccessful += successful;
            totalFailed += failed;
            totalRunning += running;

            const successRate =
              recentExecutions.length > 0 ? (successful / recentExecutions.length) * 100 : 0;

            const status =
              successRate >= 95 ? '🟢' : successRate >= 90 ? '🟡' : successRate >= 70 ? '🟠' : '🔴';

            workflowStatuses.push({
              name: workflow.name,
              status,
              executions: recentExecutions.length,
              successRate: successRate.toFixed(1),
              running,
            });
          } catch (_error) {
            // Skip workflows that can't be analyzed
            continue;
          }
        }

        // Add execution summary to system overview
        const systemSuccessRate =
          totalExecutions > 0 ? (totalSuccessful / totalExecutions) * 100 : 0;

        dashboard += `| Total Executions (${args.timeframe}) | ${totalExecutions} |\n`;
        dashboard += `| Successful Executions | ${totalSuccessful} (${systemSuccessRate.toFixed(1)}%) |\n`;
        dashboard += `| Failed Executions | ${totalFailed} |\n`;
        dashboard += `| Running Executions | ${totalRunning} |\n`;
        dashboard += `| System Health | ${systemSuccessRate >= 95 ? '🟢 Excellent' : systemSuccessRate >= 90 ? '🟡 Good' : systemSuccessRate >= 70 ? '🟠 Fair' : '🔴 Poor'} |\n\n`;

        // Workflow status table
        if (workflowStatuses.length > 0) {
          dashboard += `## 📋 Workflow Status\n\n`;
          dashboard += `| Workflow | Status | Executions | Success Rate | Running |\n`;
          dashboard += `|----------|--------|------------|--------------|----------|\n`;

          workflowStatuses.forEach(ws => {
            dashboard += `| ${ws.name} | ${ws.status} | ${ws.executions} | ${ws.successRate}% | ${ws.running} |\n`;
          });
          dashboard += '\n';
        }

        // Active alerts summary
        dashboard += `## 🚨 Active Alerts\n\n`;
        const workflowsWithAlerts = workflows.filter(w => {
          const alertRules = w.settings?.alertRules;
          return Array.isArray(alertRules) && alertRules.length > 0;
        });

        if (workflowsWithAlerts.length > 0) {
          dashboard += `**Workflows with Alert Rules:** ${workflowsWithAlerts.length}\n\n`;
          workflowsWithAlerts.forEach(workflow => {
            const alertRules = workflow.settings?.alertRules;
            const alertCount = Array.isArray(alertRules) ? alertRules.length : 0;
            dashboard += `- **${workflow.name}**: ${alertCount} alert rule(s) configured\n`;
          });
        } else {
          dashboard += `No alert rules configured.\n`;
        }
        dashboard += '\n';

        // Quick actions
        dashboard += `## ⚡ Quick Actions\n\n`;
        dashboard += `**Common Monitoring Tasks:**\n`;
        dashboard += `- Use \`track-workflow-performance\` to analyze specific workflow metrics\n`;
        dashboard += `- Use \`check-workflow-health\` to perform comprehensive health checks\n`;
        dashboard += `- Use \`create-alert-rule\` to set up automated monitoring alerts\n`;
        dashboard += `- Use \`setup-error-notifications\` to configure failure notifications\n\n`;

        dashboard += `**System Recommendations:**\n`;
        if (systemSuccessRate < 90) {
          dashboard += `- 🔴 System success rate is below 90% - investigate failing workflows\n`;
        }
        if (totalRunning > 10) {
          dashboard += `- ⚠️ High number of running executions - monitor for potential performance issues\n`;
        }
        if (workflowsWithAlerts.length === 0) {
          dashboard += `- 💡 No alert rules configured - consider setting up monitoring alerts\n`;
        }
        if (totalExecutions === 0) {
          dashboard += `- 📊 No recent executions - workflows may be inactive or not triggered\n`;
        }

        return dashboard;
      } catch (error: any) {
        throw new UserError(`Failed to generate monitoring dashboard: ${error.message}`);
      }
    },
  });
}
