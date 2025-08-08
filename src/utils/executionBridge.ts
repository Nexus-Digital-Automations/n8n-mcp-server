import {
  MCPServer,
  MCPTool,
  MCPToolRequest,
  MCPToolResponse,
  MCPError,
  MCPErrorCode,
  MCPConnection,
  MCPExecutionContext,
  MCPExecutionResult,
  N8nExecutionData,
} from '../types/mcpTypes.js';
import { ParameterMapper } from './parameterMapper.js';
import fetch from 'node-fetch';

export class MCPExecutionBridge {
  private parameterMapper: ParameterMapper;
  private connectionPool: Map<string, MCPConnection> = new Map();
  private connectionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly CONNECTION_TIMEOUT = 30000; // 30 seconds
  private readonly REQUEST_TIMEOUT = 60000; // 60 seconds

  constructor() {
    this.parameterMapper = new ParameterMapper();
  }

  /**
   * Execute MCP tool with n8n context
   */
  async executeWithContext(context: MCPExecutionContext): Promise<MCPExecutionResult> {
    const startTime = Date.now();

    try {
      // Ensure connection is established
      await this.ensureConnection(context.connection);

      // Map n8n parameters to MCP request
      const mcpRequest = this.parameterMapper.mapN8nParametersToMCP(
        context.nodeParameters,
        context.inputData,
        context.tool
      );

      // Execute MCP tool
      const mcpResponse = await this.executeMCPTool(context.connection, mcpRequest);

      // Map MCP response back to n8n format
      const outputData = this.parameterMapper.mapMCPResponseToN8n(mcpResponse, context);

      return {
        outputData,
        executionTime: Date.now() - startTime,
        success: true,
      };
    } catch (error) {
      const mcpError = this.convertToMCPError(error);

      return {
        outputData: [
          {
            json: {
              error: true,
              message: mcpError.message,
              code: mcpError.code,
              executionTime: Date.now() - startTime,
            },
            pairedItem: { item: 0 },
          },
        ],
        executionTime: Date.now() - startTime,
        success: false,
        error: mcpError,
      };
    }
  }

  /**
   * Ensure MCP server connection is active
   */
  private async ensureConnection(connection: MCPConnection): Promise<void> {
    const existingConnection = this.connectionPool.get(connection.serverId);

    if (existingConnection && existingConnection.isConnected) {
      // Check if connection is still valid
      if (this.isConnectionHealthy(existingConnection)) {
        return;
      }
    }

    // Establish new connection
    await this.establishConnection(connection);
  }

  /**
   * Check if connection is healthy
   */
  private isConnectionHealthy(connection: MCPConnection): boolean {
    if (!connection.lastHeartbeat) return false;

    const timeSinceLastHeartbeat = Date.now() - connection.lastHeartbeat.getTime();
    return timeSinceLastHeartbeat < this.CONNECTION_TIMEOUT;
  }

