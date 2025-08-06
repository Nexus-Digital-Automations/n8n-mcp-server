# n8n API Endpoint Analysis Report

## Executive Summary

This report provides a comprehensive analysis of all API endpoints available in the n8n-fork codebase. The analysis covers 43 controller files with over 300 distinct API endpoints across various functional areas.

## API Architecture Overview

n8n uses a decorator-based REST API architecture with:
- **RestController** decorators to define base paths
- **HTTP method decorators** (@Get, @Post, @Put, @Patch, @Delete) for endpoints
- **Middleware support** for authentication, authorization, and rate limiting
- **Enterprise features** with licensing controls

Base API path: `/rest/v1/` (configured via `endpoints.rest`)

## Complete API Endpoint Inventory

### 1. Authentication & Authorization (/auth, /oauth1-credential, /oauth2-credential)

#### Authentication Controller
- **POST /login** - User login with MFA support
- **GET /login** - Check current user authentication status
- **GET /resolve-signup-token** - Validate invitation token

#### OAuth Controllers
- **GET /oauth1-credential/auth** - OAuth1 authentication
- **GET /oauth1-credential/callback** - OAuth1 callback
- **GET /oauth2-credential/auth** - OAuth2 authentication
- **GET /oauth2-credential/callback** - OAuth2 callback

### 2. User Management (/users, /me, /owner, /invitations)

