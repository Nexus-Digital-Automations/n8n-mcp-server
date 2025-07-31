import { createServer, Server } from 'http';
import { URL } from 'url';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Mock n8n server for E2E testing
 * Provides realistic API responses for testing MCP server functionality
 */
export class MockN8nServer {
  private server: Server;
  private port: number;
  private isRunning = false;
  private testData: any;

  constructor(port = 3001) {
    this.port = port;

    // Load test fixtures
    const fixturesPath = path.join(process.cwd(), 'tests/fixtures/workflows.json');
    this.testData = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));

    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });
  }

  /**
   * Start the mock server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          this.isRunning = true;
          console.log(`Mock n8n server running on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  /**
   * Stop the mock server
   */
  async stop(): Promise<void> {
    return new Promise(resolve => {
      if (this.isRunning) {
        this.server.close(() => {
          this.isRunning = false;
          console.log('Mock n8n server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the server URL
   */
  getUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: any, res: any): void {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-N8N-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Check authentication
    const apiKey =
      req.headers['x-n8n-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!apiKey || apiKey !== 'test-api-key') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Unauthorized' }));
      return;
    }

    const url = new URL(req.url, `http://localhost:${this.port}`);
    const path = url.pathname;
    const method = req.method;

    try {
      // Route requests to appropriate handlers
      if (path.startsWith('/api/v1/workflows')) {
        this.handleWorkflowRequests(path, method, req, res);
      } else if (path.startsWith('/api/v1/executions')) {
        this.handleExecutionRequests(path, method, req, res);
      } else if (path.startsWith('/api/v1/users')) {
        this.handleUserRequests(path, method, req, res);
      } else if (path.startsWith('/api/v1/credentials')) {
        this.handleCredentialRequests(path, method, req, res);
      } else if (path.startsWith('/api/v1/tags')) {
        this.handleTagRequests(path, method, req, res);
      } else if (path === '/api/v1/me') {
        this.handleMeRequest(res);
      } else if (path === '/api/v1/login') {
        this.handleLoginRequest(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Not found' }));
      }
    } catch (error) {
      console.error('Mock server error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Internal server error' }));
    }
  }

  /**
   * Handle workflow-related requests
   */
  private handleWorkflowRequests(path: string, method: string, req: any, res: any): void {
    const segments = path.split('/');

    if (method === 'GET' && path === '/api/v1/workflows') {
      // List workflows
      const limit = parseInt(req.url.split('limit=')[1]?.split('&')[0] || '20');
      const workflows = this.testData.workflows.slice(0, limit);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: workflows,
          count: workflows.length,
          hasMore: workflows.length >= limit,
        })
      );
    } else if (method === 'GET' && segments.length === 5) {
      // Get single workflow
      const workflowId = segments[4];
      const workflow = this.testData.workflows.find((w: any) => w.id === workflowId);

      if (workflow) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(workflow));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Workflow not found' }));
      }
    } else if (method === 'POST' && path === '/api/v1/workflows') {
      // Create workflow
      let body = '';
      req.on('data', (chunk: any) => (body += chunk));
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const newWorkflow = {
            id: String(Date.now()),
            ...data,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          this.testData.workflows.push(newWorkflow);

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(newWorkflow));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Invalid JSON' }));
        }
      });
    } else if (method === 'PATCH' && segments.length === 6 && segments[5] === 'activate') {
      // Activate workflow
      const workflowId = segments[4];
      const workflow = this.testData.workflows.find((w: any) => w.id === workflowId);

      if (workflow) {
        workflow.active = true;
        workflow.updatedAt = new Date().toISOString();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(workflow));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Workflow not found' }));
      }
    } else if (method === 'PATCH' && segments.length === 6 && segments[5] === 'deactivate') {
      // Deactivate workflow
      const workflowId = segments[4];
      const workflow = this.testData.workflows.find((w: any) => w.id === workflowId);

      if (workflow) {
        workflow.active = false;
        workflow.updatedAt = new Date().toISOString();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(workflow));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Workflow not found' }));
      }
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Method not allowed' }));
    }
  }

  /**
   * Handle execution-related requests
   */
  private handleExecutionRequests(path: string, method: string, req: any, res: any): void {
    const segments = path.split('/');

    if (method === 'GET' && path === '/api/v1/executions') {
      // List executions
      const limit = parseInt(req.url.split('limit=')[1]?.split('&')[0] || '20');
      const executions = this.testData.executions.slice(0, limit);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: executions,
          count: executions.length,
          hasMore: executions.length >= limit,
        })
      );
    } else if (method === 'GET' && segments.length === 5) {
      // Get single execution
      const executionId = segments[4];
      const execution = this.testData.executions.find((e: any) => e.id === executionId);

      if (execution) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(execution));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Execution not found' }));
      }
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Method not allowed' }));
    }
  }

  /**
   * Handle user-related requests
   */
  private handleUserRequests(path: string, method: string, req: any, res: any): void {
    if (method === 'GET' && path === '/api/v1/users') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: this.testData.users,
          count: this.testData.users.length,
        })
      );
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Method not allowed' }));
    }
  }

  /**
   * Handle credential-related requests
   */
  private handleCredentialRequests(path: string, method: string, req: any, res: any): void {
    if (method === 'GET' && path === '/api/v1/credentials') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: this.testData.credentials,
          count: this.testData.credentials.length,
        })
      );
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Method not allowed' }));
    }
  }

  /**
   * Handle tag-related requests
   */
  private handleTagRequests(path: string, method: string, req: any, res: any): void {
    if (method === 'GET' && path === '/api/v1/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: this.testData.tags,
          count: this.testData.tags.length,
        })
      );
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Method not allowed' }));
    }
  }

  /**
   * Handle /me request
   */
  private handleMeRequest(res: any): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(this.testData.users[0])); // Return admin user
  }

  /**
   * Handle login request
   */
  private handleLoginRequest(res: any): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        token: 'test-jwt-token',
        user: this.testData.users[0],
      })
    );
  }
}

export default MockN8nServer;
