/**
 * File Storage Service
 * Handles file uploads to Cloudflare R2 via the backend API.
 * 
 * This service replaces the previous storage implementation and uses
 * direct browser-to-R2 uploads using presigned URLs.
 */

import { uploadFileToR2 } from './r2';

/**
 * Upload a file to storage and return the public URL.
 * The implementation uses Cloudflare R2 via the backend presign API.
 */
export async function uploadFileToStorage(file: File, folderName: string = 'documents'): Promise<string> {
  try {
    console.log(`[Storage] Uploading file: ${file.name} to folder: ${folderName}`);
    const publicUrl = await uploadFileToR2(file, folderName);
    console.log(`[Storage] Upload successful: ${publicUrl}`);
    return publicUrl;
  } catch (error: any) {
    console.error('[Storage] Upload failed:', error.message);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}
