/**
 * Utility functions for handling Received Copy and image/document uploads.
 */

export const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

export const compressImageIfNeeded = (
  dataUrl: string,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.85
): Promise<string> => {
  return new Promise((resolve) => {
    // If not an image (e.g. PDF), return original data URL
    if (!dataUrl.startsWith('data:image/')) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Check if resizing needed
      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
};

export const downloadDataUrl = (dataUrl: string, fileName: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
