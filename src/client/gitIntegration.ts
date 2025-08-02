/**
 * Git Integration Client for n8n MCP Server
 * 
 * Provides integration with Git hosting services (GitHub, GitLab, Bitbucket)
 * for workflow and configuration management operations.
 */

import { UserError } from 'fastmcp';

export interface GitAuthOptions {
  token?: string;
  username?: string;
  password?: string;
}

export interface RepositoryContent {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  content?: string;
  sha?: string;
  downloadUrl?: string;
}

export interface GitCommitOptions {
  message: string;
  branch?: string;
  author?: {
    name: string;
    email: string;
  };
}

export interface GitProvider {
  name: string;
  baseUrl: string;
  apiPath: string;
}

/**
 * Git Integration Client
 * 
 * Handles operations with various Git hosting providers.
 * Currently supports GitHub API with plans for GitLab and Bitbucket.
 */
export class GitIntegrationClient {
  private provider: GitProvider;
  private auth: GitAuthOptions;

  constructor(repositoryUrl: string, auth: GitAuthOptions = {}) {
    this.provider = this.detectProvider(repositoryUrl);
    this.auth = auth;
  }

  /**
   * Detect Git provider from repository URL
   */
  private detectProvider(repositoryUrl: string): GitProvider {
    const url = new globalThis.URL(repositoryUrl);
    
    if (url.hostname === 'github.com') {
      return {
        name: 'github',
        baseUrl: 'https://api.github.com',
        apiPath: '/repos',
      };
    }
    
    if (url.hostname === 'gitlab.com') {
      return {
        name: 'gitlab',
        baseUrl: 'https://gitlab.com/api/v4',
        apiPath: '/projects',
      };
    }
    
    if (url.hostname.includes('bitbucket')) {
      return {
        name: 'bitbucket',
        baseUrl: 'https://api.bitbucket.org/2.0',
        apiPath: '/repositories',
      };
    }
    
    throw new UserError(`Unsupported Git provider: ${url.hostname}. Currently supports GitHub, GitLab, and Bitbucket.`);
  }

  /**
   * Extract owner and repo from repository URL
   */
  private parseRepositoryUrl(repositoryUrl: string): { owner: string; repo: string } {
    const url = new globalThis.URL(repositoryUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    if (pathParts.length < 2) {
      throw new UserError('Invalid repository URL format. Expected: https://host/owner/repo');
    }
    
    const owner = pathParts[0];
    const repo = pathParts[1].replace(/\.git$/, ''); // Remove .git suffix if present
    
    return { owner, repo };
  }

  /**
   * Make authenticated request to Git API
   */
  private async makeRequest<T>(endpoint: string, options: globalThis.RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'n8n-mcp-server/1.0.0',
    };

    // Add authentication headers based on provider
    if (this.auth.token) {
      if (this.provider.name === 'github') {
        headers['Authorization'] = `Bearer ${this.auth.token}`;
      } else if (this.provider.name === 'gitlab') {
        headers['PRIVATE-TOKEN'] = this.auth.token;
      } else if (this.provider.name === 'bitbucket') {
        headers['Authorization'] = `Bearer ${this.auth.token}`;
      }
    } else if (this.auth.username && this.auth.password) {
      const credentials = globalThis.btoa(`${this.auth.username}:${this.auth.password}`);
      headers['Authorization'] = `Basic ${credentials}`;
    }

    const url = `${this.provider.baseUrl}${endpoint}`;
    
    try {
      const response = await globalThis.fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${this.provider.name.toUpperCase()} API error: ${response.status} - ${errorText}`);
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof Error) {
        throw new UserError(`Git API request failed: ${error.message}`);
      }
      throw new UserError('Git API request failed with unknown error');
    }
  }

  /**
   * List contents of a repository directory
   */
  async listContents(
    repositoryUrl: string,
    path: string = '',
    branch: string = 'main'
  ): Promise<RepositoryContent[]> {
    const { owner, repo } = this.parseRepositoryUrl(repositoryUrl);
    let endpoint: string;

    if (this.provider.name === 'github') {
      endpoint = `${this.provider.apiPath}/${owner}/${repo}/contents/${path}?ref=${branch}`;
    } else if (this.provider.name === 'gitlab') {
      // GitLab uses project ID, would need additional lookup
      throw new UserError('GitLab integration not yet implemented');
    } else {
      throw new UserError(`Provider ${this.provider.name} not yet implemented`);
    }

    interface GitHubContent {
      name: string;
      path: string;
      type: string;
      size?: number;
      content?: string;
      sha: string;
      download_url?: string;
    }

    const response = await this.makeRequest<GitHubContent[]>(endpoint);
    
    return response.map(item => ({
      name: item.name,
      path: item.path,
      type: item.type === 'dir' ? 'directory' : 'file',
      size: item.size,
      content: item.content,
      sha: item.sha,
      downloadUrl: item.download_url,
    }));
  }

  /**
   * Fetch file content from repository
   */
  async getFileContent(
    repositoryUrl: string,
    filePath: string,
    branch: string = 'main'
  ): Promise<string> {
    const { owner, repo } = this.parseRepositoryUrl(repositoryUrl);
    let endpoint: string;

    if (this.provider.name === 'github') {
      endpoint = `${this.provider.apiPath}/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
    } else {
      throw new UserError(`Provider ${this.provider.name} not yet implemented`);
    }

    interface GitHubFileContent {
      content: string;
      encoding: string;
      type: string;
    }

    const response = await this.makeRequest<GitHubFileContent>(endpoint);
    
    if (response.type !== 'file') {
      throw new UserError(`Path ${filePath} is not a file`);
    }

    if (response.encoding === 'base64') {
      return globalThis.atob(response.content.replace(/\s/g, ''));
    }
    
    return response.content;
  }

