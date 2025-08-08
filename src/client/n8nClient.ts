import fetch from 'node-fetch';
import {
  N8nUser,
  N8nWorkflow,
  N8nExecution,
  N8nCredential,
  N8nProject,
  N8nVariable,
  N8nTag,
  N8nAuditReport,
  N8nCommunityPackage,
  N8nNodeTypeDescription,
  ApiResponse,
  PaginationOptions,
  CreateUserRequest,
  UpdateUserRequest,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  CreateCredentialRequest,
  CreateProjectRequest,
  UpdateProjectRequest,
  CreateVariableRequest,
  CreateTagRequest,
  UpdateTagRequest,
  CommunityPackageInstallRequest,
  CommunityPackageUpdateRequest,
  DynamicNodeOptions,
  DynamicNodeParameter,
  ResourceLocatorResult,
  AINodeClassification,
  AINodeSuggestion,
  ProjectUserRequest,
  ProjectUserResponse,
  WorkflowTransferRequest,
  CredentialTransferRequest,
  UserRoleUpdateRequest,
  SourceControlStatus,
  SourceControlCommit,
  SourceControlPullRequest,
  SourceControlBranchRequest,
  AuthenticationConfig,
  SessionInfo,
  LoginRequest,
  LoginResponse,
  OAuth2Config,
  OAuth2Token,
  VariableUpdateRequest,
} from '../types/n8n.js';

export class N8nClient {
  private authConfig: AuthenticationConfig;

  constructor(
    private baseUrl: string,
    private apiKey: string,
    authConfig?: AuthenticationConfig
  ) {
    // Remove trailing slash if present
    this.baseUrl = baseUrl.replace(/\/$/, '');
    // Ensure apiKey is properly assigned
    this.apiKey = apiKey;
    // Set up authentication configuration
    this.authConfig = authConfig || { type: 'api-key' };
  }

  // Method to update authentication configuration
  setAuthConfig(config: AuthenticationConfig): void {
    this.authConfig = config;
  }

  // Method to get current authentication configuration
  getAuthConfig(): AuthenticationConfig {
    return this.authConfig;
  }

