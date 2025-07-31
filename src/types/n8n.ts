// Type definitions for n8n API responses
export interface N8nUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  personalizationAnswers?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  role?: string;
  password?: string;
  resetPasswordToken?: string;
  globalRoleId?: string;
  isPending?: boolean;
  disabled?: boolean;
  lastSeenAt?: string;
  globalRole?: {
    scope: string;
    name: string;
    id: string;
    createdAt: string;
    updatedAt: string;
  };
  createdAt?: string;
  updatedAt?: string;
  hasRecoveryCodesLeft?: boolean;
  mfaEnabled?: boolean;
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: Array<Record<string, unknown>>;
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: Record<string, unknown>;
  tags?: string[];
  versionId?: string;
  triggerCount?: number;
  createdAt?: string;
  updatedAt?: string;
  pinData?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface N8nExecution {
  id: string;
  finished: boolean;
  mode: string;
  retryOf?: string;
  retrySuccessId?: string;
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  waitTill?: Date;
  status: 'error' | 'success' | 'running' | 'waiting';
  data?: Record<string, unknown>;
  workflowData?: N8nWorkflow;
}

export interface N8nCredential {
  id: string;
  name: string;
  type: string;
  data?: Record<string, unknown>;
  nodesAccess?: Array<{
    nodeType: string;
    user?: string;
    date?: Date;
  }>;
  sharedWith?: Array<{
    id: string;
    user: N8nUser;
    role: string;
  }>;
  homeProject?: {
    id: string;
    name: string;
    type: string;
  };
  scopes?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface N8nProject {
  id: string;
  name: string;
  type: 'Personal' | 'Team';
  createdAt: string;
  updatedAt: string;
  relations?: Array<{
    id: string;
    userId: string;
    projectId: string;
    role: string;
    createdAt: string;
    updatedAt: string;
    user: N8nUser;
  }>;
}

export interface N8nVariable {
  id: string;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  createdAt: string;
  updatedAt: string;
}

export interface N8nTag {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  usageCount?: number;
}

export interface N8nAuditReport {
  'Database Settings'?: Record<string, unknown>;
  'Credentials Risk Report'?: Record<string, unknown>;
  'Nodes Risk Report'?: Record<string, unknown>;
  'Instance Risk Report'?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data: T;
  nextCursor?: string;
}

export interface PaginationOptions {
  limit?: number;
  cursor?: string;
}

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  role?: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

export interface CreateWorkflowRequest {
  name: string;
  nodes: Array<Record<string, unknown>>;
  connections: Record<string, unknown>;
  active?: boolean;
  settings?: Record<string, unknown>;
  tags?: string[];
}

export interface UpdateWorkflowRequest {
  name?: string;
  nodes?: Array<Record<string, unknown>>;
  connections?: Record<string, unknown>;
  active?: boolean;
  settings?: Record<string, unknown>;
  tags?: string[];
}

export interface CreateCredentialRequest {
  name: string;
  type: string;
  data: Record<string, unknown>;
  projectId?: string;
}

export interface CreateProjectRequest {
  name: string;
  type?: string;
}

export interface UpdateProjectRequest {
  name?: string;
}

export interface CreateVariableRequest {
  key: string;
  value: string;
  type?: 'string' | 'number' | 'boolean' | 'json';
}

export interface CreateTagRequest {
  name: string;
}

export interface UpdateTagRequest {
  name?: string;
}
