import { Type, withEmptyDefault } from '../configSchemaHelpers';

export const storageS3Schema = Type.Object({
	accessKeyId: Type.String({ default: '' }),
	bucket: Type.String({ default: '' }),
	endpoint: Type.String({ default: '' }),
	region: Type.String({ default: '' }),
	secretAccessKey: Type.String({ default: '' }),
});

export const storageSchema = Type.Object({
	adapter: Type.Union([Type.Literal('local'), Type.Literal('s3')], { default: 'local' }),
	allowedMimeTypes: Type.Array(Type.String(), {
		default: [
			'image/jpeg',
			'image/png',
			'image/gif',
			'image/webp',
			'application/pdf',
			'text/plain',
			'text/csv',
			'application/json',
		],
	}),
	maxFileSize: Type.Integer(),
	s3: withEmptyDefault(storageS3Schema),
});
