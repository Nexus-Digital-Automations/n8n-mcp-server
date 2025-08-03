#!/usr/bin/env node

import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { N8nClient } from './client/n8nClient.js';
import { createWorkflowTools } from './tools/workflow.js';
import { createProjectTools } from './tools/projects.js';
import { createUserTools } from './tools/users.js';
import { createVariableTools } from './tools/variables.js';
import { createExecutionTools } from './tools/executions.js';
import { createTagTools } from './tools/tags.js';
import { createCredentialTools } from './tools/credentials.js';
import { createAuditTools } from './tools/audit.js';
import { createAIConfigTools } from './tools/ai-config.js';
import { createAITestingTools } from './tools/ai-testing.js';
import { createAIModelsTools } from './tools/ai-models.js';
import { createMonitoringTools } from './tools/monitoring.js';
import { createAnalyticsTools } from './tools/analytics.js';
import { createTemplateTools } from './tools/templates.js';
import { createSourceControlTools } from './tools/source-control.js';
import { createResourceTransferTools } from './tools/resource-transfer.js';
import { createDataManagementTools } from './tools/data-management.js';
import { createCredentialTestingTools } from './tools/credential-testing.js';
import { createExecutionControlTools } from './tools/execution-control.js';
import {
  detectTransportConfig,
  validateTransportConfig,
  getServerUrl,
} from './transport/transportConfig.js';
import { createSSETransport, SSEUtils } from './transport/sseTransport.js';

// Global client instance
let n8nClient: N8nClient | null = null;

// FastMCP server instance
const server = new FastMCP({
  name: 'n8n-mcp-server',
  version: '2.0.0',
  instructions: `
This server provides comprehensive access to n8n workflows, executions, users, projects, credentials, and AI capabilities through the Model Context Protocol.

Key Features:
- Complete workflow management (create, read, update, delete, activate/deactivate)
- User and project management (Enterprise features)
- Execution monitoring and management
- Sophisticated execution control (cancel, retry, partial execution with checkpoints)
- Credential and variable management
- Tag system for organization
- Audit and security reporting
- AI-centric features for AI node configuration and testing
- AI model management and recommendations
- AI prompt validation and testing tools
- Advanced monitoring and alerting system
- Workflow performance tracking and health checks
- Error notification and alert rule management
- Workflow intelligence and complexity analysis
- Performance bottleneck identification and optimization suggestions
- Workflow comparison and best practice identification
- Template and pattern management with curated library
- Workflow template search, import/export, and pattern analysis
- Resource portability with comprehensive export/import tools
- Cross-instance workflow, credential, and configuration transfer
- Batch resource operations and project migration tools
- Binary data management with upload/download capabilities
- Large file handling with progress tracking and validation
- Static workflow file storage and organization tools
- Enhanced authentication with OAuth2 callback mechanisms
- Credential validity testing and security validation
- Multi-factor authentication and session management
- Advanced security monitoring and audit capabilities

Getting Started:
1. Initialize connection: Use 'init-n8n' with your n8n instance URL and API key
2. Explore workflows: Use 'list-workflows' to see available workflows
3. Manage workflows: Create, update, activate/deactivate workflows as needed
4. Explore AI features: Use 'list-ai-models' to see available AI models and 'list-ai-nodes' to find AI nodes in workflows
5. Monitor system health: Use 'get-monitoring-dashboard' for real-time system overview and 'check-workflow-health' for detailed analysis

The server supports both Community and Enterprise n8n features. Enterprise features (projects, variables) will return appropriate errors if not available in your n8n instance.

All operations include proper error handling and user-friendly messages. Long-running operations report progress when possible.
  `.trim(),
});

// Function to get the global client instance
const getClient = () => n8nClient;

// Helper function to set the global client
const setClient = (client: N8nClient) => {
  n8nClient = client;
};

// Register all tools using the create*Tools helpers
createWorkflowTools(getClient, server);
createProjectTools(getClient, server);
createUserTools(getClient, server);
createVariableTools(getClient, server);
createExecutionTools(getClient, server);
createTagTools(getClient, server);
createCredentialTools(getClient, server);
createAuditTools(getClient, server);

// Register source control integration tools (Phase 1)
createSourceControlTools(getClient, server);

// Register resource transfer tools (Phase 1)
createResourceTransferTools(getClient, server);

// Register data management tools (Phase 1)
createDataManagementTools(getClient, server);

// Register credential testing tools (Phase 1)
createCredentialTestingTools(getClient, server);

// Register execution control tools (Phase 1)
createExecutionControlTools(getClient, server);

// Register AI-centric tools (Phase 3)
createAIConfigTools(getClient, server);
createAITestingTools(getClient, server);
createAIModelsTools(getClient, server);

// Register advanced monitoring tools (Phase 3)
createMonitoringTools(getClient, server);

// Register workflow analytics and intelligence tools (Phase 3)
createAnalyticsTools(getClient, server);

// Register template and pattern management tools (Phase 3)
createTemplateTools(getClient, server);

// Override the init-n8n tool to properly set the global client
server.addTool({
  name: 'init-n8n',
  description: 'Initialize connection to n8n instance with base URL and API key',
  parameters: z.object({
    baseUrl: z.string().url('Must be a valid URL'),
    apiKey: z.string().min(1, 'API key is required'),
  }),
  annotations: {
    title: 'Initialize n8n Connection',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  execute: async (args: any) => {
    try {
      // Create and set the global client
      const client = new N8nClient(args.baseUrl, args.apiKey);

      // Test the connection
      await client.getWorkflows({ limit: 1 });

      // Set the global client
      setClient(client);

      return `✅ Successfully connected to n8n instance at ${args.baseUrl}`;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to connect to n8n: ${error.message}`);
      }
      throw new Error('Failed to connect to n8n with unknown error');
    }
  },
});

// Add a simple status check tool
server.addTool({
  name: 'status',
  description: 'Check the current connection status to n8n',
  parameters: z.object({}),
  annotations: {
    title: 'Check n8n Connection Status',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  execute: async () => {
    if (!n8nClient) {
      return "❌ Not connected to n8n. Please run 'init-n8n' first.";
    }

    try {
      // Test the connection
      await n8nClient.getWorkflows({ limit: 1 });
      return '✅ Connected to n8n and ready to use.';
    } catch (error) {
      return `⚠️ Connected but unable to communicate with n8n: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

// Configure and start the server with appropriate transport
async function startServer() {
  try {
    // Detect transport configuration
    const transportConfig = detectTransportConfig();
    const validatedConfig = validateTransportConfig(transportConfig);

    // Only log to stderr for stdio transport to avoid corrupting JSON-RPC communication
    const isStdioTransport = validatedConfig.type === 'stdio';
    const log = isStdioTransport ? console.error : console.log;

    log(`🚀 Starting n8n MCP Server...`);
    log(`📡 Transport type: ${validatedConfig.type}`);

    if (validatedConfig.type === 'sse') {
      // Validate SSE configuration
      if (!SSEUtils.validateConfig(validatedConfig)) {
        console.error('❌ Invalid SSE configuration');
        process.exit(1);
      }

      // Create and start SSE transport
      const sseTransport = createSSETransport(server, validatedConfig);
      await sseTransport.start();

      // Log connection URL
      const serverUrl = getServerUrl(validatedConfig);
      if (serverUrl) {
        log(`🌐 Server URL: ${serverUrl}`);
      }
    } else {
      // Start with stdio transport (default)
      await server.start({
        transportType: 'stdio',
      });
      log('📟 Server started with stdio transport');
    }

    log('✅ n8n MCP Server is ready!');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});
