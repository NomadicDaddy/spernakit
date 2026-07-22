import { Type, enumString, withDefault } from '../configSchemaHelpers';

export const loggingFileSchema = Type.Object({
	enabled: Type.Boolean({ default: false }),
	maxFiles: Type.Integer({ default: 10, exclusiveMinimum: 0 }),
	maxSize: Type.String({ default: '10M' }),
	path: Type.String({ default: './logs/app.log' }),
});

export const loggingSchema = Type.Object({
	file: withDefault(loggingFileSchema, {
		enabled: false,
		maxFiles: 10,
		maxSize: '10M',
		path: './logs/app.log',
	}),
	level: enumString(['debug', 'info', 'warn', 'error'], { default: 'info' }),
});
