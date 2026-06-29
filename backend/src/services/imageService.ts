import { logger } from '../utils/logger.ts';

const THUMBNAIL_WIDTH = 200;
const THUMBNAIL_HEIGHT = 200;

const IMAGE_MIME_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);

function isProcessableImage(mimeType: string): boolean {
	return IMAGE_MIME_TYPES.has(mimeType);
}

async function generateThumbnail(data: Buffer): Promise<Buffer | null> {
	try {
		return await new Bun.Image(data)
			.resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 80 })
			.toBuffer();
	} catch (err) {
		logger.warn({ err }, 'thumbnail generation failed');
		return null;
	}
}

export { generateThumbnail, isProcessableImage };
