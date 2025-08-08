import fetch from 'node-fetch';
import { N8nClient } from './n8nClient.js';
import {
  BinaryData,
  N8nBinaryDataResponse,
  FileUploadRequest,
  FileDownloadRequest,
  StaticFileInfo,
  FileTransferProgress,
} from '../types/fileTypes.js';

export class BinaryDataClient {
  constructor(
    private client: N8nClient,
    private baseUrl: string,
    private apiKey: string
  ) {
    // Remove trailing slash if present
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async makeRequest<T>(
    endpoint: string,
    options: Record<string, unknown> = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    const headers = {
      'X-N8N-API-KEY': this.apiKey,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      } as any);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Handle different response types
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      } else if (
        contentType.includes('application/octet-stream') ||
        contentType.startsWith('image/') ||
        contentType.startsWith('video/')
      ) {
        // Return buffer for binary data
        return (await response.buffer()) as unknown as T;
      } else {
        return (await response.text()) as unknown as T;
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Request failed: ${error.message}`);
      }
      throw new Error('Request failed with unknown error');
    }
  }

  private async makeFormDataRequest<T>(
    endpoint: string,
    formData: any,
    options: Record<string, unknown> = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    const headers = {
      'X-N8N-API-KEY': this.apiKey,
      ...((options.headers as Record<string, string>) || {}),
      // Note: Don't set Content-Type for FormData - let fetch set it with boundary
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        ...options,
        headers,
        body: formData,
      } as any);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      } else {
        return (await response.text()) as unknown as T;
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Form data request failed: ${error.message}`);
      }
      throw new Error('Form data request failed with unknown error');
    }
  }

  /**
   * Upload binary data to n8n
   */
  async uploadBinaryData(request: FileUploadRequest): Promise<StaticFileInfo> {
    // Convert base64 to Buffer
    const buffer = Buffer.from(request.data, 'base64');

    // Create FormData for multipart upload
    const FormData = (await import('form-data')).default;
    const form = new FormData();

    form.append('file', buffer, {
      filename: request.fileName,
      contentType: request.mimeType,
    });

    if (request.workflowId) form.append('workflowId', request.workflowId);
    if (request.executionId) form.append('executionId', request.executionId);
    if (request.nodeId) form.append('nodeId', request.nodeId);

    return this.makeFormDataRequest<StaticFileInfo>('/binary-data/upload', form);
  }

  /**
   * Download binary data from n8n
   */
  async downloadBinaryData(request: FileDownloadRequest): Promise<N8nBinaryDataResponse> {
    const queryParams = new URLSearchParams();
    if (request.workflowId) queryParams.append('workflowId', request.workflowId);
    if (request.executionId) queryParams.append('executionId', request.executionId);
    if (request.nodeId) queryParams.append('nodeId', request.nodeId);

    const query = queryParams.toString();
    const endpoint = `/binary-data/${encodeURIComponent(request.fileId)}${query ? `?${query}` : ''}`;

    return this.makeRequest<N8nBinaryDataResponse>(endpoint);
  }

  /**
   * Get binary data from execution output
   */
  async getExecutionBinaryData(
    executionId: string,
    nodeId: string,
    outputIndex: number = 0,
    itemIndex: number = 0,
    propertyName: string = 'data'
  ): Promise<Buffer> {
    const endpoint = `/executions/${encodeURIComponent(executionId)}/binary-data`;
    const queryParams = new URLSearchParams({
      nodeId,
      outputIndex: outputIndex.toString(),
      itemIndex: itemIndex.toString(),
      propertyName,
    });

    return this.makeRequest<Buffer>(`${endpoint}?${queryParams.toString()}`);
  }

  /**
   * Upload binary data for workflow input
   */
  async uploadWorkflowBinaryData(
    workflowId: string,
    nodeId: string,
    data: Buffer,
    fileName: string,
    mimeType: string,
    propertyName: string = 'data'
  ): Promise<StaticFileInfo> {
    const FormData = (await import('form-data')).default;
    const form = new FormData();

    form.append('file', data, {
      filename: fileName,
      contentType: mimeType,
    });
    form.append('workflowId', workflowId);
    form.append('nodeId', nodeId);
    form.append('propertyName', propertyName);

    return this.makeFormDataRequest<StaticFileInfo>('/workflows/binary-data/upload', form);
  }

  /**
   * Delete binary data
   */
  async deleteBinaryData(fileId: string): Promise<{ success: boolean; message: string }> {
    return this.makeRequest<{ success: boolean; message: string }>(
      `/binary-data/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE',
      }
    );
  }

  /**
   * List binary data files
   */
  async listBinaryData(
    options: {
      workflowId?: string;
      executionId?: string;
      nodeId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<StaticFileInfo[]> {
    const queryParams = new URLSearchParams();

    if (options.workflowId) queryParams.append('workflowId', options.workflowId);
    if (options.executionId) queryParams.append('executionId', options.executionId);
    if (options.nodeId) queryParams.append('nodeId', options.nodeId);
    if (options.limit) queryParams.append('limit', options.limit.toString());
    if (options.offset) queryParams.append('offset', options.offset.toString());

    const query = queryParams.toString();
    const endpoint = `/binary-data${query ? `?${query}` : ''}`;

    return this.makeRequest<StaticFileInfo[]>(endpoint);
  }

  /**
   * Get binary data metadata
   */
  async getBinaryDataMetadata(fileId: string): Promise<StaticFileInfo> {
    return this.makeRequest<StaticFileInfo>(`/binary-data/${encodeURIComponent(fileId)}/metadata`);
  }

  /**
   * Stream large file upload with progress tracking
   */
  async uploadLargeFile(
    data: Buffer,
    fileName: string,
    mimeType: string,
    options: {
      workflowId?: string;
      executionId?: string;
      nodeId?: string;
      chunkSize?: number;
      onProgress?: (progress: FileTransferProgress) => void;
    } = {}
  ): Promise<StaticFileInfo> {
    const chunkSize = options.chunkSize || 1024 * 1024; // 1MB chunks
    const totalSize = data.length;
    const transferId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize progress tracking
    const progress: FileTransferProgress = {
      transferId,
      fileName,
      totalBytes: totalSize,
      transferredBytes: 0,
      percentComplete: 0,
      status: 'pending',
      startedAt: new Date().toISOString(),
    };

    try {
      progress.status = 'in-progress';
      options.onProgress?.(progress);

      // For now, upload as single chunk (can be enhanced for true chunked upload)
      const FormData = (await import('form-data')).default;
      const form = new FormData();

      form.append('file', data, {
        filename: fileName,
        contentType: mimeType,
      });

      if (options.workflowId) form.append('workflowId', options.workflowId);
      if (options.executionId) form.append('executionId', options.executionId);
      if (options.nodeId) form.append('nodeId', options.nodeId);
      form.append('transferId', transferId);

      const result = await this.makeFormDataRequest<StaticFileInfo>('/binary-data/upload', form);

      progress.status = 'completed';
      progress.transferredBytes = totalSize;
      progress.percentComplete = 100;
      progress.completedAt = new Date().toISOString();
      options.onProgress?.(progress);

      return result;
    } catch (error) {
      progress.status = 'failed';
      progress.error = error instanceof Error ? error.message : 'Unknown error';
      progress.completedAt = new Date().toISOString();
      options.onProgress?.(progress);
      throw error;
    }
  }
}
