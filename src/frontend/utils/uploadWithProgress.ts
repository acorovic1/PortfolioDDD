export type UploadResult = { status: number; ok: boolean; body: unknown };

// fetch() has no upload-progress event, so uploads that need a progress bar
// (large .glb models especially) go through XMLHttpRequest instead.
export function uploadWithProgress(
  url: string,
  formData: FormData,
  headers: Record<string, string>,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON response, leave body null
      }
      resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, body });
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));

    xhr.send(formData);
  });
}