  /**
   * Create or update file in repository
   */
  async createOrUpdateFile(
    repositoryUrl: string,
    filePath: string,
    content: string,
    commitOptions: GitCommitOptions,
    branch: string = 'main'
  ): Promise<void> {
    const { owner, repo } = this.parseRepositoryUrl(repositoryUrl);
    
    if (this.provider.name !== 'github') {
      throw new UserError(`Provider ${this.provider.name} not yet implemented`);
    }

    // First, try to get the current file to get its SHA (required for updates)
    let currentSha: string | undefined;
    try {
      const endpoint = `${this.provider.apiPath}/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
      const response = await this.makeRequest<{ sha: string }>(endpoint);
      currentSha = response.sha;
    } catch {
      // File doesn't exist, that's okay for creation
    }

    // Create or update the file
    const endpoint = `${this.provider.apiPath}/${owner}/${repo}/contents/${filePath}`;
    const requestBody = {
      message: commitOptions.message,
      content: globalThis.btoa(content), // GitHub expects base64 encoded content
      branch: branch,
      ...(currentSha && { sha: currentSha }), // Include SHA for updates
      ...(commitOptions.author && { 
        author: {
          name: commitOptions.author.name,
          email: commitOptions.author.email,
        }
      }),
    };

    await this.makeRequest(endpoint, {
      method: 'PUT',
      body: JSON.stringify(requestBody),
    });
  }

  /**
   * Validate repository access
   */
  async validateAccess(repositoryUrl: string): Promise<boolean> {
    try {
      const { owner, repo } = this.parseRepositoryUrl(repositoryUrl);
      let endpoint: string;

      if (this.provider.name === 'github') {
        endpoint = `${this.provider.apiPath}/${owner}/${repo}`;
      } else {
        throw new UserError(`Provider ${this.provider.name} not yet implemented`);
      }

      await this.makeRequest(endpoint);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get repository information
   */
  async getRepositoryInfo(repositoryUrl: string) {
    const { owner, repo } = this.parseRepositoryUrl(repositoryUrl);
    
    if (this.provider.name !== 'github') {
      throw new UserError(`Provider ${this.provider.name} not yet implemented`);
    }

    const endpoint = `${this.provider.apiPath}/${owner}/${repo}`;
    
    interface GitHubRepo {
      name: string;
      full_name: string;
      description: string;
      default_branch: string;
      private: boolean;
      size: number;
      language: string;
    }

    const response = await this.makeRequest<GitHubRepo>(endpoint);
    
    return {
      name: response.name,
      fullName: response.full_name,
      description: response.description,
      defaultBranch: response.default_branch,
      isPrivate: response.private,
      size: response.size,
      primaryLanguage: response.language,
    };
  }
}

/**
 * Helper function to create Git integration client
 */
export function createGitClient(repositoryUrl: string, auth: GitAuthOptions = {}): GitIntegrationClient {
  return new GitIntegrationClient(repositoryUrl, auth);
}