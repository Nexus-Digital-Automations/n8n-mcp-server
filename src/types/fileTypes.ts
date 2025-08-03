// File and binary data type definitions for n8n MCP server

export interface BinaryData {
  data: string; // Base64 encoded data
  mimeType: string;
  fileName?: string;
  fileSize?: number;
  directory?: string;
  fileExtension?: string;
}

export interface N8nBinaryDataResponse {
  data: string; // Base64 encoded
  mimeType: string;
  fileName: string;
  fileSize: number;
}

export interface FileUploadRequest {
  fileName: string;
  mimeType: string;
  data: string; // Base64 encoded data
  workflowId?: string;
  executionId?: string;
  nodeId?: string;
}

export interface FileDownloadRequest {
  fileId: string;
  workflowId?: string;
  executionId?: string;
  nodeId?: string;
}

export interface StaticFileInfo {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  workflowId?: string;
  executionId?: string;
  nodeId?: string;
  filePath?: string;
}

export interface FileStorageConfig {
  baseDirectory: string;
  maxFileSize: number; // in bytes
  allowedMimeTypes: string[];
  cleanupOlderThan?: number; // days
}

export interface FileTransferProgress {
  transferId: string;
  fileName: string;
  totalBytes: number;
  transferredBytes: number;
  percentComplete: number;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface FileSearchOptions {
  fileName?: string;
  mimeType?: string;
  workflowId?: string;
  executionId?: string;
  nodeId?: string;
  uploadedAfter?: string;
  uploadedBefore?: string;
  minFileSize?: number;
  maxFileSize?: number;
  limit?: number;
  offset?: number;
}

export interface FileOperationResult {
  success: boolean;
  fileId?: string;
  fileName?: string;
  message: string;
  fileSize?: number;
  transferId?: string;
}

export interface BinaryDataPayload {
  propertyName: string;
  data: BinaryData;
}

export interface WorkflowFileManifest {
  workflowId: string;
  workflowName: string;
  files: StaticFileInfo[];
  totalSize: number;
  fileCount: number;
  lastUpdated: string;
}

export interface FileCleanupResult {
  deletedFiles: number;
  freedSpace: number; // bytes
  errors: string[];
}

export interface FileValidationOptions {
  maxFileSize?: number;
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
  virusScan?: boolean;
}

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  detectedMimeType?: string;
  detectedExtension?: string;
  actualFileSize?: number;
}

// Helper types for different file operations
export type FileOperationType = 'upload' | 'download' | 'delete' | 'list' | 'cleanup';

export interface FileOperationLog {
  id: string;
  operation: FileOperationType;
  fileName: string;
  fileId?: string;
  workflowId?: string;
  executionId?: string;
  timestamp: string;
  success: boolean;
  error?: string;
  fileSize?: number;
}
