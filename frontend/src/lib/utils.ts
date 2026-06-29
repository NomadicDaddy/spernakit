import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind CSS class names, resolving conflicts via `twMerge`. */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Get a required string value from FormData.
 * Throws if the field is missing, null, or is a File.
 *
 * @param formData - The FormData object
 * @param fieldName - The field name to retrieve
 * @returns The string value
 * @throws Error if the field is missing or is a File
 */
export function getFormString(formData: FormData, fieldName: string): string {
	const value = formData.get(fieldName);
	if (value === null) {
		throw new Error(`Form field "${fieldName}" is required but was not found`);
	}
	if (value instanceof File) {
		throw new Error(`Form field "${fieldName}" expected a string but received a file`);
	}
	return value;
}
