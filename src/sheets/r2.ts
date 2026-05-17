/**
 * Cloudflare R2 Storage Integration
 * Works with the backend API endpoint: POST /api/uploads/presign
 * 
 * The backend handles R2 authentication and presigned URL generation.
 * The frontend uses presigned URLs for direct browser uploads to R2.
 */

/**
 * Request a presigned upload URL from the backend
 */
async function getPresignedUrl(
  fileName: string,
  contentType: string,
  folder: string = 'documents'
): Promise<{ uploadUrl: string; publicUrl: string; fileKey: string }> {
  const apiUrl = '/api';
  
  const response = await fetch(`${apiUrl}/uploads/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: fileName,
      contentType,
      folder,
    }),
    credentials: 'include', // Send auth cookies
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Failed to get presigned URL: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Upload file to Cloudflare R2 using presigned URL
 * This is the main upload function used throughout the app
 */
export async function uploadFileToR2(
  file: File,
  folderName: string = 'documents'
): Promise<string> {
  try {
    const fileExt = file.name.split('.').pop() || 'bin';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const fileName = `${timestamp}_${randomStr}.${fileExt}`;
    
    // Get presigned upload URL from backend
    const { uploadUrl, publicUrl } = await getPresignedUrl(
      fileName,
      file.type || 'application/octet-stream',
      folderName
    );

    // Upload file directly to R2 using presigned URL
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`R2 upload failed: ${uploadResponse.statusText}`);
    }

    return publicUrl;
  } catch (error: any) {
    console.error('[R2] Upload error:', error.message);
    throw new Error(`Failed to upload file to R2: ${error.message}`);
  }
}

/**
 * Get a download URL for a private file (with auth)
 */
export async function getR2DownloadUrl(folder: string, fileId: string): Promise<string> {
  const apiUrl = '/api';
  
  try {
    const response = await fetch(
      `${apiUrl}/uploads/download/${folder}/${fileId}`,
      { credentials: 'include' }
    );

    if (!response.ok) {
      throw new Error(`Failed to get download URL: ${response.statusText}`);
    }

    const { downloadUrl } = await response.json();
    return downloadUrl;
  } catch (error: any) {
    console.error('[R2] Download URL error:', error.message);
    throw error;
  }
}
