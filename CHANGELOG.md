# Changelog

## [2.0.0] - 2025-08-08

### Added - n8n Fork REST API v1 Support

This major release updates the MCP server to fully support the n8n fork's enhanced REST API v1 endpoints and features.

#### 🚀 New API Endpoints

**Enhanced User Management**
- `updateUserRole()` - Update user roles with granular permissions
- Enhanced user management with role-based access control

**Enhanced Project Management** 
- `getProjectUsers()` - List users in a project
- `addUserToProject()` - Add users to projects with roles
- `updateProjectUser()` - Update user roles within projects
- `removeUserFromProject()` - Remove users from projects
- Full project collaboration support

**Enhanced Workflow Management**
- `transferWorkflow()` - Transfer workflow ownership between projects
- Workflow ownership and sharing management

**Enhanced Credential Management**
- `updateCredential()` - Update existing credentials
- `transferCredential()` - Transfer credential ownership
- Enhanced credential security and sharing

**Enhanced Variable Management**
- `getVariable()` - Get individual variables by ID
- `updateVariable()` - Update existing variables
- Complete variable lifecycle management

**Source Control Integration** (Enterprise)
- `getSourceControlStatus()` - Get repository status and changes
- `pullFromRepository()` - Pull workflows from Git repositories
- `setBranch()` - Switch repository branches
- `getCommitHistory()` - View commit history
- `checkSyncStatus()` - Check synchronization status
- Full Git integration for workflow version control

#### 🔐 Enhanced Authentication Support

**Multiple Authentication Methods**
- **API Key Authentication** - X-N8N-API-KEY header (existing)
- **Session-Based Authentication** - Cookie-based sessions
- **OAuth 2.0** - Full OAuth 2.0 flow support
- **Enterprise SSO** - SAML, OIDC, LDAP support

**Authentication Features**
- `login()` - Session-based login with MFA support
- `logout()` - Session termination
- `getSessionInfo()` - Current session details
- `refreshSession()` - Session token refresh
- `generateOAuth2AuthUrl()` - OAuth authorization URL generation
- `exchangeOAuth2Code()` - OAuth code exchange for tokens
- `refreshOAuth2Token()` - OAuth token refresh

**Dynamic Authentication Configuration**
- `setAuthConfig()` - Runtime authentication method switching
- `getAuthConfig()` - Current authentication configuration
- Support for multiple authentication types per client instance

#### 📊 Enhanced Type Definitions

**New Type Interfaces**
- `ProjectUserRequest/Response` - Project user management
- `WorkflowTransferRequest` - Workflow ownership transfer
- `CredentialTransferRequest` - Credential ownership transfer
- `UserRoleUpdateRequest` - User role updates
- `SourceControl*` interfaces - Git integration types
- `Authentication*` interfaces - Auth configuration types
- `OAuth2*` interfaces - OAuth 2.0 flow types
- `SessionInfo` - Session management types

#### 🔧 Infrastructure Improvements

**Enhanced N8nClient Architecture**
- Configurable authentication methods
- Dynamic auth switching at runtime
- Improved error handling for different auth types
- Better type safety across all endpoints

**Backward Compatibility**
- All existing API methods remain unchanged
- Default behavior unchanged for existing integrations
- Graceful fallback to API key authentication

### Changed

**Package Information**
- Version bumped to 2.0.0 reflecting major API enhancements
- Updated description to reflect comprehensive n8n fork API support
- Enhanced FastMCP server version to 2.0.0

**API Client Enhancement**
- `N8nClient` constructor now accepts optional `AuthenticationConfig`
- `makeRequest()` method supports multiple authentication methods
- Enhanced error handling for different authentication scenarios

### Technical Details

**Supported n8n Fork Features**
- ✅ Complete REST API v1 endpoint coverage
- ✅ Multiple authentication mechanisms
- ✅ Enterprise features (Projects, Source Control, SSO)
- ✅ Enhanced security and permission management
- ✅ Full OAuth 2.0 integration
- ✅ Session management and MFA support

**API Compatibility**
- Compatible with n8n fork REST API v1
- Support for both Community and Enterprise features
- Graceful degradation for unsupported features
- Comprehensive error handling and user feedback

This release provides comprehensive support for the n8n fork's extensive automation capabilities, enabling seamless integration with advanced workflow management, enhanced security, and enterprise collaboration features.