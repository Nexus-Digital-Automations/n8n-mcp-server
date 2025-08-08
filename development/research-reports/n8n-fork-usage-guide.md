# n8n Fork Usage Guide for MCP Server Integration

Generated: 2025-08-08  
Target: MCP Server Developers and Integration Architects

## Overview

This guide provides practical instructions for integrating with the n8n fork APIs and building MCP server integrations that leverage n8n's workflow automation capabilities.

## Getting Started

### Prerequisites
- Node.js 20+ with TypeScript support
- Access to n8n fork instance (local or remote)
- MCP server implementation knowledge
- Basic understanding of REST APIs and WebSocket communication

### Authentication Setup

#### 1. API Key Authentication (Recommended)
```typescript
// Set up API key authentication
const headers = {
  'X-N8N-API-KEY': 'your-api-key-here',
  'Content-Type': 'application/json'
};

// Make authenticated requests
const response = await fetch('https://your-n8n-instance/api/v1/workflows', {
  headers
});
```

#### 2. Session-Based Authentication
```typescript
// Login to establish session
const loginResponse = await fetch('https://your-n8n-instance/api/v1/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'secure-password'
  })
});

// Use cookies for subsequent requests
const cookies = loginResponse.headers.get('set-cookie');
```

## Core API Usage Patterns

### Workflow Management

#### Create a Workflow
```typescript
async function createWorkflow(workflowData: WorkflowCreateData): Promise<Workflow> {
  const response = await fetch('/api/v1/workflows', {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: workflowData.name,
      nodes: workflowData.nodes,
      connections: workflowData.connections,
      settings: workflowData.settings || {},
      tags: workflowData.tags || []
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to create workflow: ${response.statusText}`);
  }

  return response.json();
}

// Example workflow creation
const mcpWorkflow = await createWorkflow({
  name: 'MCP Tool Integration',
  nodes: [
    {
      id: 'start',
      type: 'n8n-nodes-base.start',
      position: [100, 100],
      parameters: {}
    },
    {
      id: 'mcp-tool',
      type: 'n8n-nodes-base.mcpServer',
      position: [300, 100],
      parameters: {
        operation: 'executeTool',
        toolName: 'searchWeb',
        arguments: {
          query: '{{$json.searchQuery}}'
        }
      }
    }
  ],
  connections: {
    'start': {
      main: [[{ node: 'mcp-tool', type: 'main', index: 0 }]]
    }
  }
});
```

#### Execute a Workflow
```typescript
async function executeWorkflow(workflowId: string, inputData?: any): Promise<Execution> {
  const response = await fetch(`/api/v1/workflows/${workflowId}/execute`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      data: inputData || {}
    })
  });

  return response.json();
}

// Execute with MCP data
const execution = await executeWorkflow('workflow-id', {
  searchQuery: 'AI automation tools',
  mcpServer: 'localhost:8080'
});
```

#### Monitor Workflow Execution
```typescript
async function getExecutionStatus(executionId: string): Promise<ExecutionStatus> {
  const response = await fetch(`/api/v1/executions/${executionId}`, {
    headers: { 'X-N8N-API-KEY': apiKey }
  });

  return response.json();
}

// Poll for completion
async function waitForExecution(executionId: string): Promise<ExecutionResult> {
  while (true) {
    const status = await getExecutionStatus(executionId);
    
    if (status.finished) {
      return status;
    }
    
    if (status.stoppedAt && status.mode === 'error') {
      throw new Error(`Execution failed: ${status.data?.resultData?.error?.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
```

### Credential Management

#### Create MCP Server Credentials
```typescript
async function createMCPCredentials(mcpServerConfig: MCPServerConfig): Promise<Credential> {
  const response = await fetch('/api/v1/credentials', {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: mcpServerConfig.name,
      type: 'mcpServerApi',
      data: {
        serverUrl: mcpServerConfig.url,
        apiKey: mcpServerConfig.apiKey,
        authType: mcpServerConfig.authType || 'bearer'
      }
    })
  });

  return response.json();
}
```

#### Use Credentials in Workflows
```typescript
// Reference credentials in node configuration
const nodeWithCredentials = {
  id: 'mcp-node',
  type: 'n8n-nodes-base.mcpServer',
  credentials: {
    mcpServerApi: {
      id: 'credential-id',
      name: 'MCP Server Credentials'
    }
  },
  parameters: {
    operation: 'listTools',
    serverUrl: '={{$credentials.serverUrl}}'
  }
};
```

### Real-time Communication

#### WebSocket Connection
```typescript
class N8nWebSocketClient {
  private ws: WebSocket | null = null;

  async connect(sessionId: string): Promise<void> {
    const wsUrl = `wss://your-n8n-instance/rest/push?sessionId=${sessionId}`;
    
    this.ws = new WebSocket(wsUrl, {
      headers: {
        'X-N8N-API-KEY': apiKey
      }
    });

    this.ws.on('open', () => {
      console.log('Connected to n8n WebSocket');
      
      // Send ping to maintain connection
      setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    });

    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      this.handleMessage(message);
    });
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case 'executionStarted':
        console.log('Execution started:', message.data);
        break;
      
      case 'executionFinished':
        console.log('Execution completed:', message.data);
        break;
      
      case 'executionProgress':
        console.log('Execution progress:', message.data);
        break;
      
      case 'pong':
        // Heartbeat response
        break;
    }
  }
}
```

### User and Project Management

#### Create Project for MCP Integration
```typescript
async function createMCPProject(name: string): Promise<Project> {
  const response = await fetch('/api/v1/projects', {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      type: 'team',
      settings: {
        description: 'MCP Server Integration Project'
      }
    })
  });

  return response.json();
}
```

#### Assign Users to MCP Project
```typescript
async function addUserToProject(projectId: string, userId: string, role: string): Promise<void> {
  await fetch(`/api/v1/projects/${projectId}/users`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId,
      role // 'project:admin', 'project:editor', 'project:viewer'
    })
  });
}
```

## Advanced Integration Patterns

### Dynamic Node Creation

#### MCP Tool to n8n Node Converter
```typescript
class MCPToN8nConverter {
  async convertMCPToolToNode(mcpTool: MCPTool): Promise<INodeTypeDescription> {
    return {
      displayName: mcpTool.name,
      name: this.sanitizeName(mcpTool.name),
      icon: 'fa:cog',
      group: ['transform'],
      version: [1],
      description: mcpTool.description,
      defaults: {
        name: mcpTool.name
      },
      inputs: ['main'],
      outputs: ['main'],
      credentials: [
        {
          name: 'mcpServerApi',
          required: true
        }
      ],
      properties: await this.convertParameters(mcpTool.inputSchema)
    };
  }

