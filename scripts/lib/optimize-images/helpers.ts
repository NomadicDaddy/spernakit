/**
 * Image optimization helpers.
 *
 * Extracted from scripts/optimize-images.ts (max-lines split). Contains the
 * per-image WebP conversion / responsive-variant pipeline plus small fs
 * utilities. The CLI entrypoint (arg parsing, directory scan loop, summary
 * reporting) stays in scripts/optimize-images.ts.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png'];

export interface OptimizationOptions {
	dryRun: boolean;
	force: boolean;
	quality: number;
	sizes: number[];
}

export interface ImageVariant {
	path: string;
	size: string;
	width: number;
}

export interface OptimizationResult {
	dryRun?: boolean;
	error?: string;
	originalSize?: string;
	path: string;
	reason?: string;
	savings?: string;
	skipped?: boolean;
	success?: boolean;
	variants?: ImageVariant[];
	webpSize?: string;
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get all image files in a directory recursively
 */
export async function getImageFiles(dir: string, fileList: string[] = []): Promise<string[]> {
	const files = await fs.readdir(dir, { withFileTypes: true });

	for (const file of files) {
		const filePath = path.join(dir, file.name);

		if (file.isDirectory()) {
			// Skip node_modules and hidden directories
			if (!file.name.startsWith('.') && file.name !== 'node_modules') {
				await getImageFiles(filePath, fileList);
			}
		} else {
			const ext = path.extname(file.name).toLowerCase();
			if (SUPPORTED_FORMATS.includes(ext)) {
				fileList.push(filePath);
			}
		}
	}

	return fileList;
}

/**
 * Get file size in KB
 */
async function getFileSize(filePath: string): Promise<string> {
	const stats = await fs.stat(filePath);
	return (stats.size / 1024).toFixed(2);
}

/**
 * Convert image to WebP format
 */
async function convertToWebP(
	inputPath: string,
	outputPath: string,
	quality: number
): Promise<void> {
	await new Bun.Image(inputPath).webp({ quality }).write(outputPath);
}

/**
 * Generate responsive image variant
 */
async function generateResponsiveVariant(
	inputPath: string,
	outputPath: string,
	width: number,
	quality: number
): Promise<void> {
	const metadata = await new Bun.Image(inputPath).metadata();

	const pipeline = new Bun.Image(inputPath);
	if (metadata.width && metadata.width > width) {
		await pipeline
			.resize(width, undefined, { withoutEnlargement: true })
			.webp({ quality })
			.write(outputPath);
	} else {
		await pipeline.webp({ quality }).write(outputPath);
	}
}

/**
 * Optimize a single image
 */
export async function optimizeImage(
	imagePath: string,
	options: OptimizationOptions
): Promise<null | OptimizationResult> {
	const ext = path.extname(imagePath);
	const basename = path.basename(imagePath, ext);
	const dirname = path.dirname(imagePath);

	// Skip if this is already a WebP file
	if (ext === '.webp') {
		return null;
	}

	// Skip favicon files (they're already optimized by generate-favicons.js)
	if (
		basename.includes('favicon') ||
		basename.includes('android-chrome') ||
		basename.includes('apple-touch')
	) {
		return null;
	}

	const webpPath = path.join(dirname, `${basename}.webp`);
	const originalSize = await getFileSize(imagePath);

	// Check if WebP already exists and we're not forcing re-optimization
	if (!options.force && (await fileExists(webpPath))) {
		return {
			path: imagePath,
			reason: 'WebP already exists',
			skipped: true,
		};
	}

	if (options.dryRun) {
		return {
			dryRun: true,
			originalSize,
			path: imagePath,
		};
	}

	try {
		// Convert to WebP
		await convertToWebP(imagePath, webpPath, options.quality);
		const webpSize = await getFileSize(webpPath);
		const savings = ((1 - parseFloat(webpSize) / parseFloat(originalSize)) * 100).toFixed(1);

		const result: OptimizationResult = {
			originalSize,
			path: imagePath,
			savings: `${savings}%`,
			success: true,
			webpSize,
		};

		// Generate responsive variants if sizes are specified
		if (options.sizes.length > 0) {
			const metadata = await new Bun.Image(imagePath).metadata();
			result.variants = [];

			for (const size of options.sizes) {
				// Only generate variants smaller than the original
				if (metadata.width && size < metadata.width) {
					const variantPath = path.join(dirname, `${basename}-${size}w.webp`);
					await generateResponsiveVariant(imagePath, variantPath, size, options.quality);
					const variantSize = await getFileSize(variantPath);
					result.variants.push({
						path: variantPath,
						size: variantSize,
						width: size,
					});
				}
			}
		}

		return result;
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		return {
			error: typedErr.message,
			path: imagePath,
			success: false,
		};
	}
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(kb: number): string {
	if (kb < 1024) return `${kb} KB`;
	return `${(kb / 1024).toFixed(2)} MB`;
}
