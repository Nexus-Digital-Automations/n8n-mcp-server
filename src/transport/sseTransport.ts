/**
 * SSE Transport Implementation for n8n MCP Server
 *
 * Provides Server-Sent Events (SSE) transport capability for remote access to the n8n MCP server.
 * Enables web-based clients to connect and use n8n tools through HTTP/SSE protocol.
 */

import { FastMCP } from 'fastmcp';
import type { TransportConfig } from './transportConfig.js';

/**
 * SSE Transport Manager
 *
 * Handles SSE server configuration, health checks, and connection management
 * for the n8n MCP server.
 */
export class SSETransportManager {
  private server: FastMCP;
  private config: TransportConfig;

  constructor(server: FastMCP, config: TransportConfig) {
    this.server = server;
    this.config = config;
  }

  /**
   * Start the SSE transport server
   */
  public async start(): Promise<void> {
    if (this.config.type !== 'sse' || !this.config.sse) {
      throw new Error('SSE transport not configured');
    }

    const { port, endpoint, host, healthCheck } = this.config.sse;

    console.log(`🚀 Starting n8n MCP Server with SSE transport`);
    console.log(`📡 Server will be available at: http://${host}:${port}${endpoint}`);

    // Configure FastMCP server for SSE transport
    await this.server.start({
      transportType: 'httpStream',
      httpStream: {
        port,
        endpoint: endpoint as `/${string}`,
      },
    });

    // Add health check endpoint if enabled
    if (healthCheck?.enabled) {
      this.setupHealthCheck();
    }

    this.logServerInfo();
  }

  /**
   * Setup health check endpoint
   */
  private setupHealthCheck(): void {
    if (!this.config.sse?.healthCheck) return;

    const healthEndpoint = this.config.sse.healthCheck.endpoint;

    // Note: FastMCP automatically handles health checks
    // This is a placeholder for custom health check logic if needed
    console.log(`💚 Health check endpoint: ${healthEndpoint}`);
  }

  /**
   * Log server information and connection details
   */
  private logServerInfo(): void {
    if (!this.config.sse) return;

    const { port, endpoint, host, cors } = this.config.sse;

    console.log('\n📋 Server Configuration:');
    console.log(`   Transport: SSE (Server-Sent Events)`);
    console.log(`   Host: ${host}`);
    console.log(`   Port: ${port}`);
    console.log(`   Endpoint: ${endpoint}`);
    console.log(`   CORS: ${cors.enabled ? 'Enabled' : 'Disabled'}`);

    if (cors.enabled) {
      console.log(`   Allowed Origins: ${cors.origins.join(', ')}`);
      console.log(`   Credentials: ${cors.credentials ? 'Allowed' : 'Not allowed'}`);
    }

    console.log('\n🔌 Connection Instructions:');
    console.log('   For MCP Inspector:');
    console.log(`   npx @modelcontextprotocol/inspector http://${host}:${port}${endpoint}`);
    console.log('');
    console.log('   For Claude Desktop (claude_desktop_config.json):');
    console.log('   {');
    console.log('     "mcpServers": {');
    console.log('       "n8n": {');
    console.log(`         "command": "npx",`);
    console.log(`         "args": ["@illuminaresolutions/n8n-mcp-server"],`);
    console.log(`         "env": {`);
    console.log(`           "N8N_MCP_TRANSPORT": "sse",`);
    console.log(`           "N8N_MCP_SSE_PORT": "${port}",`);
    console.log(`           "N8N_MCP_SSE_HOST": "${host}"`);
    console.log(`         }`);
    console.log('       }');
    console.log('     }');
    console.log('   }');
    console.log('');
  }

  /**
   * Stop the server (cleanup)
   */
  public async stop(): Promise<void> {
    console.log('🛑 Stopping SSE transport server...');
    // FastMCP handles cleanup automatically
  }
}

/**
 * Create and configure SSE transport for FastMCP server
 */
export function createSSETransport(server: FastMCP, config: TransportConfig): SSETransportManager {
  return new SSETransportManager(server, config);
}

/**
 * SSE-specific utilities and helpers
 */
export const SSEUtils = {
  /**
   * Validate SSE configuration
   */
  validateConfig(config: TransportConfig): boolean {
    if (config.type !== 'sse') return false;
    if (!config.sse) return false;

    const { port, endpoint } = config.sse;

    // Port validation
    if (port < 1024 || port > 65535) {
      console.error(`❌ Invalid port: ${port}. Must be between 1024-65535`);
      return false;
    }

    // Endpoint validation
    if (!endpoint.startsWith('/')) {
      console.error(`❌ Invalid endpoint: ${endpoint}. Must start with '/'`);
      return false;
    }

    return true;
  },

  /**
   * Get connection URL for the SSE server
   */
  getConnectionUrl(config: TransportConfig): string | null {
    if (config.type !== 'sse' || !config.sse) return null;

    const { host, port, endpoint } = config.sse;
    const protocol = port === 443 ? 'https' : 'http';
    return `${protocol}://${host}:${port}${endpoint}`;
  },

  /**
   * Format connection instructions for different clients
   */
  formatConnectionInstructions(config: TransportConfig): {
    inspector: string;
    claudeDesktop: object;
    curl: string;
  } | null {
    const url = this.getConnectionUrl(config);
    if (!url) return null;

    return {
      inspector: `npx @modelcontextprotocol/inspector ${url}`,
      claudeDesktop: {
        mcpServers: {
          n8n: {
            command: 'npx',
            args: ['@illuminaresolutions/n8n-mcp-server'],
            env: {
              N8N_MCP_TRANSPORT: 'sse',
              N8N_MCP_SSE_PORT: config.sse?.port.toString(),
              N8N_MCP_SSE_HOST: config.sse?.host,
            },
          },
        },
      },
      curl: `curl -N -H "Accept: text/event-stream" ${url}`,
    };
  },
};

/**
 * Default SSE server configuration
 */
export const DEFAULT_SSE_CONFIG = {
  port: 8080,
  endpoint: '/sse',
  host: 'localhost',
  cors: {
    enabled: true,
    origins: ['*'],
    credentials: false,
  },
  healthCheck: {
    enabled: true,
    endpoint: '/health',
  },
} as const;
