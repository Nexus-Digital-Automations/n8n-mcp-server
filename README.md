# n8n MCP Server

A powerful **FastMCP-based** Model Context Protocol server that provides comprehensive access to n8n workflows, executions, credentials, and more. Built with the modern [FastMCP TypeScript framework](https://fastmcp.org), this server enables Large Language Models (LLMs) to interact with n8n instances in a secure, standardized, and feature-rich way.

## ✨ Features

### 🚀 FastMCP Enhanced Features
- **Modern FastMCP Framework**: Built on the latest FastMCP TypeScript framework for superior performance
- **Multiple Transport Support**: Both stdio (local) and SSE (Server-Sent Events for remote access)
- **Authentication & Authorization**: Optional role-based access control with enterprise feature detection
- **Real-time Resources**: Dynamic access to workflows, executions, and n8n data through MCP resources
- **Structured Logging**: Comprehensive logging with FastMCP context integration
- **Progress Reporting**: Real-time progress updates for long-running operations

### 🔧 Core n8n Features
- **Workflow Management**: List, create, update, delete, activate/deactivate workflows
- **Execution Control**: View execution history, retry failed executions, stop running workflows
- **Credential Management**: Secure handling of n8n credentials and API keys
- **Enterprise Support**: Project management, user administration, variables (requires n8n Enterprise)
- **Tag Organization**: Manage workflow tags and categorization
- **Security Auditing**: Generate comprehensive security audit reports

## 📦 Installation

### Option 1: Install from npm (Recommended)

```bash
npm install -g @illuminaresolutions/n8n-mcp-server
```

### Option 2: Install from Source

```bash
git clone https://github.com/illuminaresolutions/n8n-mcp-server.git
cd n8n-mcp-server
npm install
npm run build
```

## 🔑 Get Your n8n API Key

1. Log into your n8n instance
2. Click your user icon in the bottom left
3. Go to **Settings** → **API**
4. Click **"Create API Key"**
5. Copy your API key (you won't be able to see it again)

## ⚙️ Configuration

### 🖥️ Claude Desktop Configuration

**Basic Configuration (Stdio Transport)**:
```json
{
  "mcpServers": {
    "n8n": {
      "command": "n8n-mcp-server",
      "env": {
        "N8N_BASE_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Advanced Configuration (SSE Transport)**:
```json
{
  "mcpServers": {
    "n8n": {
      "command": "n8n-mcp-server",
      "env": {
        "N8N_BASE_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key-here",
        "N8N_MCP_TRANSPORT": "sse",
        "N8N_MCP_SSE_PORT": "8080",
        "N8N_MCP_SSE_HOST": "localhost"
      }
    }
  }
}
```

**Configuration File Location**:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### 🔧 Cline (VS Code) Configuration

1. Install the server (follow Installation steps above)
2. Open VS Code and access Cline extension
3. Click 'MCP Servers' → 'Configure MCP Servers'
4. Add configuration:

```json
{
  "mcpServers": {
    "n8n": {
      "command": "n8n-mcp-server",
      "env": {
        "N8N_BASE_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 🌐 Remote Access with SSE Transport

For web-based access or remote connections, configure SSE transport:

**Environment Variables**:
```bash
export N8N_MCP_TRANSPORT=sse
export N8N_MCP_SSE_PORT=8080
export N8N_MCP_SSE_HOST=localhost
export N8N_MCP_SSE_ENDPOINT=/sse
```

**Claude Desktop Configuration**:
```json
{
  "mcpServers": {
    "n8n-remote": {
      "command": "npx",
      "args": ["@modelcontextprotocol/inspector", "http://localhost:8080/sse"],
      "env": {
        "N8N_BASE_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## 🔐 Authentication & Authorization

The server supports optional authentication with role-based access control:

**Environment Variables**:
```bash
# Enable authentication (default: false)
export N8N_MCP_AUTH_REQUIRED=true

# Default credentials (for fallback)
export N8N_BASE_URL=https://your-n8n-instance.com
export N8N_API_KEY=your-default-api-key

# Authentication settings
export N8N_MCP_VALIDATE_CONNECTION=true
export N8N_MCP_AUTH_CACHE_DURATION=300000  # 5 minutes
export N8N_MCP_DEFAULT_ROLES=member,editor
```

**Per-Request Authentication** (via headers):
- `X-N8N-API-Key`: Your n8n API key
- `X-N8N-Base-URL`: Your n8n instance URL
- `Authorization`: Bearer token format

## 📚 Available Tools

### Core Workflow Tools
- `init-n8n` - Initialize connection to n8n instance
- `list-workflows` - List all workflows with filtering options
- `get-workflow` - Get detailed workflow information
- `create-workflow` - Create new workflows from definitions
- `update-workflow` - Update existing workflow configurations
- `delete-workflow` - Remove workflows (with confirmation)
- `activate-workflow` - Enable workflow execution
- `deactivate-workflow` - Disable workflow execution

### Execution Management
- `list-executions` - View execution history with filtering
- `get-execution` - Get detailed execution information
- `delete-execution` - Remove execution records
- `retry-execution` - Retry failed executions
- `stop-execution` - Stop currently running executions

### Enterprise Features (Requires n8n Enterprise License)
- `list-projects` - Project management
- `create-project` - Create new projects
- `get-project` - Project details
- `update-project` - Modify project settings
- `delete-project` - Remove projects
- `list-variables` - Environment variable management
- `create-variable` - Create environment variables
- `get-variable` - Retrieve variable values
- `update-variable` - Modify variables
- `delete-variable` - Remove variables

### User Management (Admin Only)
- `list-users` - List all users
- `create-user` - Create new user accounts
- `get-user` - Get user details
- `update-user` - Modify user information
- `delete-user` - Remove user accounts

### Additional Tools
- `list-credentials` - Credential management
- `list-tags` - Tag organization
- `create-tag` - Create workflow tags
- `update-tag` - Modify tag information
- `delete-tag` - Remove tags
- `get-audit-logs` - Security audit reports
- `generate-audit-report` - Create comprehensive audit reports

## 🗃️ MCP Resources

Access n8n data through standardized MCP resources:

### Workflow Resources
- `n8n://workflows/list` - All workflows
- `n8n://workflows/active` - Active workflows only
- `n8n://workflows/stats` - Workflow statistics
- `n8n://workflows/{id}` - Individual workflow by ID

### Execution Resources
- `n8n://executions/recent` - Recent executions
- `n8n://executions/failures` - Failed executions
- `n8n://executions/stats` - Execution statistics
- `n8n://executions/{id}` - Individual execution by ID
- `n8n://executions/{id}/logs` - Execution logs
- `n8n://executions/workflow/{workflowId}` - Executions for specific workflow

### Information Resources
- `n8n://info` - n8n instance information
- `n8n://index` - Resource directory
- `n8n://nodes/available` - Available n8n nodes
- `n8n://nodes/{nodeType}` - Node documentation

## 📊 Project Status & Quality

### ✅ Current Project Health (Last Updated: 2025-07-31)

**Build Status**: ✅ **Passing** - TypeScript compilation clean, no build errors  
**Test Coverage**: ✅ **78.67%** - Comprehensive test suite with 78 passing tests  
**Code Quality**: ✅ **Excellent** - Zero linting errors, proper formatting  
**E2E Testing**: ✅ **18 Tests Passing** - Full protocol compliance validated  

### Test Coverage Breakdown
- **Unit Tests**: 60 tests covering core functionality
- **E2E Tests**: 18 tests validating MCP protocol compliance
- **Integration Tests**: MockN8n server setup for reliable testing
- **Coverage Highlights**:
  - 100% coverage on critical modules (client, tools, authentication)
  - 90%+ coverage on resource management and transport layers
  - Comprehensive error handling and edge case testing

### Quality Metrics
- **TypeScript**: Strict compilation with no type errors
- **ESLint**: Zero violations across entire codebase
- **Prettier**: Consistent code formatting enforced
- **Security**: No known vulnerabilities, secure credential handling
- **Performance**: Efficient resource management and connection pooling

## 🚨 Validation & Testing

### Quick Validation
1. Restart your LLM application after configuration
2. Ask: **"List my n8n workflows"**
3. You should see your workflows listed

### Advanced Testing
```bash
# Test with FastMCP CLI
npx fastmcp dev n8n-mcp-server

# Test with MCP Inspector
npx fastmcp inspect n8n-mcp-server

# Test SSE transport
curl -N -H "Accept: text/event-stream" http://localhost:8080/sse
```

### Test Commands
```bash
npm test                    # Run all tests (unit + e2e)
npm run test:unit          # Unit tests only (60 tests)
npm run test:e2e           # E2E protocol tests (18 tests)  
npm run test:coverage      # Generate coverage report
npm run build              # Verify build process
npm run lint               # Check code quality
```

## 🔍 Troubleshooting

### Common Issues

**"Client not initialized"**
- Verify `N8N_BASE_URL` and `N8N_API_KEY` are set correctly
- Ensure n8n instance is accessible and running
- Check API key permissions in n8n settings

**"License required" errors**
- You're trying to use Enterprise features
- Either upgrade to n8n Enterprise or use core features only
- Check feature availability with `get-n8n-info`

**Connection Issues**
- Verify n8n instance is running and accessible
- Check URL protocol (http vs https)
- Remove trailing slash from `N8N_BASE_URL`
- Test direct API access: `curl https://your-n8n-instance.com/api/v1/workflows`

**SSE Transport Issues**
- Ensure port is not in use: `lsof -i :8080`
- Check firewall settings for the specified port
- Verify CORS settings if accessing from web clients

**Authentication Problems**
- Check API key format and permissions
- Verify user roles in n8n match expected permissions
- Test with `N8N_MCP_VALIDATE_CONNECTION=false` for debugging

### Debug Logging

Enable detailed logging:
```bash
export DEBUG=fastmcp:*
export N8N_MCP_LOG_LEVEL=debug
```

View logs in Claude Desktop:
- **macOS**: `~/Library/Logs/Claude/`
- **Windows**: `%APPDATA%\Claude\logs\`

## 🔒 Security Best Practices

### API Key Management
- Use minimal required permissions
- Rotate keys regularly (monthly recommended)
- Never commit keys to version control
- Use environment variables or secure vaults
- Monitor API key usage in n8n audit logs

### Instance Security
- Always use HTTPS in production
- Enable n8n user authentication
- Keep n8n updated to latest version
- Use strong passwords and 2FA
- Regularly review user permissions

### Network Security
- Restrict network access to n8n instance
- Use VPN or private networks for remote access
- Configure proper firewall rules
- Monitor access logs regularly

## 🚀 Migration from Legacy MCP SDK

If migrating from the older @modelcontextprotocol/sdk version:

1. **Update Dependencies**: The server now uses FastMCP internally
2. **Configuration Changes**: Add new environment variables for FastMCP features
3. **Enhanced Features**: Access to new resources, authentication, and SSE transport
4. **Backward Compatibility**: All existing tools and functionality preserved

See our [Migration Guide](docs/migration-guide.md) for detailed instructions.

## 📖 Documentation

- [API Documentation](docs/api-reference.md) - Complete tool and resource reference
- [Configuration Guide](docs/configuration.md) - Advanced configuration options
- [Migration Guide](docs/migration-guide.md) - Upgrading from legacy versions
- [Troubleshooting Guide](docs/troubleshooting.md) - Common issues and solutions
- [Development Guide](docs/development.md) - Contributing and development setup

## 🛠️ Development & Contributing

### Development Setup
```bash
git clone https://github.com/illuminaresolutions/n8n-mcp-server.git
cd n8n-mcp-server
npm install
npm run dev
```

### Testing
```bash
npm test                    # Run all tests
npm run test:unit          # Unit tests only  
npm run test:integration   # Integration tests
npm run test:coverage      # Coverage report
```

### Code Quality
```bash
npm run lint              # ESLint checking
npm run lint:fix          # Auto-fix issues
npm run format            # Prettier formatting
npm run typecheck         # TypeScript validation
```

## 📄 License

[MIT License](LICENSE) - see LICENSE file for details.

## 🤝 Support & Community

- **GitHub Issues**: [Report bugs and request features](https://github.com/illuminaresolutions/n8n-mcp-server/issues)
- **n8n Documentation**: [Official n8n docs](https://docs.n8n.io)
- **FastMCP Framework**: [FastMCP documentation](https://fastmcp.org)
- **MCP Protocol**: [Model Context Protocol specification](https://modelcontextprotocol.io)

---

**Built with ❤️ using [FastMCP](https://fastmcp.org) - The modern TypeScript framework for MCP servers**