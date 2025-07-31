# Configuration Guide

Comprehensive configuration guide for the n8n MCP Server with FastMCP framework integration.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Transport Configuration](#transport-configuration)
- [Authentication Setup](#authentication-setup)
- [Resource Configuration](#resource-configuration)
- [Client Configuration](#client-configuration)
- [Advanced Configuration](#advanced-configuration)

## Environment Variables

### Core Configuration

```bash
# n8n Connection (Required)
export N8N_BASE_URL=https://your-n8n-instance.com
export N8N_API_KEY=your-api-key-here

# Transport Configuration
export N8N_MCP_TRANSPORT=stdio              # stdio | sse
export N8N_MCP_SERVER_NAME=n8n-mcp-server   # Server identifier
```

### SSE Transport Configuration

```bash
# SSE Server Settings
export N8N_MCP_SSE_HOST=localhost           # Server host
export N8N_MCP_SSE_PORT=8080                # Server port
export N8N_MCP_SSE_ENDPOINT=/sse            # SSE endpoint path

# CORS Configuration
export N8N_MCP_SSE_CORS_ENABLED=true        # Enable CORS
export N8N_MCP_SSE_CORS_ORIGINS=*           # Allowed origins (comma-separated)
export N8N_MCP_SSE_CORS_CREDENTIALS=false   # Allow credentials

# Health Check
export N8N_MCP_SSE_HEALTH_ENABLED=true      # Enable health endpoint
export N8N_MCP_SSE_HEALTH_ENDPOINT=/health  # Health check path
```

### Authentication Configuration

```bash
# Authentication Settings
export N8N_MCP_AUTH_REQUIRED=false          # Require authentication
export N8N_MCP_VALIDATE_CONNECTION=true     # Validate n8n connection
export N8N_MCP_AUTH_CACHE_DURATION=300000   # Cache duration (ms)
export N8N_MCP_DEFAULT_ROLES=member         # Default user roles (comma-separated)
```

### Resource Configuration

```bash
# Resource Settings
export N8N_MCP_RESOURCE_BASE_URI=n8n://            # Base URI for resources
export N8N_MCP_ENABLE_WORKFLOW_RESOURCES=true      # Enable workflow resources
export N8N_MCP_ENABLE_EXECUTION_RESOURCES=true     # Enable execution resources
export N8N_MCP_ENABLE_CREDENTIAL_RESOURCES=false   # Enable credential resources
export N8N_MCP_ENABLE_NODE_RESOURCES=true          # Enable node resources

# Resource Caching
export N8N_MCP_RESOURCE_CACHE_DURATION=300000      # Global cache duration (ms)
export N8N_MCP_RESOURCE_MAX_ITEMS=100              # Max items per resource
```

### Logging Configuration

```bash
# Logging Settings
export N8N_MCP_LOG_LEVEL=info               # debug | info | warn | error
export N8N_MCP_LOG_FORMAT=json              # json | text
export N8N_MCP_LOG_FILE=/var/log/n8n-mcp.log  # Log file path (optional)

# FastMCP Debug Logging
export DEBUG=fastmcp:*                      # Enable FastMCP debug logs
```

## Transport Configuration

### Stdio Transport (Default)

Best for local development and Claude Desktop integration.

**Environment Variables:**
```bash
export N8N_MCP_TRANSPORT=stdio
```

**Claude Desktop Configuration:**
```json
{
  "mcpServers": {
    "n8n": {
      "command": "n8n-mcp-server",
      "env": {
        "N8N_BASE_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key"
      }
    }
  }
}
```

### SSE Transport

Ideal for remote access, web applications, and distributed deployments.

**Environment Variables:**
```bash
export N8N_MCP_TRANSPORT=sse
export N8N_MCP_SSE_HOST=0.0.0.0  # Listen on all interfaces
export N8N_MCP_SSE_PORT=8080
export N8N_MCP_SSE_ENDPOINT=/sse
```

**Start Server:**
```bash
n8n-mcp-server
# Server will be available at http://localhost:8080/sse
```

**Claude Desktop Configuration:**
```json
{
  "mcpServers": {
    "n8n-remote": {
      "command": "npx",
      "args": ["@modelcontextprotocol/inspector", "http://localhost:8080/sse"]
    }
  }
}
```

### Hybrid Configuration

Run both transports simultaneously:

```bash
# Start stdio server
n8n-mcp-server &

# Start SSE server on different port
N8N_MCP_TRANSPORT=sse N8N_MCP_SSE_PORT=8081 n8n-mcp-server &
```

## Authentication Setup

### Anonymous Access (Default)

No authentication required - uses default n8n credentials:

```bash
export N8N_MCP_AUTH_REQUIRED=false
export N8N_BASE_URL=https://your-n8n-instance.com
export N8N_API_KEY=your-default-api-key
```

### Required Authentication

Force authentication for all requests:

```bash
export N8N_MCP_AUTH_REQUIRED=true
export N8N_MCP_VALIDATE_CONNECTION=true
export N8N_MCP_AUTH_CACHE_DURATION=300000  # 5 minutes
```

**Client Authentication Methods:**

1. **Headers (HTTP/SSE)**:
   ```bash
   curl -H "X-N8N-API-Key: your-key" \
        -H "X-N8N-Base-URL: https://your-instance.com" \
        http://localhost:8080/sse
   ```

2. **Authorization Header**:
   ```bash
   curl -H "Authorization: Bearer your-api-key" \
        http://localhost:8080/sse
   ```

### Role-Based Access Control

Configure default roles and permissions:

```bash
# Default roles for authenticated users
export N8N_MCP_DEFAULT_ROLES=member,editor

# Role mapping configuration
export N8N_MCP_ROLE_MAPPING='{
  "admin": ["admin", "editor", "member"],
  "editor": ["editor", "member"],  
  "member": ["member"]
}'
```

## Resource Configuration

### Enable/Disable Resource Types

```bash
# Workflow resources (always recommended)
export N8N_MCP_ENABLE_WORKFLOW_RESOURCES=true

# Execution resources (recommended for debugging)
export N8N_MCP_ENABLE_EXECUTION_RESOURCES=true

# Credential resources (security sensitive - disabled by default)
export N8N_MCP_ENABLE_CREDENTIAL_RESOURCES=false

# Node documentation resources
export N8N_MCP_ENABLE_NODE_RESOURCES=true
```

### Resource Caching Configuration

```bash
# Global cache settings
export N8N_MCP_RESOURCE_CACHE_DURATION=300000  # 5 minutes

# Per-resource cache duration (milliseconds)
export N8N_MCP_WORKFLOW_CACHE_DURATION=300000    # 5 minutes
export N8N_MCP_EXECUTION_CACHE_DURATION=120000   # 2 minutes (changes frequently)
export N8N_MCP_NODE_CACHE_DURATION=3600000       # 1 hour (static data)

# Cache size limits
export N8N_MCP_RESOURCE_MAX_ITEMS=100
export N8N_MCP_WORKFLOW_MAX_ITEMS=50
export N8N_MCP_EXECUTION_MAX_ITEMS=100
```

### Resource URI Configuration

```bash
# Customize resource URI base
export N8N_MCP_RESOURCE_BASE_URI=n8n://

# Resource URI examples:
# n8n://workflows/list
# n8n://executions/recent
# n8n://info
```

## Client Configuration

### Claude Desktop

**Basic Configuration:**
```json
{
  "mcpServers": {
    "n8n": {
      "command": "n8n-mcp-server",
      "env": {
        "N8N_BASE_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key"
      }
    }
  }
}
```

**Advanced Configuration:**
```json
{
  "mcpServers": {
    "n8n": {
      "command": "n8n-mcp-server",
      "env": {
        "N8N_BASE_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key",
        "N8N_MCP_TRANSPORT": "sse",
        "N8N_MCP_SSE_PORT": "8080",
        "N8N_MCP_AUTH_REQUIRED": "true",
        "N8N_MCP_LOG_LEVEL": "debug",
        "N8N_MCP_RESOURCE_CACHE_DURATION": "600000"
      }
    }
  }
}
```

### Cline (VS Code)

```json
{
  "mcpServers": {
    "n8n": {
      "command": "n8n-mcp-server",
      "env": {
        "N8N_BASE_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key",
        "N8N_MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

### Custom MCP Client

```typescript
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const client = new Client(
  {
    name: "my-n8n-client",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

const transport = new SSEClientTransport(
  new URL("http://localhost:8080/sse")
);

await client.connect(transport);
```

## Advanced Configuration

### Performance Tuning

```bash
# Connection pooling
export N8N_MCP_CONNECTION_POOL_SIZE=10
export N8N_MCP_CONNECTION_TIMEOUT=30000

# Request throttling
export N8N_MCP_RATE_LIMIT=100               # Requests per minute
export N8N_MCP_BURST_LIMIT=10               # Burst requests allowed

# Memory management
export N8N_MCP_MAX_CACHE_SIZE=100           # Max cached items
export N8N_MCP_CACHE_CLEANUP_INTERVAL=60000 # Cleanup interval (ms)
```

### Security Hardening

```bash
# Security settings
export N8N_MCP_VALIDATE_SSL=true            # Validate SSL certificates
export N8N_MCP_ALLOWED_HOSTS=localhost,127.0.0.1  # Allowed host list
export N8N_MCP_MAX_REQUEST_SIZE=1048576     # Max request size (bytes)

# Authentication hardening
export N8N_MCP_AUTH_CACHE_DURATION=300000   # Shorter cache for security
export N8N_MCP_FAILED_AUTH_LOCKOUT=3        # Failed attempts before lockout
export N8N_MCP_LOCKOUT_DURATION=900000      # Lockout duration (15 minutes)
```

### Development Configuration

```bash
# Development settings
export NODE_ENV=development
export N8N_MCP_LOG_LEVEL=debug
export N8N_MCP_VALIDATE_CONNECTION=false    # Skip validation for testing
export N8N_MCP_AUTH_REQUIRED=false          # Disable auth for testing
export DEBUG=fastmcp:*                      # Enable all FastMCP debug logs

# Hot reload support
export N8N_MCP_WATCH_FILES=true             # Watch for file changes
export N8N_MCP_RELOAD_ON_CHANGE=true        # Auto-reload on changes
```

### Production Configuration

```bash
# Production settings
export NODE_ENV=production
export N8N_MCP_LOG_LEVEL=warn
export N8N_MCP_VALIDATE_CONNECTION=true
export N8N_MCP_AUTH_REQUIRED=true

# Performance optimization
export N8N_MCP_RESOURCE_CACHE_DURATION=600000  # 10 minutes
export N8N_MCP_CONNECTION_POOL_SIZE=20
export N8N_MCP_RATE_LIMIT=1000                 # Higher limit for production

# Security
export N8N_MCP_VALIDATE_SSL=true
export N8N_MCP_FAILED_AUTH_LOCKOUT=5
```

### Docker Configuration

**Dockerfile Configuration:**
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 8080

# Default environment variables
ENV N8N_MCP_TRANSPORT=sse
ENV N8N_MCP_SSE_HOST=0.0.0.0
ENV N8N_MCP_SSE_PORT=8080
ENV N8N_MCP_LOG_LEVEL=info

CMD ["npm", "start"]
```

**Docker Compose:**
```yaml
version: '3.8'
services:
  n8n-mcp-server:
    build: .
    ports:
      - "8080:8080"
    environment:
      - N8N_BASE_URL=https://your-n8n-instance.com
      - N8N_API_KEY=${N8N_API_KEY}
      - N8N_MCP_TRANSPORT=sse
      - N8N_MCP_SSE_HOST=0.0.0.0
      - N8N_MCP_SSE_PORT=8080
      - N8N_MCP_LOG_LEVEL=info
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Kubernetes Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: n8n-mcp-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: n8n-mcp-server
  template:
    metadata:
      labels:
        app: n8n-mcp-server
    spec:
      containers:
      - name: n8n-mcp-server
        image: n8n-mcp-server:latest
        ports:
        - containerPort: 8080
        env:
        - name: N8N_BASE_URL
          value: "https://your-n8n-instance.com"
        - name: N8N_API_KEY
          valueFrom:
            secretKeyRef:
              name: n8n-secrets
              key: api-key
        - name: N8N_MCP_TRANSPORT
          value: "sse"
        - name: N8N_MCP_SSE_HOST
          value: "0.0.0.0"
        - name: N8N_MCP_SSE_PORT
          value: "8080"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: n8n-mcp-server-service
spec:
  selector:
    app: n8n-mcp-server
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: LoadBalancer
```

## Configuration Validation

### Validate Configuration

```bash
# Test configuration
n8n-mcp-server --validate-config

# Test n8n connection
n8n-mcp-server --test-connection

# Show current configuration
n8n-mcp-server --show-config
```

### Configuration Examples

**Development Setup:**
```bash
#!/bin/bash
export NODE_ENV=development
export N8N_BASE_URL=http://localhost:5678
export N8N_API_KEY=your-dev-api-key
export N8N_MCP_TRANSPORT=stdio
export N8N_MCP_LOG_LEVEL=debug
export N8N_MCP_AUTH_REQUIRED=false
export DEBUG=fastmcp:*

n8n-mcp-server
```

**Production Setup:**
```bash
#!/bin/bash
export NODE_ENV=production
export N8N_BASE_URL=https://your-production-n8n.com
export N8N_API_KEY=$(cat /etc/secrets/n8n-api-key)
export N8N_MCP_TRANSPORT=sse
export N8N_MCP_SSE_HOST=0.0.0.0
export N8N_MCP_SSE_PORT=8080
export N8N_MCP_LOG_LEVEL=warn
export N8N_MCP_AUTH_REQUIRED=true
export N8N_MCP_RESOURCE_CACHE_DURATION=600000

n8n-mcp-server
```

---

For more information, see:
- [API Reference](api-reference.md)
- [Troubleshooting Guide](troubleshooting.md)
- [Migration Guide](migration-guide.md)