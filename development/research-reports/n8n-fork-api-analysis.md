# n8n Fork API Analysis Report

Generated: 2025-08-08  
Source: `/Users/jeremyparker/Desktop/Claude Coding Projects/n8n-fork`

## Executive Summary

The n8n fork provides a comprehensive automation platform with extensive REST APIs, WebSocket real-time communication, and a plugin-based node architecture. This analysis identifies key integration points for updating our MCP server to align with the fork's capabilities.

## Core Architecture Overview

### Technology Stack
- **Runtime**: Node.js 20+ with TypeScript 5.9.2
- **Package Manager**: pnpm 10.12.1 with workspaces  
- **Build System**: Turbo 2.5.4 for monorepo orchestration
- **Database**: SQLite, PostgreSQL, MySQL via TypeORM 0.3.20
- **Frontend**: Vue 3.5.13 with Vite 6.3.5

### Key Packages
- `packages/cli`: Main server and CLI application
- `packages/core`: Core workflow execution engine
- `packages/workflow`: Workflow definition system
- `packages/nodes-base`: 400+ built-in integrations
- `packages/@n8n/api-types`: TypeScript API definitions

## REST API Endpoints

### Base URL: `/api/v1`

#### **Workflow Management**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/workflows` | GET, POST | List/Create workflows |
| `/workflows/{id}` | GET, PUT, DELETE | Manage specific workflow |
| `/workflows/{id}/activate` | PUT | Activate workflow |
| `/workflows/{id}/deactivate` | PUT | Deactivate workflow |
| `/workflows/{id}/tags` | GET, PUT | Manage workflow tags |

#### **Execution Management**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/executions` | GET | List workflow executions |
| `/executions/{id}` | GET | Get execution details |

#### **Credential Management**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/credentials` | GET, POST | List/Create credentials |
| `/credentials/{id}` | GET, PUT, DELETE | Manage credentials |
| `/credentials/schema/{credentialTypeName}` | GET | Get credential schema |

#### **User & Project Management**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/users` | GET, POST | List/Create users |
| `/users/{id}` | GET, PUT, DELETE | Manage users |
| `/projects` | GET, POST | List/Create projects |
| `/projects/{projectId}` | GET, PUT, DELETE | Manage projects |

## Authentication Mechanisms

### 1. API Key Authentication
- **Header**: `X-N8N-API-KEY: <api-key>`
- **Service**: `PublicApiKeyService`
- **Scopes**: Granular permissions support

### 2. Session-Based Authentication
- **Endpoint**: `POST /login`
- **Support**: Email/password, LDAP, MFA (TOTP)
- **Session**: Express sessions with cookies

### 3. OAuth 2.0 & OAuth 1.0
- **Controllers**: `OAuth1CredentialController`, `OAuth2CredentialController`
- **Flows**: Authorization code, client credentials

### 4. Enterprise SSO
- **SAML**: Full SAML 2.0 implementation (`/sso/saml/*`)
- **OIDC**: OpenID Connect support (`/sso/oidc/*`)
- **LDAP**: Active Directory integration

## Real-time Communication

### WebSocket API
- **Endpoint**: WebSocket upgrade at `/rest/push`
- **Features**:
  - Real-time execution updates
  - Bidirectional messaging
  - Heartbeat mechanism (ping/pong)
  - Automatic reconnection support

### Server-Sent Events (SSE)
- **Fallback**: `SSEPush` for WebSocket-restricted environments
- **Streaming**: Execution progress, workflow changes

## Node Architecture

### Node Structure
Each integration follows a consistent pattern:

```typescript
export class NodeName implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Integration Name',
    name: 'nodeName',
    icon: 'file:icon.svg',
    group: ['input'],
    version: [1],
    credentials: [...],
    properties: [...],
  };
  
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    // Implementation logic
  }
}
```

### Key Node Interfaces
- **IExecuteFunctions**: Execution context with helpers
- **INodeExecutionData**: Standard data format between nodes
- **INodeTypeDescription**: Node metadata and configuration

## Database Schema

### Core Entities
- **WorkflowEntity**: Workflow definitions and metadata
- **ExecutionEntity**: Workflow execution records  
- **CredentialsEntity**: Secure credential storage
- **WebhookEntity**: Webhook configurations
- **UserEntity**: User management
- **ProjectEntity**: Workspace organization

## Extension Points

### 1. Custom Nodes
- Plugin system for new integrations
- Dynamic loading at runtime
- Community package support

### 2. Extension SDK
- `@n8n/extension-sdk` for building extensions
- Frontend (Vue.js) and backend extension APIs
- JSON schema validation

### 3. Webhook System
- Custom trigger implementations
- Dynamic webhook creation
- Production and test webhook endpoints

## Integration Recommendations for MCP Server

### Primary Integration Strategies

1. **Custom Node Development**
   - Create MCP-specific nodes that communicate with MCP servers
   - Handle MCP protocol abstraction
   - Provide dynamic tool discovery

2. **REST API Integration**
   - Use n8n's API to create workflows programmatically
   - Monitor execution status
   - Manage MCP server credentials

3. **Extension Development**
   - Build n8n extension for MCP server management
   - Visual workflow building for MCP tools
   - MCP protocol UI abstractions

### Key Implementation Areas

1. **Node Registration**: Register MCP tools as n8n nodes
2. **Credential Management**: Secure MCP server connections
3. **Dynamic Discovery**: Auto-discover MCP capabilities  
4. **Execution Context**: Bridge n8n and MCP execution models
5. **Error Handling**: Map MCP errors to n8n patterns

## Next Steps

Based on this analysis, the following tasks have been identified for aligning our MCP server:

1. Update API client to support n8n fork's REST API v1
2. Implement authentication mechanisms (API keys, OAuth)
3. Create MCP-to-n8n node conversion utilities
4. Build real-time communication bridge (WebSocket/SSE)
5. Develop workflow management integration
6. Implement credential management for MCP servers
7. Create dynamic node discovery from MCP capabilities
8. Build execution monitoring and logging integration

This research provides the foundation for updating our MCP server to fully leverage the n8n fork's extensive automation capabilities and integration architecture.