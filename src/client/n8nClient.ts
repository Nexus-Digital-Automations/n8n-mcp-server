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
} from '../types/n8n.js';

export class N8nClient {
  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {
    // Remove trailing slash if present
    this.baseUrl = baseUrl.replace(/\/$/, '');
    // Ensure apiKey is properly assigned
    this.apiKey = apiKey;
  }

  private async makeRequest<T>(
    endpoint: string,
    options: Record<string, unknown> = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    const headers = {
      'X-N8N-API-KEY': this.apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

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
}
