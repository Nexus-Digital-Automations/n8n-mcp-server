/**
 * WebSocket Client for n8n Fork Real-time Communication
 *
 * Provides WebSocket connectivity to n8n fork's real-time push service
 * for workflow execution updates, progress monitoring, and bidirectional communication.
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { z } from 'zod';

// WebSocket message schemas
export const WorkflowExecutionEventSchema = z.object({
  type: z.enum(['workflowExecutionStarted', 'workflowExecutionCompleted', 'nodeExecutionStarted', 'nodeExecutionCompleted']),
  data: z.object({
    executionId: z.string(),
    workflowId: z.string().optional(),
    nodeId: z.string().optional(),
    nodeName: z.string().optional(),
    timestamp: z.string(),
    status: z.enum(['running', 'success', 'error', 'waiting']).optional(),
    error: z.string().optional(),
    data: z.any().optional(),
  }),
});

export const HeartbeatMessageSchema = z.object({
  type: z.literal('heartbeat'),
  timestamp: z.string(),
});

export const WebSocketMessageSchema = z.union([
  WorkflowExecutionEventSchema,
  HeartbeatMessageSchema,
  z.object({
    type: z.string(),
    data: z.any(),
  }),
]);

export type WorkflowExecutionEvent = z.infer<typeof WorkflowExecutionEventSchema>;
export type HeartbeatMessage = z.infer<typeof HeartbeatMessageSchema>;
export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

export interface WebSocketConfig {
  url: string;
  apiKey?: string;
  sessionToken?: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  connectionTimeout: number;
  headers?: Record<string, string>;
}

export interface ConnectionState {
  connected: boolean;
  reconnectAttempts: number;
  lastHeartbeat?: Date;
  lastMessage?: Date;
  connectionTime?: Date;
}

/**
 * WebSocket Client for n8n Fork Integration
 *
 * Handles real-time communication with n8n fork's push service,
 * including automatic reconnection, heartbeat monitoring, and event streaming.
 */
export class N8nWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private state: ConnectionState;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionTimeoutTimer: NodeJS.Timeout | null = null;

  constructor(config: WebSocketConfig) {
    super();
    this.config = config;
    this.state = {
      connected: false,
      reconnectAttempts: 0,
    };
  }

  /**
   * Connect to n8n fork WebSocket endpoint
   */
  public async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const headers: Record<string, string> = {
          'User-Agent': 'n8n-mcp-server/2.0.0',
          ...this.config.headers,
        };

        // Add authentication headers
        if (this.config.apiKey) {
          headers['X-N8N-API-KEY'] = this.config.apiKey;
        }

        if (this.config.sessionToken) {
          headers['Cookie'] = `n8n-auth=${this.config.sessionToken}`;
        }

        this.ws = new WebSocket(this.config.url, {
          headers,
          handshakeTimeout: this.config.connectionTimeout,
        });

        // Set connection timeout
        this.connectionTimeoutTimer = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.terminate();
            reject(new Error('WebSocket connection timeout'));
          }
        }, this.config.connectionTimeout);

        this.ws.on('open', () => {
          this.clearConnectionTimeout();
          this.state.connected = true;
          this.state.connectionTime = new Date();
          this.state.reconnectAttempts = 0;
          
          this.startHeartbeat();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          this.handleDisconnect(code, reason.toString());
        });

        this.ws.on('error', (error: Error) => {
          this.clearConnectionTimeout();
          this.emit('error', error);
          reject(error);
        });

        this.ws.on('pong', () => {
          this.state.lastHeartbeat = new Date();
          this.emit('heartbeat', { type: 'pong', timestamp: new Date().toISOString() });
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  public async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.clearReconnectTimer();
    this.clearConnectionTimeout();

    if (this.ws) {
      this.ws.removeAllListeners();
      
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Client disconnect');
      } else {
        this.ws.terminate();
      }
      
      this.ws = null;
    }

    this.state.connected = false;
    this.emit('disconnected');
  }

  /**
   * Send message to n8n fork
   */
  public async sendMessage(message: any): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const messageString = JSON.stringify(message);
    
    return new Promise((resolve, reject) => {
      this.ws!.send(messageString, (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Subscribe to workflow execution updates
   */
  public async subscribeToWorkflow(workflowId: string): Promise<void> {
    await this.sendMessage({
      type: 'subscribe',
      resource: 'workflow',
      id: workflowId,
    });
  }

  /**
   * Unsubscribe from workflow execution updates
   */
  public async unsubscribeFromWorkflow(workflowId: string): Promise<void> {
    await this.sendMessage({
      type: 'unsubscribe',
      resource: 'workflow',
      id: workflowId,
    });
  }

  /**
   * Subscribe to all execution updates
   */
  public async subscribeToExecutions(): Promise<void> {
    await this.sendMessage({
      type: 'subscribe',
      resource: 'executions',
    });
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Check if WebSocket is connected
   */
  public isConnected(): boolean {
    return this.state.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const messageString = data.toString();
      const rawMessage = JSON.parse(messageString);
      
      // Validate message schema
      const message = WebSocketMessageSchema.parse(rawMessage);
      
      this.state.lastMessage = new Date();
      this.emit('message', message);

      // Handle specific message types
      switch (message.type) {
        case 'workflowExecutionStarted':
        case 'workflowExecutionCompleted':
        case 'nodeExecutionStarted':
        case 'nodeExecutionCompleted':
          this.emit('workflowEvent', message as WorkflowExecutionEvent);
          break;
          
        case 'heartbeat':
          this.state.lastHeartbeat = new Date();
          this.emit('heartbeat', message as HeartbeatMessage);
          break;
          
        default:
          this.emit('unknownMessage', message);
      }

    } catch (error) {
      this.emit('messageError', error);
    }
  }

  /**
   * Handle WebSocket disconnect
   */
  private handleDisconnect(code: number, reason: string): void {
    this.state.connected = false;
    this.stopHeartbeat();
    this.clearConnectionTimeout();

    this.emit('disconnected', { code, reason });

    // Attempt reconnection if not a clean close
    if (code !== 1000 && this.state.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else if (this.state.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emit('maxReconnectAttemptsReached');
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.state.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.state.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    this.emit('reconnecting', { attempt: this.state.reconnectAttempts, delay });

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      
      try {
        await this.connect();
      } catch (error) {
        this.emit('reconnectError', error);
        
        if (this.state.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      }
    }, delay);
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
        this.emit('heartbeat', { type: 'ping', timestamp: new Date().toISOString() });
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Clear reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Clear connection timeout timer
   */
  private clearConnectionTimeout(): void {
    if (this.connectionTimeoutTimer) {
      clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }
  }
}

/**
 * Default WebSocket configuration
 */
export const DEFAULT_WEBSOCKET_CONFIG: Partial<WebSocketConfig> = {
  reconnectInterval: 1000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000,
  connectionTimeout: 10000,
};

/**
 * Create WebSocket client with default configuration
 */
export function createWebSocketClient(
  url: string, 
  options: Partial<WebSocketConfig> = {}
): N8nWebSocketClient {
  const config: WebSocketConfig = {
    url,
    ...DEFAULT_WEBSOCKET_CONFIG,
    ...options,
  } as WebSocketConfig;

  return new N8nWebSocketClient(config);
}