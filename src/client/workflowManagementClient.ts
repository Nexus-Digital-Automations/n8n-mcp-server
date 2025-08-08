/**
 * Workflow Management Client for n8n Fork Integration
 *
 * Provides comprehensive API client for programmatic workflow creation, execution,
 * monitoring, and management using n8n fork APIs with support for tags, projects,
 * and collaboration features.
 */

import { z } from 'zod';
import { N8nClient } from './n8nClient.js';

// Workflow schemas
export const WorkflowSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  active: z.boolean().default(false),
  nodes: z.array(z.any()),
  connections: z.record(z.any()),
  settings: z.record(z.any()).default({}),
  staticData: z.record(z.any()).default({}),
  tags: z.array(z.string()).default([]),
  meta: z.object({
    templateCredsSetupCompleted: z.boolean().default(false),
  }).default({}),
  pinData: z.record(z.any()).default({}),
  versionId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const WorkflowExecutionSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  mode: z.enum(['cli', 'error', 'integrated', 'internal', 'manual', 'retry', 'trigger', 'webhook']),
  retryOf: z.string().optional(),
  retrySuccessId: z.string().optional(),
  startedAt: z.string(),
  stoppedAt: z.string().optional(),
  finished: z.boolean(),
  status: z.enum(['canceled', 'crashed', 'error', 'new', 'running', 'success', 'unknown', 'waiting']),
  data: z.any().optional(),
  workflowData: z.any().optional(),
});

export const ProjectSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.enum(['Personal', 'Team']).default('Personal'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  relations: z.object({
    projectRelations: z.array(z.any()).default([]),
    workflowRelations: z.array(z.any()).default([]),
  }).optional(),
});

export const TagSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const ShareSchema = z.object({
  workflowId: z.string(),
  userId: z.string(),
  role: z.enum(['workflow:owner', 'workflow:editor', 'workflow:user']),
});

export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Tag = z.infer<typeof TagSchema>;
export type Share = z.infer<typeof ShareSchema>;

export interface WorkflowListOptions {
  limit?: number;
  offset?: number;
  active?: boolean;
  tags?: string[];
  projectId?: string;
  ownedBy?: string;
  sharedWith?: string;
}

export interface ExecutionListOptions {
  limit?: number;
  offset?: number;
  workflowId?: string;
  status?: string[];
  finished?: boolean;
  mode?: string[];
  startedAfter?: string;
  startedBefore?: string;
}

export interface WorkflowAnalytics {
  workflowId: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecuted: string;
  successRate: number;
  executionTrend: {
    date: string;
    executions: number;
    successRate: number;
  }[];
}

/**
 * Workflow Management Client
 *
 * Comprehensive client for managing workflows, executions, projects,
 * tags, and collaboration features in n8n fork.
 */
export class WorkflowManagementClient {
  private client: N8nClient;

  constructor(client: N8nClient) {
    this.client = client;
  }

  // ============================================================================
  // Workflow Management - leverages existing N8nClient methods
  // ============================================================================

