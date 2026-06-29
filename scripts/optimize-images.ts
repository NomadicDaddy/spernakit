#!/usr/bin/env bun
/**
 * Image Optimization Script
 *
 * Optimizes images in the frontend/public directory by:
 * 1. Converting PNG/JPG to WebP format
 * 2. Compressing images while maintaining quality
 * 3. Generating responsive image variants
 * 4. Preserving original files for fallback
 *
 * Usage:
 *   bun scripts/optimize-images.ts [options]
 *
 * Options:
 *   --quality=<number>  WebP quality (1-100, default: 80)
 *   --sizes=<list>      Comma-separated sizes for responsive images (default: 320,640,1024,1280)
 *   --force             Re-optimize all images even if WebP exists
 *   --dry-run           Show what would be done without making changes
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { OptimizationOptions } from './lib/optimize-images/helpers.ts';

import {
	fileExists,
	formatBytes,
	getImageFiles,
	optimizeImage,
} from './lib/optimize-images/helpers.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DEFAULT_QUALITY = 80;
const DEFAULT_SIZES = [320, 640, 1024, 1280];
const PUBLIC_DIR = path.resolve(__dirname, '../frontend/public');

// Parse command line arguments
const args = process.argv.slice(2);
const options: OptimizationOptions = {
	dryRun: false,
	force: false,
	quality: DEFAULT_QUALITY,
	sizes: DEFAULT_SIZES,
};

args.forEach((arg) => {
	if (arg.startsWith('--quality=')) {
		const value = arg.split('=')[1];
		if (value) {
			options.quality = parseInt(value, 10);
		}
	} else if (arg.startsWith('--sizes=')) {
		const value = arg.split('=')[1];
		if (value) {
			options.sizes = value.split(',').map((s) => parseInt(s.trim(), 10));
		}
	} else if (arg === '--force') {
		options.force = true;
	} else if (arg === '--dry-run') {
		options.dryRun = true;
	}
});

// Validate options
if (options.quality < 1 || options.quality > 100) {
	console.error('Error: Quality must be between 1 and 100');
	process.exit(1);
}

/**
 * Main execution
 */
async function main(): Promise<void> {
	console.log('🖼️  Image Optimization Script\n');
	console.log(`📁 Directory: ${PUBLIC_DIR}`);
	console.log(`⚙️  Quality: ${options.quality}`);
	console.log(`📐 Responsive sizes: ${options.sizes.join(', ')}`);
	console.log(`🔄 Force re-optimization: ${options.force}`);
	console.log(`🧪 Dry run: ${options.dryRun}\n`);

	// Check if public directory exists
	if (!(await fileExists(PUBLIC_DIR))) {
		console.error(`❌ Error: Public directory not found: ${PUBLIC_DIR}`);
		process.exit(1);
	}

	// Get all image files
	console.log('🔍 Scanning for images...');
	const imageFiles = await getImageFiles(PUBLIC_DIR);

	if (imageFiles.length === 0) {
		console.log('✅ No images found to optimize');
		return;
	}

	console.log(`📊 Found ${imageFiles.length} image(s)\n`);

	// Optimize each image
	let totalOriginalSize = 0;
	let totalWebPSize = 0;
	let optimizedCount = 0;
	let skippedCount = 0;
	let errorCount = 0;

	for (const imagePath of imageFiles) {
		const result = await optimizeImage(imagePath, options);

		if (result) {
			if (result.skipped) {
				skippedCount++;
				console.log(
					`⏭️  Skipped: ${path.relative(PUBLIC_DIR, result.path)} (${result.reason})`
				);
			} else if (result.dryRun) {
				console.log(
					`🧪 Would optimize: ${path.relative(PUBLIC_DIR, result.path)} (${result.originalSize} KB)`
				);
			} else if (result.success) {
				optimizedCount++;
				totalOriginalSize += parseFloat(result.originalSize ?? '0');
				totalWebPSize += parseFloat(result.webpSize ?? '0');

				console.log(`✅ Optimized: ${path.relative(PUBLIC_DIR, result.path)}`);
				console.log(
					`   Original: ${result.originalSize} KB → WebP: ${result.webpSize} KB (${result.savings} savings)`
				);

				if (result.variants && result.variants.length > 0) {
					console.log(`   Generated ${result.variants.length} responsive variant(s):`);
					result.variants.forEach((v) => {
						console.log(`     - ${v.width}w: ${v.size} KB`);
					});
				}
			} else if (result.error) {
				errorCount++;
				console.error(`❌ Error: ${path.relative(PUBLIC_DIR, result.path)}`);
				console.error(`   ${result.error}`);
			}
		}
	}

	// Summary
	console.log(`\n${'='.repeat(60)}`);
	console.log('📊 Optimization Summary\n');
	console.log(`Total images processed: ${imageFiles.length}`);
	console.log(`✅ Optimized: ${optimizedCount}`);
	console.log(`⏭️  Skipped: ${skippedCount}`);
	console.log(`❌ Errors: ${errorCount}`);

	if (!options.dryRun && optimizedCount > 0) {
		const totalSavings = totalOriginalSize - totalWebPSize;
		const savingsPercent = ((totalSavings / totalOriginalSize) * 100).toFixed(1);

		console.log(`\n💾 Total size reduction:`);
		console.log(`   Original: ${formatBytes(totalOriginalSize)}`);
		console.log(`   WebP: ${formatBytes(totalWebPSize)}`);
		console.log(`   Savings: ${formatBytes(totalSavings)} (${savingsPercent}%)`);
	}

	console.log('='.repeat(60));

	if (options.dryRun) {
		console.log('\n🧪 This was a dry run. No files were modified.');
		console.log('   Run without --dry-run to perform optimization.');
	}
}

main().catch((err: unknown) => {
	console.error('❌ Fatal error:', err);
	process.exit(1);
});