  /**
   * Establish connection to MCP server
   */
  private async establishConnection(connection: MCPConnection): Promise<void> {
    try {
      // Test connection with a simple request
      const healthResponse = await fetch(`${connection.url}/health`, {
        method: 'GET',
        headers: this.buildAuthHeaders(connection.authentication),
      });

      if (!healthResponse.ok) {
        throw new Error(`MCP server health check failed: ${healthResponse.status}`);
      }

      // Update connection status
      connection.isConnected = true;
      connection.lastHeartbeat = new Date();

      this.connectionPool.set(connection.serverId, connection);

      // Set up connection timeout
      this.setupConnectionTimeout(connection.serverId);
    } catch (error) {
      connection.isConnected = false;
      throw new Error(
        `Failed to connect to MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Set up connection timeout monitoring
   */
  private setupConnectionTimeout(serverId: string): void {
    // Clear existing timeout
    const existingTimeout = this.connectionTimeouts.get(serverId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      const connection = this.connectionPool.get(serverId);
      if (connection) {
        connection.isConnected = false;
        this.connectionPool.delete(serverId);
      }
      this.connectionTimeouts.delete(serverId);
    }, this.CONNECTION_TIMEOUT);

    this.connectionTimeouts.set(serverId, timeout);
  }

  /**
   * Execute MCP tool via HTTP request
   */
  private async executeMCPTool(
    connection: MCPConnection,
    request: MCPToolRequest
  ): Promise<MCPToolResponse> {
    const requestBody = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'tools/call',
      params: {
        name: request.name,
        arguments: request.arguments,
      },
    };

    const response = await fetch(`${connection.url}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.buildAuthHeaders(connection.authentication),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`MCP server request failed: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json() as any;

    if (responseData.error) {
      throw this.createMCPError(responseData.error);
    }

    // Update connection heartbeat
    const conn = this.connectionPool.get(connection.serverId);
    if (conn) {
      conn.lastHeartbeat = new Date();
    }

    return responseData.result;
  }

  /**
   * Build authentication headers
   */
  private buildAuthHeaders(auth: any): Record<string, string> {
    const headers: Record<string, string> = {};

    switch (auth?.type) {
      case 'bearer':
        if (auth.credentials?.token) {
          headers['Authorization'] = `Bearer ${auth.credentials.token}`;
        }
        break;

      case 'api-key':
        if (auth.credentials?.apiKey) {
          headers['X-API-Key'] = auth.credentials.apiKey;
        }
        break;

      case 'basic':
        if (auth.credentials?.username && auth.credentials?.password) {
          const encoded = Buffer.from(
            `${auth.credentials.username}:${auth.credentials.password}`
          ).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
        break;
    }

    return headers;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Convert error to MCP error format
   */
  private convertToMCPError(error: unknown): MCPError {
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      return error as MCPError;
    }

    if (error instanceof Error) {
      // Map common errors to MCP error codes
      if (error.message.includes('not found') || error.message.includes('404')) {
        return {
          code: MCPErrorCode.TOOL_NOT_FOUND,
          message: error.message,
        };
      }

      if (error.message.includes('authentication') || error.message.includes('401')) {
        return {
          code: MCPErrorCode.AUTHENTICATION_FAILED,
          message: error.message,
        };
      }

      if (error.message.includes('authorization') || error.message.includes('403')) {
        return {
          code: MCPErrorCode.AUTHORIZATION_FAILED,
          message: error.message,
        };
      }

      if (error.message.includes('invalid') || error.message.includes('400')) {
        return {
          code: MCPErrorCode.INVALID_PARAMS,
          message: error.message,
        };
      }

      return {
        code: MCPErrorCode.INTERNAL_ERROR,
        message: error.message,
      };
    }

    return {
      code: MCPErrorCode.INTERNAL_ERROR,
      message: 'Unknown error occurred',
      data: error,
    };
  }

  /**
   * Create MCP error from server response
   */
  private createMCPError(errorData: any): MCPError {
    return {
      code: errorData.code || MCPErrorCode.INTERNAL_ERROR,
      message: errorData.message || 'MCP server error',
      data: errorData.data,
    };
  }

  /**
   * Execute multiple tools in batch
   */
  async executeBatch(contexts: MCPExecutionContext[]): Promise<MCPExecutionResult[]> {
    const results = await Promise.allSettled(
      contexts.map(context => this.executeWithContext(context))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          outputData: [
            {
              json: {
                error: true,
                message: result.reason?.message || 'Batch execution failed',
                batchIndex: index,
              },
              pairedItem: { item: 0 },
            },
          ],
          executionTime: 0,
          success: false,
          error: this.convertToMCPError(result.reason),
        };
      }
    });
  }

  /**
   * Test MCP server connection
   */
  async testConnection(connection: MCPConnection): Promise<boolean> {
    try {
      await this.establishConnection(connection);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get MCP server capabilities
   */
  async getServerCapabilities(connection: MCPConnection): Promise<any> {
    await this.ensureConnection(connection);

    const requestBody = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'n8n-mcp-client',
          version: '1.0.0',
        },
      },
    };

    const response = await fetch(`${connection.url}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.buildAuthHeaders(connection.authentication),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Failed to get server capabilities: ${response.status}`);
    }

    const responseData = await response.json() as any;

    if (responseData.error) {
      throw this.createMCPError(responseData.error);
    }

    return responseData.result;
  }

  /**
   * Close connection to MCP server
   */
  async closeConnection(serverId: string): Promise<void> {
    const connection = this.connectionPool.get(serverId);
    if (connection) {
      connection.isConnected = false;
      this.connectionPool.delete(serverId);
    }

    const timeout = this.connectionTimeouts.get(serverId);
    if (timeout) {
      clearTimeout(timeout);
      this.connectionTimeouts.delete(serverId);
    }
  }

  /**
   * Clean up all connections
   */
  async cleanup(): Promise<void> {
    const serverIds = Array.from(this.connectionPool.keys());
    await Promise.all(serverIds.map(id => this.closeConnection(id)));
  }

  /**
   * Get connection status
   */
  getConnectionStatus(serverId: string): { isConnected: boolean; lastHeartbeat?: Date } {
    const connection = this.connectionPool.get(serverId);
    return {
      isConnected: connection?.isConnected || false,
      lastHeartbeat: connection?.lastHeartbeat,
    };
  }

  /**
   * Get active connections count
   */
  getActiveConnectionsCount(): number {
    return Array.from(this.connectionPool.values()).filter(conn => conn.isConnected).length;
  }

  /**
   * Create execution context from n8n node data
   */
  createExecutionContext(
    connection: MCPConnection,
    tool: MCPTool,
    nodeParameters: Record<string, unknown>,
    inputData: N8nExecutionData[]
  ): MCPExecutionContext {
    return {
      connection,
      tool,
      nodeParameters,
      inputData,
    };
  }

  /**
   * Validate execution context
   */
  validateExecutionContext(context: MCPExecutionContext): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!context.connection?.serverId) {
      errors.push('Missing server ID in connection');
    }

    if (!context.connection?.url) {
      errors.push('Missing server URL in connection');
    }

    if (!context.tool?.name) {
      errors.push('Missing tool name');
    }

    if (!context.tool?.inputSchema) {
      errors.push('Missing tool input schema');
    }

    if (!context.inputData || !Array.isArray(context.inputData)) {
      errors.push('Invalid input data format');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