#### Users Controller (/users)
- **GET /** - List all users
- **POST /** - Create new user
- **GET /:id** - Get user by ID
- **PATCH /:id** - Update user
- **DELETE /:id** - Delete user
- **POST /:id/reinvite** - Reinvite user
- **POST /:id/password-reset-link** - Generate password reset
- **GET /:id/password-reset-link** - Get password reset status

#### Me Controller (/me)
- **GET /** - Get current user profile
- **PATCH /** - Update current user
- **PUT /password** - Change password
- **POST /survey** - Submit user survey
- **PUT /api-key** - Generate API key
- **DELETE /api-key** - Delete API key

#### Owner Controller (/owner)
- **POST /setup** - Initial owner setup
- **POST /skip-setup** - Skip setup wizard
- **POST /dismiss-banner** - Dismiss UI banner

#### Invitations Controller (/invitations)
- **GET /** - List invitations
- **POST /** - Create invitation
- **GET /:id** - Get invitation details
- **DELETE /:id** - Delete invitation
- **POST /:id/accept** - Accept invitation

### 3. Workflow Management (/workflows)

#### Core Workflow Operations
- **POST /** - Create workflow
- **GET /** - List workflows with filtering
- **GET /new** - Generate unique workflow name
- **GET /from-url** - Import workflow from URL
- **GET /:workflowId** - Get workflow by ID
- **PATCH /:workflowId** - Update workflow
- **DELETE /:workflowId** - Delete workflow
- **POST /:workflowId/archive** - Archive workflow
- **POST /:workflowId/unarchive** - Unarchive workflow

#### Workflow Execution
- **POST /:workflowId/run** - Execute workflow
- **POST /:workflowId/execute-partial** - Partial execution

#### Workflow Sharing & Transfer
- **PUT /:workflowId/share** - Share workflow
- **PUT /:workflowId/transfer** - Transfer ownership

#### Advanced Workflow Features
- **POST /with-node-types** - Get workflows by node types
- **POST /bulk/activate** - Bulk activate workflows
- **POST /bulk/deactivate** - Bulk deactivate workflows
- **POST /bulk/update** - Bulk update workflows

#### Workflow Search & Discovery
- **GET /search** - Basic workflow search
- **POST /search/advanced** - Advanced search
- **GET /search/suggestions** - Search suggestions
- **GET /search/facets** - Search facet data
- **GET /search/analytics** - Search analytics
- **GET /search/health** - Search system health
- **POST /search/reindex** - Reindex search

#### Saved Searches
- **POST /search/saved** - Create saved search
- **GET /search/saved** - List saved searches
- **GET /search/saved/:id** - Get saved search
- **PATCH /search/saved/:id** - Update saved search
- **DELETE /search/saved/:id** - Delete saved search
- **POST /search/saved/:id/execute** - Execute saved search
- **GET /search/saved/stats** - Saved search statistics

#### Expression & Documentation Support
- **GET /context/variables** - Get context variables
- **GET /context/functions** - Get available functions
- **GET /context/syntax** - Get expression syntax help
- **GET /context/help/:nodeType** - Node-specific help
- **GET /context/search** - Search documentation
- **GET /:workflowId/context** - Workflow context
- **GET /:workflowId/variables** - Workflow variables
- **GET /:workflowId/functions** - Workflow functions

#### Enterprise Batch Processing
- **POST /batch/process** - Process workflows in batches
- **GET /batch/:batchId/status** - Get batch processing status

#### AI-Enhanced Features
- **POST /:id/suggest-connections** - AI connection suggestions
- **GET /:id/optimization-suggestions** - AI optimization suggestions

#### Expression Documentation
- **GET /expressions/categories** - Expression categories
- **GET /expressions/functions/:category** - Functions by category
- **GET /expressions/variables/context** - Context variables

### 4. Execution Management (/executions)

#### Basic Execution Operations
- **GET /** - List executions with filtering
- **GET /:id** - Get execution details
- **PATCH /:id** - Update execution (annotations)
- **POST /:id/stop** - Stop execution
- **POST /:id/retry** - Retry execution
- **POST /delete** - Delete executions

#### Advanced Execution Control
- **POST /:id/cancel** - Cancel execution
- **POST /:id/retry-advanced** - Advanced retry with options
- **GET /:id/full-context** - Get full execution context
- **GET /:id/progress** - Get execution progress
- **POST /bulk-cancel** - Bulk cancel executions

#### Execution State Management
- **POST /:id/pause** - Pause execution
- **POST /:id/resume** - Resume execution
- **POST /:id/step** - Step through execution

#### Node-Level Control
- **GET /:id/node/:nodeName/status** - Get node status
- **POST /:id/node/:nodeName/retry** - Retry specific node
- **POST /:id/node/:nodeName/skip** - Skip specific node

#### Debugging Support
- **GET /:id/debug-info** - Get execution debug information

### 5. Credentials Management (/credentials)

#### Core Credential Operations
- **GET /** - List credentials
- **POST /** - Create credential
- **GET /new** - Generate unique credential name
- **GET /for-workflow** - Get project credentials
- **GET /:credentialId** - Get credential details
- **PATCH /:credentialId** - Update credential
- **DELETE /:credentialId** - Delete credential

#### Credential Testing & Validation
- **POST /test** - Test credential configuration
- **POST /validate** - Validate credential data
- **POST /troubleshoot** - Troubleshoot credential issues
- **POST /health-check** - Credential health check
- **POST /:credentialId/test** - Test specific credential

#### Credential Sharing & Transfer
- **PUT /:credentialId/share** - Share credential
- **PUT /:credentialId/transfer** - Transfer credential ownership

### 6. Node Management (/node-types, /ai-nodes, /dynamic-node-parameters)

#### Node Types Controller (/node-types)
- **GET /** - List available node types
- **GET /:nodeType** - Get node type details

#### AI Nodes Controller (/ai-nodes)
- **GET /** - List AI-enabled nodes
- **POST /classify** - Classify node for AI features
- **GET /:nodeType/suggestions** - Get AI suggestions for node

#### Dynamic Node Parameters (/dynamic-node-parameters)
- **GET /options** - Get dynamic parameter options
- **POST /resource-locator** - Get resource locator options

### 7. AI Integration (/ai, /ai-helpers)

#### AI Controller (/ai)
- **POST /build** - AI workflow builder
- **POST /chat** - AI chat interface
- **POST /chat/apply-suggestion** - Apply AI suggestions
- **POST /ask-ai** - General AI queries
- **POST /free-credits** - Claim AI free credits
- **POST /sessions** - Create AI session

#### AI Helpers Controller (/ai-helpers)
- **GET /node-creator-suggestions** - Node creation suggestions
- **POST /workflow-suggestions** - Workflow enhancement suggestions
- **GET /context-analysis** - Analyze workflow context
- **POST /error-diagnosis** - Diagnose workflow errors

### 8. Project Management (/projects, /folders, /tags)

#### Projects Controller (/projects)
- **GET /** - List projects
- **POST /** - Create project
- **GET /:projectId** - Get project details
- **PATCH /:projectId** - Update project
- **DELETE /:projectId** - Delete project
- **GET /:projectId/users** - List project users
- **POST /:projectId/users** - Add user to project
- **PATCH /:projectId/users/:userId** - Update user role
- **DELETE /:projectId/users/:userId** - Remove user from project

#### Folders Controller (/projects/:projectId/folders)
- **GET /** - List folders in project
- **POST /** - Create folder
- **GET /:folderId** - Get folder details
- **PATCH /:folderId** - Update folder
- **DELETE /:folderId** - Delete folder

#### Tags Controller (/tags)
- **GET /** - List tags
- **POST /** - Create tag
- **GET /:id** - Get tag details
- **PATCH /:id** - Update tag
- **DELETE /:id** - Delete tag

### 9. Community & Extensions (/community-packages, /community-node-types)

#### Community Packages Controller (/community-packages)
- **POST /** - Install community package
- **GET /** - List installed packages
- **DELETE /** - Uninstall package
- **PATCH /** - Update package

#### Community Node Types Controller (/community-node-types)
- **GET /** - List community node types
- **GET /:name** - Get specific node type

### 10. System Administration & Monitoring

#### System Monitoring Controller (/system-monitoring)
- **GET /health** - System health check
- **GET /metrics** - System metrics
- **GET /performance** - Performance metrics
- **POST /diagnostic** - Run system diagnostic

#### Performance Monitoring Controller (/performance-monitoring)
- **GET /metrics** - Performance metrics
- **GET /trends** - Performance trends
- **POST /analyze** - Analyze performance data

#### Backup Controller (/backup)
- **POST /create** - Create system backup
- **GET /list** - List available backups
- **POST /restore** - Restore from backup
- **DELETE /:backupId** - Delete backup

#### Audit Controller (/audit)
- **GET /events** - List audit events
- **GET /events/statistics** - Audit statistics
- **POST /events** - Create audit event
- **PUT /events/:id/review** - Review audit event
- **GET /security/events** - Security events
- **GET /security/metrics** - Security metrics
- **PUT /security/events/:id/acknowledge** - Acknowledge security event
- **PUT /security/events/:id/resolve** - Resolve security event
- **GET /compliance/reports** - Compliance reports
- **POST /compliance/reports** - Generate compliance report
- **GET /compliance/reports/:id/download** - Download report

### 11. Multi-Factor Authentication (/mfa)
- **POST /enforce-mfa** - Enforce MFA for organization
- **POST /can-enable** - Check if MFA can be enabled
- **GET /qr** - Get QR code for MFA setup
- **POST /enable** - Enable MFA
- **POST /disable** - Disable MFA
- **POST /verify** - Verify MFA token

### 12. Enterprise Features

#### Enhanced Roles Controller (/roles/enhanced)
- **GET /permissions** - List permissions
- **POST /permissions/validate** - Validate permissions
- **GET /** - List enhanced roles
- **POST /** - Create enhanced role
- **PATCH /:roleId** - Update role
- **DELETE /:roleId** - Delete role
- **POST /assignments** - Assign roles
- **POST /assignments/bulk** - Bulk role assignments
- **POST /check-permission** - Check specific permission
- **POST /check-permissions/batch** - Batch permission checks
- **GET /:roleId/analytics** - Role analytics
- **GET /analytics/overview** - Analytics overview
- **GET /users/:userId/roles** - User role assignments
- **GET /users/:userId/permissions** - User permissions
- **GET /templates** - Role templates

#### License Controller (/license)
- **GET /** - Get license information
- **POST /enterprise/request_trial** - Request enterprise trial
- **POST /enterprise/community-registered** - Register community version
- **POST /activate** - Activate license
- **POST /renew** - Renew license

### 13. Event System & Analytics

#### Events Controller (/events)
- **GET /session-started** - Track session start

#### Event Bus Controller (/eventbus)
- **GET /eventnames** - List event names
- **GET /destination** - Get event destinations
- **POST /destination** - Create event destination
- **GET /testmessage** - Test event message
- **DELETE /destination** - Delete event destination

#### Analytics Controller (/analytics)
- **GET /workflow-stats** - Workflow statistics
- **GET /execution-stats** - Execution statistics
- **POST /track-event** - Track custom event

#### Workflow Statistics Controller (/workflow-stats)
- **GET /summary** - Workflow statistics summary
- **GET /popular-nodes** - Most popular nodes
- **GET /execution-trends** - Execution trend data

### 14. Binary Data Management (/binary-data)
- **GET /:fileId** - Get binary file
- **POST /** - Upload binary data
- **DELETE /:fileId** - Delete binary file

### 15. Orchestration & Scaling (/orchestration, /active-workflows)

#### Orchestration Controller (/orchestration)
- **POST /worker/status** - Update worker status
- **GET /worker/status** - Get worker status

#### Active Workflows Controller (/active-workflows)
- **GET /** - List active workflows
- **POST /:id/activate** - Activate workflow
- **POST /:id/deactivate** - Deactivate workflow

### 16. Resource Transfer (/transfer)
- **POST /credentials** - Transfer credentials
- **POST /workflows** - Transfer workflows
- **GET /status/:transferId** - Get transfer status

### 17. User Settings (/user-settings)
- **GET /** - Get user settings
- **PATCH /** - Update user settings
- **POST /reset** - Reset settings to defaults

### 18. API Keys Management (/api-keys)
- **GET /** - List API keys
- **POST /** - Create API key
- **DELETE /:keyId** - Delete API key

### 19. Insights & Reporting (/insights)
- **GET /summary** - Usage summary
- **GET /by-workflow** - Insights by workflow
- **GET /by-time** - Time-based insights
- **GET /by-time/time-saved** - Time saved metrics

### 20. Webhooks (/webhooks)
- **POST /find** - Find webhook configuration

### 21. Debug Support (/debug)
- **GET /info** - System debug information
- **POST /logs** - Submit debug logs

### 22. Call-to-Action (/cta)
- **GET /** - Get CTA configurations
- **POST /dismiss** - Dismiss CTA

### 23. Translation Support (/)
- **GET /types/credentials.json** - Credential type translations
- **GET /types/nodes.json** - Node type translations

### 24. Telemetry (/telemetry)
- **POST /** - Submit telemetry data

### 25. E2E Testing (/e2e)
- **POST /db/reset** - Reset database for testing
- **POST /db/setup-owner** - Setup test owner

### 26. Password Reset
- **POST /forgot-password** - Request password reset
- **GET /resolve-password-token** - Validate reset token
- **POST /change-password** - Change password with token

## Public API (v1)

The n8n also exposes a separate Public API at `/api/v1/` with the following endpoints:

### Workflows
- **GET /workflows** - List workflows
- **POST /workflows** - Create workflow
- **GET /workflows/:id** - Get workflow
- **PUT /workflows/:id** - Update workflow
- **DELETE /workflows/:id** - Delete workflow
- **POST /workflows/:id/activate** - Activate workflow
- **POST /workflows/:id/deactivate** - Deactivate workflow

### Executions
- **GET /executions** - List executions
- **GET /executions/:id** - Get execution
- **DELETE /executions/:id** - Delete execution

### Credentials
- **GET /credentials** - List credentials
- **POST /credentials** - Create credential
- **GET /credentials/:id** - Get credential
- **PUT /credentials/:id** - Update credential
- **DELETE /credentials/:id** - Delete credential

### Users (Enterprise)
- **GET /users** - List users
- **POST /users** - Create user
- **GET /users/:id** - Get user
- **PUT /users/:id** - Update user
- **DELETE /users/:id** - Delete user

### Tags
- **GET /tags** - List tags
- **POST /tags** - Create tag
- **GET /tags/:id** - Get tag
- **PUT /tags/:id** - Update tag
- **DELETE /tags/:id** - Delete tag

### Variables
- **GET /variables** - List variables
- **POST /variables** - Create variable
- **GET /variables/:id** - Get variable
- **PUT /variables/:id** - Update variable
- **DELETE /variables/:id** - Delete variable

### Projects
- **GET /projects** - List projects
- **POST /projects** - Create project
- **GET /projects/:id** - Get project
- **PUT /projects/:id** - Update project
- **DELETE /projects/:id** - Delete project

## API Features & Capabilities

### Authentication & Security
- JWT-based authentication
- Multi-factor authentication (MFA)
- OAuth1 & OAuth2 support  
- API key authentication
- Role-based access control (RBAC)
- Enhanced permissions system (Enterprise)

### Enterprise Features
- Advanced user management
- Enhanced role system
- Audit logging
- Compliance reporting
- Advanced execution filtering
- Batch operations

### AI Integration
- AI-powered workflow building
- Intelligent node suggestions
- Error diagnosis and troubleshooting
- Context-aware help system
- Natural language workflow queries

### Search & Discovery
- Full-text workflow search
- Advanced search with filters
- Search suggestions and facets
- Saved searches with analytics
- Search performance monitoring

### Execution Control
- Standard execution operations (start, stop, retry)
- Advanced execution control (pause, resume, step)
- Node-level execution control
- Bulk execution operations
- Real-time execution monitoring

### Extensibility
- Community package management
- Custom node development support
- Dynamic parameter loading
- Plugin system integration

### Developer Experience
- Comprehensive REST API
- OpenAPI/Swagger documentation
- Expression documentation system
- Debug and troubleshooting tools
- Development utilities

## Gaps Analysis for MCP Server Implementation

Based on this analysis, the following areas may need attention in the current MCP server implementation:

### Missing Core Features
1. **Execution Control** - Advanced execution management (pause, resume, step, node-level control)
2. **AI Integration** - AI-powered features like workflow building and suggestions
3. **Search & Discovery** - Advanced search capabilities with filtering and faceting
4. **Project Management** - Full project and folder management
5. **Enterprise Features** - Enhanced roles, audit logging, compliance
6. **Community Packages** - Package installation and management
7. **Binary Data** - File upload and management
8. **Real-time Features** - WebSocket connections, live updates

### Authentication Gaps
1. **OAuth Support** - OAuth1/OAuth2 credential handling
2. **MFA Implementation** - Multi-factor authentication
3. **API Key Management** - Generate and manage API keys
4. **Enhanced Permissions** - Granular permission system

### Advanced Workflow Features
1. **Bulk Operations** - Batch processing of workflows and executions
2. **Sharing & Transfer** - Resource sharing between users/projects
3. **Archiving** - Workflow archiving and management
4. **Expression Support** - Advanced expression evaluation and documentation

### Monitoring & Analytics
1. **System Monitoring** - Health checks, metrics, performance monitoring
2. **Audit Logging** - Comprehensive audit trail
3. **Analytics** - Usage statistics and insights
4. **Backup/Restore** - Data backup and recovery

## Recommendations

1. **Prioritize Core Workflow Operations** - Focus on basic CRUD operations for workflows, executions, and credentials
2. **Implement Incremental Features** - Add advanced features like search and AI integration in phases
3. **Consider Enterprise vs Community** - Identify which features require enterprise licensing
4. **API Versioning Strategy** - Plan for both REST API v1 and public API compatibility
5. **Security First** - Implement proper authentication and authorization from the start
6. **Documentation** - Maintain comprehensive API documentation aligned with n8n's patterns

## Conclusion

n8n provides an extensive and well-structured REST API with over 300 endpoints covering all aspects of workflow automation. The API demonstrates enterprise-grade features including advanced authentication, comprehensive monitoring, AI integration, and extensive customization capabilities. Any MCP server implementation should prioritize core workflow operations while planning for incremental addition of advanced features.