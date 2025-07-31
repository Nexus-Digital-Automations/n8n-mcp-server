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
This server provides comprehensive access to n8n workflows, executions, users, projects, credentials, and more through the Model Context Protocol.

Key Features:
- Complete workflow management (create, read, update, delete, activate/deactivate)
- User and project management (Enterprise features)
- Execution monitoring and management
- Credential and variable management
- Tag system for organization
- Audit and security reporting

Getting Started:
1. Initialize connection: Use 'init-n8n' with your n8n instance URL and API key
2. Explore workflows: Use 'list-workflows' to see available workflows
3. Manage workflows: Create, update, activate/deactivate workflows as needed

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

    console.log(`🚀 Starting n8n MCP Server...`);
    console.log(`📡 Transport type: ${validatedConfig.type}`);

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
        console.log(`🌐 Server URL: ${serverUrl}`);
      }
    } else {
      // Start with stdio transport (default)
      await server.start({
        transportType: 'stdio',
      });
      console.log('📟 Server started with stdio transport');
    }

    console.log('✅ n8n MCP Server is ready!');
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