  private async convertParameters(schema: JSONSchema): Promise<INodeProperties[]> {
    const properties: INodeProperties[] = [];
    
    for (const [name, propSchema] of Object.entries(schema.properties)) {
      properties.push({
        displayName: this.formatDisplayName(name),
        name,
        type: this.mapSchemaType(propSchema.type),
        default: propSchema.default || '',
        description: propSchema.description || '',
        required: schema.required?.includes(name) || false
      });
    }

    return properties;
  }
}
```

### Error Handling

#### Comprehensive Error Management
```typescript
class N8nMCPErrorHandler {
  handleAPIError(error: any, context: string): void {
    if (error.response?.status === 401) {
      throw new Error(`Authentication failed for ${context}. Check API key.`);
    }
    
    if (error.response?.status === 403) {
      throw new Error(`Access denied for ${context}. Check permissions.`);
    }
    
    if (error.response?.status === 404) {
      throw new Error(`Resource not found for ${context}.`);
    }
    
    if (error.response?.status === 429) {
      throw new Error(`Rate limit exceeded for ${context}. Retry later.`);
    }

    throw new Error(`n8n API error in ${context}: ${error.message}`);
  }

  async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    backoffMs: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) break;
        
        const delay = backoffMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
```

## Best Practices

### Connection Management
1. **Connection Pooling**: Maintain persistent connections for frequently used APIs
2. **Authentication Caching**: Cache authentication tokens and refresh as needed
3. **Rate Limiting**: Implement client-side rate limiting to respect API limits
4. **Retry Logic**: Use exponential backoff for transient errors

### Data Handling
1. **Schema Validation**: Validate all API requests and responses
2. **Type Safety**: Use TypeScript interfaces for all API data structures
3. **Error Boundaries**: Implement comprehensive error handling and logging
4. **Data Sanitization**: Sanitize user input before sending to n8n APIs

### Performance Optimization
1. **Batch Operations**: Group multiple API calls when possible
2. **Caching**: Cache frequently accessed data like workflow definitions
3. **Streaming**: Use WebSocket or SSE for real-time updates
4. **Pagination**: Handle large result sets with proper pagination

### Security Considerations
1. **Credential Security**: Never log or expose API keys and passwords
2. **Input Validation**: Validate all inputs to prevent injection attacks
3. **Access Control**: Implement proper role-based access control
4. **Audit Logging**: Log all API interactions for security auditing

## Example: Complete MCP-n8n Integration

### MCP Server Integration Class
```typescript
export class N8nMCPIntegration {
  private apiKey: string;
  private baseUrl: string;
  private wsClient: N8nWebSocketClient;

  constructor(config: N8nConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.wsClient = new N8nWebSocketClient();
  }

  async initialize(): Promise<void> {
    // Establish WebSocket connection
    await this.wsClient.connect();
    
    // Verify API connectivity
    await this.healthCheck();
    
    // Set up MCP server credentials
    await this.setupMCPCredentials();
  }

  async createMCPWorkflow(mcpTools: MCPTool[]): Promise<string> {
    // Convert MCP tools to n8n nodes
    const nodes = await this.convertMCPToolsToNodes(mcpTools);
    
    // Create workflow
    const workflow = await this.createWorkflow({
      name: 'Generated MCP Workflow',
      nodes,
      connections: this.generateConnections(nodes)
    });

    return workflow.id;
  }

  async executeMCPWorkflow(workflowId: string, input: any): Promise<any> {
    // Execute workflow
    const execution = await this.executeWorkflow(workflowId, input);
    
    // Wait for completion
    const result = await this.waitForExecution(execution.id);
    
    // Return processed results
    return this.processExecutionResults(result);
  }
}
```

This comprehensive guide provides the foundation for building robust MCP server integrations with the n8n fork, enabling powerful workflow automation capabilities combined with MCP's AI tool ecosystem.