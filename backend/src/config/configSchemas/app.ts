import { z } from 'zod';

export const appSchema = z.object({
	description: z.string(),
	name: z.string(),
	slug: z.string(),
});
