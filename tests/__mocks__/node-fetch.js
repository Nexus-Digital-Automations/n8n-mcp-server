// Mock implementation of node-fetch for Jest testing
/* eslint-env jest, node */
const mockFetch = jest.fn();

// Mock Response class
class MockResponse {
  constructor(body, options = {}) {
    this.body = body;
    this.ok = options.ok !== undefined ? options.ok : true;
    this.status = options.status || 200;
    this.statusText = options.statusText || 'OK';
    this.headers = {
      get: jest.fn().mockReturnValue(options.contentType || 'application/json')
    };
  }

  async json() {
    // Handle the case where response should not have json() method
    if (this.headers.get('content-type') === 'text/plain' || this.status === 204) {
      throw new Error('response.json is not a function');
    }
    // Handle empty responses (like DELETE operations)
    if (this.body === '' || this.body === null || this.body === undefined) {
      return {};
    }
    if (typeof this.body === 'string') {
      try {
        return JSON.parse(this.body);
      } catch {
        // If JSON parsing fails, return empty object for DELETE operations
        return {};
      }
    }
    return this.body;
  }

  async text() {
    if (typeof this.body === 'object') {
      return JSON.stringify(this.body);
    }
    return this.body || '';
  }
}

// Default mock implementation - return empty successful response
mockFetch.mockResolvedValue(new MockResponse('', { status: 200, ok: true }));

// Export both default and named exports
/* eslint no-undef: "off" */
module.exports = mockFetch;
module.exports.default = mockFetch;
module.exports.Response = MockResponse;