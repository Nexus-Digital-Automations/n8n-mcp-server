// MCP (Model Context Protocol) type definitions for conversion utilities

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  version: string;
  authentication?: MCPAuthentication;
  capabilities: MCPCapabilities;
}

export interface MCPAuthentication {
  type: 'none' | 'bearer' | 'api-key' | 'basic';
  credentials?: Record<string, unknown>;
}

export interface MCPCapabilities {
  tools: MCPTool[];
  resources?: MCPResource[];
  sampling?: MCPSamplingCapability;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolSchema;
}

export interface MCPToolSchema {
  type: 'object';
  properties: Record<string, MCPToolProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface MCPToolProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: MCPToolProperty;
  properties?: Record<string, MCPToolProperty>;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPSamplingCapability {
  models: string[];
}

// Request/Response types
export interface MCPToolRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPError {
  code: MCPErrorCode;
  message: string;
  data?: unknown;
}

export enum MCPErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  TOOL_NOT_FOUND = -404,
  AUTHENTICATION_FAILED = -401,
  AUTHORIZATION_FAILED = -403,
}

// n8n Integration Types
export interface N8nNodeTypeDescription {
  displayName: string;
  name: string;
  icon: string;
  group: string[];
  version: number[];
  description: string;
  defaults: {
    name: string;
  };
  inputs: string[];
  outputs: string[];
  credentials?: Array<{
    name: string;
    required: boolean;
  }>;
  properties: N8nNodeProperty[];
}

export interface N8nNodeProperty {
  displayName: string;
  name: string;
  type: N8nPropertyType;
  default?: unknown;
  description?: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<{
    name: string;
    value: unknown;
  }>;
  typeOptions?: Record<string, unknown>;
  displayOptions?: {
    show?: Record<string, unknown[]>;
    hide?: Record<string, unknown[]>;
  };
}

export type N8nPropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'options'
  | 'multiOptions'
  | 'json'
  | 'dateTime'
  | 'collection'
  | 'fixedCollection'
  | 'resourceLocator'
  | 'hidden';

export interface N8nExecutionData {
  json: Record<string, unknown>;
  binary?: Record<
    string,
    {
      data: string;
      mimeType: string;
      fileName?: string;
      fileExtension?: string;
    }
  >;
  pairedItem?: {
    item: number;
    input?: number;
  };
}

// Conversion Configuration
export interface MCPConversionConfig {
  nodeNamePrefix?: string;
  defaultIcon?: string;
  defaultGroup?: string[];
  credentialName?: string;
  enableBinaryData?: boolean;
  enableResourceAccess?: boolean;
  typeMapping?: Record<string, N8nPropertyType>;
}

export interface ConversionResult {
  success: boolean;
  nodeDefinition?: N8nNodeTypeDescription;
  errors?: string[];
  warnings?: string[];
}

export interface ConversionContext {
  mcpServer: MCPServer;
  tool: MCPTool;
  config: MCPConversionConfig;
}

// Connection and execution types
export interface MCPConnection {
  serverId: string;
  url: string;
  authentication: MCPAuthentication;
  isConnected: boolean;
  lastHeartbeat?: Date;
}

export interface MCPExecutionContext {
  connection: MCPConnection;
  tool: MCPTool;
  inputData: N8nExecutionData[];
  nodeParameters: Record<string, unknown>;
}

export interface MCPExecutionResult {
  outputData: N8nExecutionData[];
  executionTime: number;
  success: boolean;
  error?: MCPError;
}