  async createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const response = await this.client.createWorkflow(workflow as any);
    return WorkflowSchema.parse(response);
  }

  async getWorkflow(workflowId: string): Promise<Workflow> {
    const response = await this.client.getWorkflow(workflowId);
    return WorkflowSchema.parse(response);
  }

  async updateWorkflow(workflowId: string, updates: Partial<Workflow>): Promise<Workflow> {
    const response = await this.client.updateWorkflow(workflowId, updates as any);
    return WorkflowSchema.parse(response);
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    await this.client.deleteWorkflow(workflowId);
  }

  async listWorkflows(options: WorkflowListOptions = {}): Promise<{
    workflows: Workflow[];
    totalCount: number;
  }> {
    const response = await this.client.getWorkflows(options as any);
    return {
      workflows: response.data.map((workflow: any) => WorkflowSchema.parse(workflow)),
      totalCount: response.data.length,
    };
  }

  async activateWorkflow(workflowId: string): Promise<Workflow> {
    const response = await this.client.activateWorkflow(workflowId);
    return WorkflowSchema.parse(response);
  }

  async deactivateWorkflow(workflowId: string): Promise<Workflow> {
    const response = await this.client.deactivateWorkflow(workflowId);
    return WorkflowSchema.parse(response);
  }

  // ============================================================================
  // Execution Management - leverages existing N8nClient methods
  // ============================================================================

  async executeWorkflow(
    workflowId: string,
    inputData?: any,
    options?: { loadFromDatabase?: boolean; startNodes?: string[] }
  ): Promise<WorkflowExecution> {
    // Note: N8nClient doesn't have executeWorkflow method, this would need to be added
    throw new Error('Workflow execution not implemented in base N8nClient - would require n8n fork API extension');
  }

  async getExecution(executionId: string): Promise<WorkflowExecution> {
    const response = await this.client.getExecution(executionId);
    return WorkflowExecutionSchema.parse(response);
  }

  async listExecutions(options: ExecutionListOptions = {}): Promise<{
    executions: WorkflowExecution[];
    totalCount: number;
  }> {
    const response = await this.client.getExecutions(options as any);
    return {
      executions: response.data.map((execution: any) => WorkflowExecutionSchema.parse(execution)),
      totalCount: response.data.length,
    };
  }

  async stopExecution(executionId: string): Promise<WorkflowExecution> {
    // Note: This would require addition to N8nClient
    throw new Error('Stop execution not implemented in base N8nClient - would require n8n fork API extension');
  }

  async retryExecution(
    executionId: string,
    options?: { loadFromDatabase?: boolean; startNodes?: string[] }
  ): Promise<WorkflowExecution> {
    // Note: This would require addition to N8nClient  
    throw new Error('Retry execution not implemented in base N8nClient - would require n8n fork API extension');
  }

  async deleteExecution(executionId: string): Promise<void> {
    await this.client.deleteExecution(executionId);
  }

  // ============================================================================
  // Project Management - leverages existing N8nClient methods
  // ============================================================================

  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const response = await this.client.createProject(project as any);
    return ProjectSchema.parse(response);
  }

  async getProject(projectId: string): Promise<Project> {
    const response = await this.client.getProject(projectId);
    return ProjectSchema.parse(response);
  }

  async listProjects(): Promise<Project[]> {
    const response = await this.client.getProjects({});
    return response.data.map((project: any) => ProjectSchema.parse(project));
  }

  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
    const response = await this.client.updateProject(projectId, updates as any);
    return ProjectSchema.parse(response);
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.client.deleteProject(projectId);
  }

  async moveWorkflowToProject(workflowId: string, projectId: string): Promise<void> {
    // Note: This would require addition to N8nClient
    throw new Error('Move workflow to project not implemented in base N8nClient - would require n8n fork API extension');
  }

  // ============================================================================
  // Tag Management - leverages existing N8nClient methods
  // ============================================================================

  async createTag(tag: Omit<Tag, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tag> {
    const response = await this.client.createTag(tag as any);
    return TagSchema.parse(response);
  }

  async listTags(): Promise<Tag[]> {
    const response = await this.client.getTags({});
    return response.data.map((tag: any) => TagSchema.parse(tag));
  }

  async updateTag(tagId: string, updates: Partial<Tag>): Promise<Tag> {
    const response = await this.client.updateTag(tagId, updates as any);
    return TagSchema.parse(response);
  }

  async deleteTag(tagId: string): Promise<void> {
    await this.client.deleteTag(tagId);
  }

  async addTagsToWorkflow(workflowId: string, tagIds: string[]): Promise<void> {
    await this.client.updateWorkflowTags(workflowId, tagIds);
  }

  async removeTagsFromWorkflow(workflowId: string, tagIds: string[]): Promise<void> {
    // Note: This would require modification to updateWorkflowTags or new method
    throw new Error('Remove tags from workflow not implemented in base N8nClient - would require API extension');
  }

  // ============================================================================
  // Collaboration Features - would require n8n fork API extensions
  // ============================================================================

  async shareWorkflow(workflowId: string, userId: string, role: Share['role']): Promise<void> {
    throw new Error('Workflow sharing not implemented in base N8nClient - would require n8n fork API extension');
  }

  async updateWorkflowShare(workflowId: string, userId: string, role: Share['role']): Promise<void> {
    throw new Error('Update workflow sharing not implemented in base N8nClient - would require n8n fork API extension');
  }

  async removeWorkflowShare(workflowId: string, userId: string): Promise<void> {
    throw new Error('Remove workflow sharing not implemented in base N8nClient - would require n8n fork API extension');
  }

  async listWorkflowCollaborators(workflowId: string): Promise<Array<{
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Share['role'];
  }>> {
    throw new Error('List workflow collaborators not implemented in base N8nClient - would require n8n fork API extension');
  }

  // ============================================================================
  // Analytics and Monitoring - would require n8n fork API extensions
  // ============================================================================

  async getWorkflowAnalytics(
    workflowId: string, 
    options?: { 
      startDate?: string; 
      endDate?: string; 
      granularity?: 'day' | 'week' | 'month' 
    }
  ): Promise<WorkflowAnalytics> {
    throw new Error('Workflow analytics not implemented in base N8nClient - would require n8n fork API extension');
  }

  async getGlobalAnalytics(options?: { 
    startDate?: string; 
    endDate?: string; 
    projectId?: string 
  }): Promise<{
    totalWorkflows: number;
    activeWorkflows: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
    topPerformingWorkflows: Array<{
      workflowId: string;
      name: string;
      executions: number;
      successRate: number;
    }>;
  }> {
    throw new Error('Global analytics not implemented in base N8nClient - would require n8n fork API extension');
  }

  async getExecutionStatistics(workflowId?: string): Promise<{
    totalExecutions: number;
    runningExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    canceledExecutions: number;
    averageExecutionTime: number;
    medianExecutionTime: number;
    executionsByStatus: Record<string, number>;
    executionsByMode: Record<string, number>;
    recentExecutions: WorkflowExecution[];
  }> {
    throw new Error('Execution statistics not implemented in base N8nClient - would require n8n fork API extension');
  }

  // ============================================================================
  // Bulk Operations - would require n8n fork API extensions
  // ============================================================================

  async bulkActivateWorkflows(workflowIds: string[], active: boolean): Promise<{
    successful: string[];
    failed: Array<{ id: string; error: string }>;
  }> {
    throw new Error('Bulk workflow operations not implemented in base N8nClient - would require n8n fork API extension');
  }

  async bulkDeleteWorkflows(workflowIds: string[]): Promise<{
    successful: string[];
    failed: Array<{ id: string; error: string }>;
  }> {
    throw new Error('Bulk workflow operations not implemented in base N8nClient - would require n8n fork API extension');
  }

  async bulkDeleteExecutions(
    criteria: {
      workflowId?: string;
      status?: string[];
      startedBefore?: string;
      limit?: number;
    }
  ): Promise<{
    deletedCount: number;
    remainingCount: number;
  }> {
    throw new Error('Bulk execution operations not implemented in base N8nClient - would require n8n fork API extension');
  }

  // ============================================================================
  // Import/Export - would require n8n fork API extensions
  // ============================================================================

  async exportWorkflows(
    workflowIds: string[],
    options?: { 
      includeCredentials?: boolean; 
      format?: 'json' | 'zip' 
    }
  ): Promise<any> {
    throw new Error('Workflow export not implemented in base N8nClient - would require n8n fork API extension');
  }

  async importWorkflows(
    workflows: any[], 
    options?: { 
      updateExisting?: boolean; 
      projectId?: string 
    }
  ): Promise<{
    imported: Array<{ id: string; name: string }>;
    skipped: Array<{ name: string; reason: string }>;
    errors: Array<{ name: string; error: string }>;
  }> {
    throw new Error('Workflow import not implemented in base N8nClient - would require n8n fork API extension');
  }
}

/**
 * Create workflow management client with default configuration
 */
export function createWorkflowManagementClient(n8nClient: N8nClient): WorkflowManagementClient {
  return new WorkflowManagementClient(n8nClient);
}