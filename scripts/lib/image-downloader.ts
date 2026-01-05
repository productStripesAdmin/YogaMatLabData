import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

export interface ImageDownloadResult {
  originalUrl: string;
  localPath: string;
  publicPath: string;
  success: boolean;
  error?: string;
}

/**
 * Downloads an image from a URL and saves it to the public directory
 * @param imageUrl - The URL of the image to download
 * @param slug - The mat slug to use for the filename
 * @param options - Download options
 * @returns Information about the downloaded image
 */
export async function downloadImage(
  imageUrl: string,
  slug: string,
  options: {
    outputDir?: string;
    maxWidth?: number;
    quality?: number;
  } = {}
): Promise<ImageDownloadResult> {
  const {
    outputDir = path.join(process.cwd(), 'public', 'images', 'mats'),
    maxWidth = 1200,
    quality = 85,
  } = options;

  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    // Get image buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine file extension from response headers or URL
    let extension = 'jpg';
    const contentType = response.headers.get('content-type');
    if (contentType) {
      if (contentType.includes('png')) extension = 'png';
      else if (contentType.includes('webp')) extension = 'webp';
      else if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = 'jpg';
    } else {
      // Fallback to URL extension
      const urlExt = imageUrl.split('.').pop()?.toLowerCase();
      if (urlExt && ['jpg', 'jpeg', 'png', 'webp'].includes(urlExt)) {
        extension = urlExt === 'jpeg' ? 'jpg' : urlExt;
      }
    }

    // Generate filename
    const filename = `${slug}.${extension}`;
    const outputPath = path.join(outputDir, filename);
    const publicPath = `/images/mats/${filename}`;

    // Process and optimize image with sharp
    let sharpInstance = sharp(buffer);

    // Resize if needed
    const metadata = await sharpInstance.metadata();
    if (metadata.width && metadata.width > maxWidth) {
      sharpInstance = sharpInstance.resize(maxWidth, null, {
        withoutEnlargement: true,
        fit: 'inside',
      });
    }

    // Convert to JPEG for consistency and smaller file size
    await sharpInstance
      .jpeg({ quality, progressive: true })
      .toFile(outputPath.replace(/\.\w+$/, '.jpg'));

    const finalPublicPath = publicPath.replace(/\.\w+$/, '.jpg');

    return {
      originalUrl: imageUrl,
      localPath: outputPath.replace(/\.\w+$/, '.jpg'),
      publicPath: finalPublicPath,
      success: true,
    };
  } catch (error) {
    return {
      originalUrl: imageUrl,
      localPath: '',
      publicPath: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Downloads multiple images in parallel
 * @param images - Array of image URLs with their corresponding slugs
 * @param options - Download options
 * @returns Array of download results
 */
export async function downloadImages(
  images: Array<{ url: string; slug: string }>,
  options: {
    outputDir?: string;
    maxWidth?: number;
    quality?: number;
    concurrency?: number;
  } = {}
): Promise<ImageDownloadResult[]> {
  const { concurrency = 3, ...downloadOptions } = options;

  const results: ImageDownloadResult[] = [];

  // Process images in batches to avoid overwhelming the server
  for (let i = 0; i < images.length; i += concurrency) {
    const batch = images.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(({ url, slug }) => downloadImage(url, slug, downloadOptions))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Generates a summary of download results
 */
export function summarizeDownloadResults(results: ImageDownloadResult[]): {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{ url: string; error: string }>;
} {
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const errors = results
    .filter((r) => !r.success)
    .map((r) => ({ url: r.originalUrl, error: r.error || 'Unknown error' }));

  return {
    total: results.length,
    successful,
    failed,
    errors,
  };
}