  private async makeRequest<T>(
    endpoint: string,
    options: Record<string, unknown> = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    // Apply authentication based on configuration
    switch (this.authConfig.type) {
      case 'api-key':
        headers['X-N8N-API-KEY'] = this.apiKey;
        break;
      case 'session':
        if (this.authConfig.sessionToken) {
          headers['Cookie'] = `n8n-auth=${this.authConfig.sessionToken}`;
        }
        break;
      case 'oauth2':
        if (this.authConfig.credentials?.accessToken) {
          headers['Authorization'] = `Bearer ${this.authConfig.credentials.accessToken}`;
        }
        break;
      case 'saml':
      case 'oidc':
      case 'ldap':
        // These typically use session-based auth after initial login
        if (this.authConfig.sessionToken) {
          headers['Cookie'] = `n8n-auth=${this.authConfig.sessionToken}`;
        }
        break;
      default:
        // Fallback to API key
        headers['X-N8N-API-KEY'] = this.apiKey;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...((options.headers as Record<string, string>) || {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return (await response.json()) as T;
      }

      return (await response.text()) as unknown as T;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`n8n API request failed: ${error.message}`);
      }
      throw new Error('n8n API request failed with unknown error');
    }
  }

  // User Management
  async getUsers(options: PaginationOptions = {}): Promise<ApiResponse<N8nUser[]>> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.cursor) params.append('cursor', options.cursor);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.makeRequest<ApiResponse<N8nUser[]>>(`/users${query}`);
  }

  async getUser(id: string): Promise<N8nUser> {
    return this.makeRequest<N8nUser>(`/users/${id}`);
  }

  async createUser(userData: CreateUserRequest): Promise<N8nUser> {
    return this.makeRequest<N8nUser>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async updateUser(id: string, userData: UpdateUserRequest): Promise<N8nUser> {
    return this.makeRequest<N8nUser>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(userData),
    });
  }

  async deleteUser(id: string): Promise<void> {
    await this.makeRequest<void>(`/users/${id}`, {
      method: 'DELETE',
    });
  }

  // Workflow Management
  async getWorkflows(options: PaginationOptions = {}): Promise<ApiResponse<N8nWorkflow[]>> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.cursor) params.append('cursor', options.cursor);
    if (options.projectId) params.append('projectId', options.projectId);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.makeRequest<ApiResponse<N8nWorkflow[]>>(`/workflows${query}`);
  }

  async getWorkflow(id: string): Promise<N8nWorkflow> {
    return this.makeRequest<N8nWorkflow>(`/workflows/${id}`);
  }

  async createWorkflow(workflowData: CreateWorkflowRequest): Promise<N8nWorkflow> {
    return this.makeRequest<N8nWorkflow>('/workflows', {
      method: 'POST',
      body: JSON.stringify(workflowData),
    });
  }

  async updateWorkflow(id: string, workflowData: UpdateWorkflowRequest): Promise<N8nWorkflow> {
    return this.makeRequest<N8nWorkflow>(`/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(workflowData),
    });
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.makeRequest<void>(`/workflows/${id}`, {
      method: 'DELETE',
    });
  }

  async activateWorkflow(id: string): Promise<N8nWorkflow> {
    return this.makeRequest<N8nWorkflow>(`/workflows/${id}/activate`, {
      method: 'POST',
    });
  }

  async deactivateWorkflow(id: string): Promise<N8nWorkflow> {
    return this.makeRequest<N8nWorkflow>(`/workflows/${id}/deactivate`, {
      method: 'POST',
    });
  }

  // Execution Management
  async getExecutions(options: PaginationOptions = {}): Promise<ApiResponse<N8nExecution[]>> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.cursor) params.append('cursor', options.cursor);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.makeRequest<ApiResponse<N8nExecution[]>>(`/executions${query}`);
  }

  async getExecution(id: string): Promise<N8nExecution> {
    return this.makeRequest<N8nExecution>(`/executions/${id}`);
  }

  async deleteExecution(id: string): Promise<void> {
    await this.makeRequest<void>(`/executions/${id}`, {
      method: 'DELETE',
    });
  }

  // Credential Management
  async getCredentials(options: PaginationOptions = {}): Promise<ApiResponse<N8nCredential[]>> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.cursor) params.append('cursor', options.cursor);
    if (options.projectId) params.append('projectId', options.projectId);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.makeRequest<ApiResponse<N8nCredential[]>>(`/credentials${query}`);
  }

  async getCredential(id: string): Promise<N8nCredential> {
    return this.makeRequest<N8nCredential>(`/credentials/${id}`);
  }

  async createCredential(credentialData: CreateCredentialRequest): Promise<N8nCredential> {
    return this.makeRequest<N8nCredential>('/credentials', {
      method: 'POST',
      body: JSON.stringify(credentialData),
    });
  }

  async deleteCredential(id: string): Promise<void> {
    await this.makeRequest<void>(`/credentials/${id}`, {
      method: 'DELETE',
    });
  }

  async getCredentialSchema(credentialType: string): Promise<Record<string, unknown>> {
    return this.makeRequest<Record<string, unknown>>(`/credentials/schema/${credentialType}`);
  }

  // Project Management (Enterprise)
  async getProjects(options: PaginationOptions = {}): Promise<ApiResponse<N8nProject[]>> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.cursor) params.append('cursor', options.cursor);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.makeRequest<ApiResponse<N8nProject[]>>(`/projects${query}`);
  }

  async getProject(id: string): Promise<N8nProject> {
    return this.makeRequest<N8nProject>(`/projects/${id}`);
  }

  async createProject(projectData: CreateProjectRequest): Promise<N8nProject> {
    return this.makeRequest<N8nProject>('/projects', {
      method: 'POST',
      body: JSON.stringify(projectData),
    });
  }

  async updateProject(id: string, projectData: UpdateProjectRequest): Promise<N8nProject> {
    return this.makeRequest<N8nProject>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(projectData),
    });
  }

  async deleteProject(id: string): Promise<void> {
    await this.makeRequest<void>(`/projects/${id}`, {
      method: 'DELETE',
    });
  }

  // Variable Management (Enterprise)
  async getVariables(options: PaginationOptions = {}): Promise<ApiResponse<N8nVariable[]>> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.cursor) params.append('cursor', options.cursor);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.makeRequest<ApiResponse<N8nVariable[]>>(`/variables${query}`);
  }

  async createVariable(variableData: CreateVariableRequest): Promise<N8nVariable> {
    return this.makeRequest<N8nVariable>('/variables', {
      method: 'POST',
      body: JSON.stringify(variableData),
    });
  }

  async deleteVariable(id: string): Promise<void> {
    await this.makeRequest<void>(`/variables/${id}`, {
      method: 'DELETE',
    });
  }

  // Tag Management
  async getTags(options: PaginationOptions = {}): Promise<ApiResponse<N8nTag[]>> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.cursor) params.append('cursor', options.cursor);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.makeRequest<ApiResponse<N8nTag[]>>(`/tags${query}`);
  }

  async getTag(id: string): Promise<N8nTag> {
    return this.makeRequest<N8nTag>(`/tags/${id}`);
  }

  async createTag(tagData: CreateTagRequest): Promise<N8nTag> {
    return this.makeRequest<N8nTag>('/tags', {
      method: 'POST',
      body: JSON.stringify(tagData),
    });
  }

  async updateTag(id: string, tagData: UpdateTagRequest): Promise<N8nTag> {
    return this.makeRequest<N8nTag>(`/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(tagData),
    });
  }

  async deleteTag(id: string): Promise<void> {
    await this.makeRequest<void>(`/tags/${id}`, {
      method: 'DELETE',
    });
  }

  async getWorkflowTags(workflowId: string): Promise<N8nTag[]> {
    return this.makeRequest<N8nTag[]>(`/workflows/${workflowId}/tags`);
  }

  async updateWorkflowTags(workflowId: string, tagIds: string[]): Promise<void> {
    await this.makeRequest<void>(`/workflows/${workflowId}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tagIds }),
    });
  }

  // Audit Report
  async generateAuditReport(): Promise<N8nAuditReport> {
    return this.makeRequest<N8nAuditReport>('/audit');
  }

  // Community Package Management
  async getCommunityPackages(): Promise<ApiResponse<N8nCommunityPackage[]>> {
    return this.makeRequest<ApiResponse<N8nCommunityPackage[]>>('/community-packages');
  }

  async installCommunityPackage(packageData: CommunityPackageInstallRequest): Promise<N8nCommunityPackage> {
    return this.makeRequest<N8nCommunityPackage>('/community-packages', {
      method: 'POST',
      body: JSON.stringify(packageData),
    });
  }

  async updateCommunityPackage(packageName: string, packageData: CommunityPackageUpdateRequest): Promise<N8nCommunityPackage> {
    return this.makeRequest<N8nCommunityPackage>(`/community-packages/${encodeURIComponent(packageName)}`, {
      method: 'PATCH',
      body: JSON.stringify(packageData),
    });
  }

  async uninstallCommunityPackage(packageName: string): Promise<void> {
    await this.makeRequest<void>(`/community-packages/${encodeURIComponent(packageName)}`, {
      method: 'DELETE',
    });
  }

  // Node Type Management
  async getNodeTypes(): Promise<N8nNodeTypeDescription[]> {
    return this.makeRequest<N8nNodeTypeDescription[]>('/node-types');
  }

  async getNodeType(nodeType: string): Promise<N8nNodeTypeDescription> {
    return this.makeRequest<N8nNodeTypeDescription>(`/node-types/${encodeURIComponent(nodeType)}`);
  }

  async getCommunityNodeTypes(): Promise<N8nNodeTypeDescription[]> {
    return this.makeRequest<N8nNodeTypeDescription[]>('/community-node-types');
  }

  async getCommunityNodeType(name: string): Promise<N8nNodeTypeDescription> {
    return this.makeRequest<N8nNodeTypeDescription>(`/community-node-types/${encodeURIComponent(name)}`);
  }

  // Dynamic Node Parameters
  async getDynamicNodeParameters(options: DynamicNodeOptions): Promise<DynamicNodeParameter[]> {
    return this.makeRequest<DynamicNodeParameter[]>('/dynamic-node-parameters/options', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  async getResourceLocatorResults(options: DynamicNodeOptions): Promise<ResourceLocatorResult[]> {
    return this.makeRequest<ResourceLocatorResult[]>('/dynamic-node-parameters/resource-locator', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  // Enhanced User Management (n8n fork)
  async updateUserRole(id: string, roleData: UserRoleUpdateRequest): Promise<N8nUser> {
    return this.makeRequest<N8nUser>(`/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify(roleData),
    });
  }

  // Enhanced Project Management (n8n fork)
  async getProjectUsers(projectId: string): Promise<ProjectUserResponse[]> {
    return this.makeRequest<ProjectUserResponse[]>(`/projects/${projectId}/users`);
  }

  async addUserToProject(projectId: string, userData: ProjectUserRequest): Promise<ProjectUserResponse> {
    return this.makeRequest<ProjectUserResponse>(`/projects/${projectId}/users`, {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async updateProjectUser(projectId: string, userId: string, roleData: ProjectUserRequest): Promise<ProjectUserResponse> {
    return this.makeRequest<ProjectUserResponse>(`/projects/${projectId}/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(roleData),
    });
  }

  async removeUserFromProject(projectId: string, userId: string): Promise<void> {
    await this.makeRequest<void>(`/projects/${projectId}/users/${userId}`, {
      method: 'DELETE',
    });
  }

  // Enhanced Workflow Management (n8n fork)
  async transferWorkflow(id: string, transferData: WorkflowTransferRequest): Promise<N8nWorkflow> {
    return this.makeRequest<N8nWorkflow>(`/workflows/${id}/transfer`, {
      method: 'PUT',
      body: JSON.stringify(transferData),
    });
  }

  // Enhanced Credential Management (n8n fork)  
  async updateCredential(id: string, credentialData: Partial<CreateCredentialRequest>): Promise<N8nCredential> {
    return this.makeRequest<N8nCredential>(`/credentials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(credentialData),
    });
  }

  async transferCredential(id: string, transferData: CredentialTransferRequest): Promise<N8nCredential> {
    return this.makeRequest<N8nCredential>(`/credentials/${id}/transfer`, {
      method: 'PUT',
      body: JSON.stringify(transferData),
    });
  }

  // Enhanced Variable Management (n8n fork)
  async getVariable(id: string): Promise<N8nVariable> {
    return this.makeRequest<N8nVariable>(`/variables/${id}`);
  }

  async updateVariable(id: string, variableData: VariableUpdateRequest): Promise<N8nVariable> {
    return this.makeRequest<N8nVariable>(`/variables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(variableData),
    });
  }

  // Source Control Integration (Enterprise n8n fork)
  async getSourceControlStatus(): Promise<SourceControlStatus> {
    return this.makeRequest<SourceControlStatus>('/source-control/repository-status');
  }

  async pullFromRepository(pullData: SourceControlPullRequest = {}): Promise<SourceControlStatus> {
    return this.makeRequest<SourceControlStatus>('/source-control/pull', {
      method: 'POST',
      body: JSON.stringify(pullData),
    });
  }

  async setBranch(branchData: SourceControlBranchRequest): Promise<SourceControlStatus> {
    return this.makeRequest<SourceControlStatus>('/source-control/set-branch', {
      method: 'POST',
      body: JSON.stringify(branchData),
    });
  }

  async getCommitHistory(): Promise<SourceControlCommit[]> {
    return this.makeRequest<SourceControlCommit[]>('/source-control/commit-history');
  }

  async checkSyncStatus(): Promise<SourceControlStatus> {
    return this.makeRequest<SourceControlStatus>('/source-control/sync-check');
  }

  // Authentication Methods (n8n fork)
  async login(loginData: LoginRequest): Promise<LoginResponse> {
    return this.makeRequest<LoginResponse>('/login', {
      method: 'POST',
      body: JSON.stringify(loginData),
    });
  }

  async logout(): Promise<void> {
    await this.makeRequest<void>('/logout', {
      method: 'POST',
    });
  }

  async getSessionInfo(): Promise<SessionInfo> {
    return this.makeRequest<SessionInfo>('/session');
  }

  async refreshSession(): Promise<SessionInfo> {
    return this.makeRequest<SessionInfo>('/session/refresh', {
      method: 'POST',
    });
  }

  // OAuth2 Helper Methods (n8n fork)
  generateOAuth2AuthUrl(config: OAuth2Config, state?: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scope?.join(' ') || '',
    });

    if (state) {
      params.append('state', state);
    }

    return `${config.authorizationUrl}?${params.toString()}`;
  }

  async exchangeOAuth2Code(config: OAuth2Config, code: string): Promise<OAuth2Token> {
    const tokenUrl = config.tokenUrl;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth2 token exchange failed: ${errorText}`);
    }

    const tokenData = await response.json() as any;
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type || 'Bearer',
    };
  }

  async refreshOAuth2Token(config: OAuth2Config, refreshToken: string): Promise<OAuth2Token> {
    const tokenUrl = config.tokenUrl;
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth2 token refresh failed: ${errorText}`);
    }

    const tokenData = await response.json() as any;
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken, // Keep old refresh token if new one not provided
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type || 'Bearer',
    };
  }

  // AI Node Features
  async getAINodes(): Promise<N8nNodeTypeDescription[]> {
    return this.makeRequest<N8nNodeTypeDescription[]>('/ai-nodes');
  }

  async classifyAINode(nodeType: string): Promise<AINodeClassification> {
    return this.makeRequest<AINodeClassification>('/ai-nodes/classify', {
      method: 'POST',
      body: JSON.stringify({ nodeType }),
    });
  }

  async getAINodeSuggestions(nodeType: string): Promise<AINodeSuggestion[]> {
    return this.makeRequest<AINodeSuggestion[]>(`/ai-nodes/${encodeURIComponent(nodeType)}/suggestions`);
  }
}
