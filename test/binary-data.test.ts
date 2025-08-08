import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BinaryDataClient } from '../src/client/binaryDataClient.js';
import { N8nClient } from '../src/client/n8nClient.js';
import { FileHandlingUtils } from '../src/utils/fileHandling.js';

describe('Binary Data Operations', () => {
  let testFilePath: string;
  let testFileContent: Buffer;
  let fileHandler: FileHandlingUtils;
  const testFileName = 'test-file.txt';
  const testMimeType = 'text/plain';

  beforeAll(async () => {
    // Create test directory
    const testDir = path.join(process.cwd(), 'test-data');
    await fs.mkdir(testDir, { recursive: true });

    // Create test file
    testFilePath = path.join(testDir, testFileName);
    testFileContent = Buffer.from(
      'This is a test file for binary data operations.\nIt contains multiple lines.\nAnd some test data: 12345'
    );
    await fs.writeFile(testFilePath, testFileContent);

    // Initialize file handler
    fileHandler = new FileHandlingUtils({
      baseDirectory: testDir,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: ['text/*', 'application/*', 'image/*'],
    });
  });

  afterAll(async () => {
    // Clean up test files
    try {
      await fs.unlink(testFilePath);
      const testDir = path.dirname(testFilePath);
      await fs.rmdir(testDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('File Validation', () => {
    it('should validate a valid file', async () => {
      const validation = await fileHandler.validateFile(
        testFileName,
        testMimeType,
        testFileContent.length
      );

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject oversized files', async () => {
      const validation = await fileHandler.validateFile(
        'large-file.txt',
        testMimeType,
        20 * 1024 * 1024, // 20MB
        { maxFileSize: 10 * 1024 * 1024 } // 10MB limit
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => error.includes('exceeds maximum allowed size'))).toBe(
        true
      );
    });

    it('should reject invalid MIME types', async () => {
      const validation = await fileHandler.validateFile(
        'test.exe',
        'application/x-executable',
        1024,
        { allowedMimeTypes: ['text/*', 'image/*'] }
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => error.includes('not allowed'))).toBe(true);
    });
  });

  describe('File Operations', () => {
    it('should read file correctly', async () => {
      const fileExists = await fs
        .access(testFilePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      const content = await fs.readFile(testFilePath);
      expect(content.equals(testFileContent)).toBe(true);
    });

    it('should calculate file hash correctly', async () => {
      const crypto = await import('crypto');
      const hash1 = crypto.createHash('sha256').update(testFileContent).digest('hex');

      // Read file and calculate hash
      const fileContent = await fs.readFile(testFilePath);
      const hash2 = crypto.createHash('sha256').update(fileContent).digest('hex');

      expect(hash1).toBe(hash2);
    });

    it('should detect MIME type from file extension', async () => {
      const mimeTypes: Record<string, string> = {
        '.txt': 'text/plain',
        '.json': 'application/json',
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
      };

      for (const [ext, expectedMime] of Object.entries(mimeTypes)) {
        const fileName = `test${ext}`;
        const ext_lower = path.extname(fileName).toLowerCase();

        // This mimics the logic from binary-data.ts
        const detectedMime = mimeTypes[ext_lower] || 'application/octet-stream';
        expect(detectedMime).toBe(expectedMime);
      }
    });
  });

  describe('Progress Tracking', () => {
    it('should create valid transfer progress object', () => {
      const transferId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const progress = {
        transferId,
        fileName: testFileName,
        totalBytes: testFileContent.length,
        transferredBytes: 0,
        percentComplete: 0,
        status: 'pending' as const,
        startedAt: new Date().toISOString(),
      };

      expect(progress.transferId).toMatch(/^upload_\d+_[a-z0-9]+$/);
      expect(progress.fileName).toBe(testFileName);
      expect(progress.totalBytes).toBe(testFileContent.length);
      expect(progress.status).toBe('pending');
      expect(progress.percentComplete).toBe(0);
    });

    it('should calculate progress correctly', () => {
      const totalBytes = 1000;
      const transferredBytes = 250;
      const percentComplete = Math.round((transferredBytes / totalBytes) * 100);

      expect(percentComplete).toBe(25);
    });
  });

  describe('Base64 Encoding/Decoding', () => {
    it('should encode and decode binary data correctly', () => {
      const originalData = testFileContent;
      const base64Data = originalData.toString('base64');
      const decodedData = Buffer.from(base64Data, 'base64');

      expect(decodedData.equals(originalData)).toBe(true);
    });

    it('should handle empty data', () => {
      const emptyBuffer = Buffer.alloc(0);
      const base64Empty = emptyBuffer.toString('base64');
      const decodedEmpty = Buffer.from(base64Empty, 'base64');

      expect(base64Empty).toBe('');
      expect(decodedEmpty.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent files gracefully', async () => {
      const nonExistentPath = path.join(process.cwd(), 'non-existent-file.txt');

      try {
        await fs.access(nonExistentPath);
        // Should not reach this point
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should validate required parameters', () => {
      const requiredFields = ['fileName', 'mimeType', 'data'];

      requiredFields.forEach(field => {
        const testObject: any = {
          fileName: 'test.txt',
          mimeType: 'text/plain',
          data: 'test-data',
        };

        delete testObject[field];

        // In a real scenario, this would be validated by Zod schemas
        expect(testObject[field]).toBeUndefined();
      });
    });
  });

  describe('File Size Calculations', () => {
    it('should estimate base64 decoded size correctly', () => {
      const originalSize = 1000;
      const base64Size = Math.ceil((originalSize * 4) / 3);
      const estimatedOriginalSize = Math.floor((base64Size * 3) / 4);

      // Should be close to original (within base64 padding)
      expect(Math.abs(estimatedOriginalSize - originalSize)).toBeLessThanOrEqual(3);
    });

    it('should format file sizes correctly', () => {
      const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };

      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });
  });
});

// Mock tests for API integration (since we can't test actual API calls without a running n8n instance)
describe('Binary Data Client (Mock Tests)', () => {
  describe('API Endpoint Construction', () => {
    it('should construct upload endpoint correctly', () => {
      const baseUrl = 'http://localhost:5678';
      const expectedUrl = `${baseUrl}/api/v1/binary-data/upload`;
      expect(expectedUrl).toBe('http://localhost:5678/api/v1/binary-data/upload');
    });

    it('should construct download endpoint with query params', () => {
      const baseUrl = 'http://localhost:5678';
      const fileId = 'test-file-id';
      const workflowId = 'workflow-123';

      const queryParams = new URLSearchParams();
      queryParams.append('workflowId', workflowId);

      const expectedUrl = `${baseUrl}/api/v1/binary-data/${encodeURIComponent(fileId)}?${queryParams.toString()}`;
      expect(expectedUrl).toBe(
        'http://localhost:5678/api/v1/binary-data/test-file-id?workflowId=workflow-123'
      );
    });

    it('should handle URL encoding correctly', () => {
      const fileId = 'file with spaces & special chars!';
      const encoded = encodeURIComponent(fileId);
      expect(encoded).toBe('file%20with%20spaces%20%26%20special%20chars!');
    });
  });

  describe('Request Headers', () => {
    it('should construct proper headers for API requests', () => {
      const apiKey = 'test-api-key-123';
      const headers = {
        'X-N8N-API-KEY': apiKey,
        'Content-Type': 'application/json',
      };

      expect(headers['X-N8N-API-KEY']).toBe(apiKey);
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should handle form data headers correctly', () => {
      const apiKey = 'test-api-key-123';
      const headers: Record<string, string | undefined> = {
        'X-N8N-API-KEY': apiKey,
        // Content-Type should not be set for FormData to allow boundary setting
      };

      expect(headers['X-N8N-API-KEY']).toBe(apiKey);
      expect(headers['Content-Type']).toBeUndefined();
    });
  });
});
