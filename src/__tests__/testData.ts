// Test data fixtures for MCP conversion utilities
import {
  MCPTool,
  MCPServer,
  MCPConnection,
  MCPExecutionContext,
  N8nExecutionData,
  MCPConversionConfig,
  ConversionContext,
} from '../types/mcpTypes.js';

// Mock MCP Tool definitions
export const mockSimpleTool: MCPTool = {
  name: 'simple_test',
  description: 'A simple test tool for unit testing',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'A simple message parameter',
        default: 'Hello World',
      },
      count: {
        type: 'integer',
        description: 'Number of iterations',
        minimum: 1,
        maximum: 100,
      },
    },
    required: ['message'],
  },
};

export const mockComplexTool: MCPTool = {
  name: 'complex_data_processor',
  description: 'A complex tool with nested objects and arrays',
  inputSchema: {
    type: 'object',
    properties: {
      config: {
        type: 'object',
        description: 'Configuration object',
        properties: {
          enabled: {
            type: 'boolean',
            default: true,
          },
          timeout: {
            type: 'number',
            minimum: 0.1,
            maximum: 30.0,
            default: 5.0,
          },
        },
      },
      items: {
        type: 'array',
        description: 'Array of items to process',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            value: { type: 'number' },
          },
        },
      },
      operation: {
        type: 'string',
        enum: ['create', 'update', 'delete'],
        description: 'Operation to perform',
      },
    },
    required: ['operation'],
  },
};

export const mockEnumTool: MCPTool = {
  name: 'enum_tool',
  description: 'Tool with enum parameters',
  inputSchema: {
    type: 'object',
    properties: {
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        default: 'medium',
        description: 'Priority level',
      },
      status: {
        type: 'integer',
        enum: [1, 2, 3, 4, 5],
        description: 'Status code',
      },
    },
    required: ['priority'],
  },
};

export const mockStringConstraintsTool: MCPTool = {
  name: 'string_constraints',
  description: 'Tool with string format constraints',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        format: 'email',
        description: 'User email address',
      },
      password: {
        type: 'string',
        format: 'password',
        minLength: 8,
        maxLength: 128,
        description: 'User password',
      },
      website: {
        type: 'string',
        format: 'uri',
        pattern: '^https?://',
        description: 'Website URL',
      },
      code: {
        type: 'string',
        pattern: '^[A-Z]{3}[0-9]{3}$',
        description: 'Product code (ABC123 format)',
      },
    },
    required: ['email'],
  },
};

// Mock MCP Server
export const mockMCPServer: MCPServer = {
  id: 'test-server-1',
  name: 'Test MCP Server',
  url: 'https://api.example.com',
  version: '1.0.0',
  authentication: {
    type: 'bearer',
    credentials: { token: 'test-token-123' },
  },
  capabilities: {
    tools: [mockSimpleTool, mockComplexTool],
    resources: [
      {
        uri: 'file://test.txt',
        name: 'Test File',
        description: 'A test resource file',
        mimeType: 'text/plain',
      },
    ],
  },
};

// Mock MCP Connection
export const mockConnection: MCPConnection = {
  serverId: 'test-server-1',
  url: 'https://api.example.com',
  authentication: {
    type: 'bearer',
    credentials: { token: 'test-token-123' },
  },
  isConnected: true,
  lastHeartbeat: new Date('2024-01-01T12:00:00Z'),
};

// Mock n8n Execution Data
export const mockN8nExecutionData: N8nExecutionData[] = [
  {
    json: {
      id: 'test-item-1',
      name: 'Test Item',
      value: 42,
      nested: {
        field: 'nested-value',
        array: [1, 2, 3],
      },
    },
    pairedItem: { item: 0 },
  },
  {
    json: {
      id: 'test-item-2',
      name: 'Another Test Item',
      value: 84,
    },
    pairedItem: { item: 1 },
  },
];

// Mock MCP Execution Context
export const mockExecutionContext: MCPExecutionContext = {
  connection: mockConnection,
  tool: mockSimpleTool,
  nodeParameters: {
    message: 'Test message from n8n',
    count: 5,
  },
  inputData: mockN8nExecutionData,
};

// Mock MCP Conversion Config
export const mockConversionConfig: MCPConversionConfig = {
  nodeNamePrefix: 'MCP',
  defaultIcon: 'fa:cog',
  defaultGroup: ['transform'],
  credentialName: 'mcpServerApi',
  enableBinaryData: true,
  enableResourceAccess: true,
  typeMapping: {
    string: 'string',
    number: 'number',
    integer: 'number',
    boolean: 'boolean',
    array: 'json',
    object: 'json',
  },
};

