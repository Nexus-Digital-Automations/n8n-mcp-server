// Mock implementation of fastmcp for Jest testing

// Mock FastMCP class
class MockFastMCP {
  constructor(options = {}) {
    this.name = options.name || 'test-server';
    this.version = options.version || '1.0.0';
    this.tools = [];
    this.sessions = [];
  }

  addTool(tool) {
    this.tools.push(tool);
    return this;
  }

  addResource() {
    return this;
  }

  addResourceTemplate() {
    return this;
  }

  addPrompt() {
    return this;
  }

  start() {
    return Promise.resolve();
  }

  on() {
    return this;
  }
}

// Mock UserError class
class MockUserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserError';
  }
}

// Export both default and named exports
/* eslint-env node */
/* eslint no-undef: "off" */
module.exports = {
  FastMCP: MockFastMCP,
  UserError: MockUserError,
  default: MockFastMCP,
};

// Also support named imports
module.exports.FastMCP = MockFastMCP;
module.exports.UserError = MockUserError;
