// Type definitions for FastMCP mocked in tests
declare module 'fastmcp' {
  export interface FastMCPOptions {
    name: string;
    version: string;
    instructions?: string;
  }

  export interface ToolOptions {
    name: string;
    description: string;
    parameters: any;
    annotations?: {
      title?: string;
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
      openWorldHint?: boolean;
    };
    execute: any; // Allow any function type for mocking flexibility
  }

  export class FastMCP {
    constructor(options: FastMCPOptions);
    addTool(tool: ToolOptions): this;
    addResource(resource: any): this;
    addResourceTemplate(template: any): this;
    addPrompt(prompt: any): this;
    start(options?: any): Promise<void>;
    on(event: string, handler: Function): this;
  }

  export class UserError extends Error {
    constructor(message: string);
  }
}