// Mock Conversion Context
export const mockConversionContext: ConversionContext = {
  mcpServer: mockMCPServer,
  tool: mockSimpleTool,
  config: mockConversionConfig,
};

// Mock MCP Tool Response
export const mockMCPToolResponse = {
  content: [
    {
      type: 'text',
      text: 'Operation completed successfully',
    },
    {
      type: 'image',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHAfXqOmAAAAElQTkSuQmCC',
      mimeType: 'image/png',
    },
  ],
};

// Invalid test data for error cases
export const invalidMCPTool = {
  // Missing required fields
  description: 'Invalid tool',
};

export const invalidSchema = {
  type: 'array', // Should be 'object'
  properties: {},
};

export const circularSchema = {
  type: 'object',
  properties: {
    self: {
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          properties: {}, // Would create circular reference in real scenario
        },
      },
    },
  },
};

// HTTP Response mocks
export const mockHttpResponse = {
  ok: true,
  status: 200,
  statusText: 'OK',
  json: jest.fn(),
};

export const mockHttpErrorResponse = {
  ok: false,
  status: 500,
  statusText: 'Internal Server Error',
  json: jest.fn(),
};

export const mockMCPCapabilities = {
  tools: [mockSimpleTool, mockComplexTool, mockEnumTool],
  resources: [
    {
      uri: 'file://test1.txt',
      name: 'Test Resource 1',
    },
    {
      uri: 'file://test2.json',
      name: 'Test Resource 2',
      mimeType: 'application/json',
    },
  ],
  sampling: {
    models: ['gpt-4', 'claude-3'],
  },
};

// Expression test data
export const expressionTestCases = [
  {
    input: '{{ $json.name }}',
    expected: 'Test Item',
    description: 'Simple field reference',
  },
  {
    input: 'Hello {{ $json.name }}, your value is {{ $json.value }}',
    expected: 'Hello Test Item, your value is 42',
    description: 'Multiple expressions',
  },
  {
    input: '{{ $json.nested.field }}',
    expected: 'nested-value',
    description: 'Nested field reference',
  },
  {
    input: '{{ $json.nonexistent }}',
    expected: '{{ $json.nonexistent }}',
    description: 'Non-existent field (should remain unchanged)',
  },
];

// Type conversion test cases
export const typeConversionTestCases = [
  // String conversions
  { input: 'test string', type: 'string', expected: 'test string' },
  { input: 123, type: 'string', expected: '123' },
  { input: true, type: 'string', expected: 'true' },
  { input: { key: 'value' }, type: 'string', expected: '{"key":"value"}' },
  
  // Number conversions
  { input: '42.5', type: 'number', expected: 42.5 },
  { input: 42, type: 'number', expected: 42 },
  { input: true, type: 'number', expected: 1 },
  { input: false, type: 'number', expected: 0 },
  
  // Integer conversions
  { input: '42', type: 'integer', expected: 42 },
  { input: 42.7, type: 'integer', expectedError: 'Value must be an integer' },
  
  // Boolean conversions
  { input: true, type: 'boolean', expected: true },
  { input: 'true', type: 'boolean', expected: true },
  { input: '1', type: 'boolean', expected: true },
  { input: 'yes', type: 'boolean', expected: true },
  { input: false, type: 'boolean', expected: false },
  { input: 'false', type: 'boolean', expected: false },
  { input: '0', type: 'boolean', expected: false },
  { input: '', type: 'boolean', expected: false },
  
  // Array conversions
  { input: [1, 2, 3], type: 'array', expected: [1, 2, 3] },
  { input: '[1,2,3]', type: 'array', expected: [1, 2, 3] },
  { input: 'single item', type: 'array', expected: ['single item'] },
  
  // Object conversions
  { input: { key: 'value' }, type: 'object', expected: { key: 'value' } },
  { input: '{"key":"value"}', type: 'object', expected: { key: 'value' } },
];

// Error test scenarios
export const errorTestScenarios = [
  {
    name: 'Invalid MCP tool data',
    data: null,
    expectedError: 'Invalid MCP tool data',
  },
  {
    name: 'Missing tool name',
    data: { description: 'Test' },
    expectedError: 'MCP tool must have a name',
  },
  {
    name: 'Missing tool description',
    data: { name: 'test' },
    expectedError: 'MCP tool must have a description',
  },
  {
    name: 'Missing input schema',
    data: { name: 'test', description: 'Test tool' },
    expectedError: 'MCP tool must have inputSchema',
  },
  {
    name: 'Invalid schema type',
    data: {
      name: 'test',
      description: 'Test tool',
      inputSchema: { type: 'string', properties: {} },
    },
    expectedError: 'MCP tool schema must be of type "object"',
  },
];