#!/usr/bin/env bun
/**
 * Regression coverage for a validation failure naming the values a union actually accepts.
 *
 * The defect this gate was written for: Elysia builds its "should be one of" summary from each
 * union member's JSON Schema `type` rather than its `const`, so a union of string literals reported
 * `Property 'role' should be one of: 'string', 'string', 'string'`. The count of the allowed values
 * was the only information in the sentence. Anyone reading it had to open the route source to find
 * out what to send, which is the one thing a validation message exists to save them from.
 *
 * The property under test is that a union of literals reports its literals, that a union of plain
 * types still reports its types, and that neither reports the value the caller submitted. That last
 * one is why this formatter exists at all: Elysia's own `error.message` serialises the whole request
 * body, so posting a bad password to /auth/login would echo the password back.
 *
 * Runs fully in-process. Elysia and TypeBox are backend dependencies and this workspace does not
 * hoist them to the root, so both are resolved from the backend package rather than by bare
 * specifier.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeValidationError } from '../backend/src/utils/validationErrorMessage.ts';

interface TypeBuilder {
	Literal: (value: number | string) => object;
	Null: () => object;
	Number: (options?: Record<string, number>) => object;
	Object: (properties: Record<string, object>) => object;
	String: () => object;
	Union: (members: object[]) => object;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendRoot = join(repoRoot, 'backend');

const failures: string[] = [];

/**
 * Record a failure when a condition does not hold.
 *
 * @param condition - The expectation being checked.
 * @param message - What was expected, phrased so the failure output reads on its own.
 */
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

async function run(): Promise<void> {
	const elysia = (await import(Bun.resolveSync('elysia', backendRoot))) as {
		t: TypeBuilder;
		ValidationError: new (type: string, validator: unknown, value: unknown) => Error;
	};
	const { TypeCompiler } = (await import(
		Bun.resolveSync('@sinclair/typebox/compiler', backendRoot)
	)) as { TypeCompiler: { Compile: (schema: object) => unknown } };
	const { t, ValidationError } = elysia;

	/**
	 * Describe what a bad payload produces for a schema, the way a route would.
	 *
	 * @param schema - The object schema the route declares.
	 * @param value - The payload that fails it.
	 * @returns The message the client would be given in development.
	 */
	const describe = (schema: object, value: unknown): string =>
		describeValidationError(new ValidationError('body', TypeCompiler.Compile(schema), value));

	const roleSchema = t.Object({
		role: t.Union([t.Literal('ADMIN'), t.Literal('MANAGER'), t.Literal('USER')]),
	});
	const roleMessage = describe(roleSchema, { role: 'WIZARD' });

	for (const allowed of ["'ADMIN'", "'MANAGER'", "'USER'"]) {
		assert(
			roleMessage.includes(allowed),
			`a union of string literals names ${allowed} as an allowed value, got: ${roleMessage}`,
		);
	}
	assert(
		!roleMessage.includes("'string', 'string'"),
		`a union of string literals does not report the word string once per member, got: ${roleMessage}`,
	);
	assert(
		!roleMessage.includes('WIZARD'),
		`the message does not echo the submitted value back to the caller, got: ${roleMessage}`,
	);
	assert(
		roleMessage.includes('/role'),
		`the message names the property that failed, got: ${roleMessage}`,
	);

	// A union of plain types was already readable and has to stay that way.
	const mixedSchema = t.Object({ tag: t.Union([t.String(), t.Number(), t.Null()]) });
	const mixedMessage = describe(mixedSchema, { tag: true });
	for (const allowed of ["'string'", "'number'", "'null'"]) {
		assert(
			mixedMessage.includes(allowed),
			`a union of plain types still names ${allowed}, got: ${mixedMessage}`,
		);
	}

	const numericSchema = t.Object({ level: t.Union([t.Literal(1), t.Literal(2)]) });
	const numericMessage = describe(numericSchema, { level: 9 });
	assert(
		numericMessage.includes('1') && numericMessage.includes('2'),
		`a union of numeric literals names the numbers it accepts, got: ${numericMessage}`,
	);
	assert(
		!numericMessage.includes("'number', 'number'"),
		`a union of numeric literals does not report the word number once per member, got: ${numericMessage}`,
	);

	// Everything that is not a union has to come through untouched.
	const rangeSchema = t.Object({ count: t.Number({ maximum: 10, minimum: 1 }) });
	const rangeMessage = describe(rangeSchema, { count: 99 });
	assert(
		rangeMessage.includes('less or equal to 10'),
		`a range violation still reports its bound, got: ${rangeMessage}`,
	);
	assert(
		!rangeMessage.includes('99'),
		`a range violation does not echo the submitted value, got: ${rangeMessage}`,
	);

	if (failures.length > 0) {
		for (const failure of failures) console.error(`- ${failure}`);
		console.log(
			`[FAIL] validation-union-values: ${String(failures.length)} of the validation message rules do not hold`,
		);
		process.exit(1);
	}

	console.log(
		'[OK] validation-union-values: 4 union and range failures each report what the schema accepts and none report what was sent',
	);
	process.exit(0);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-validation-union-values:', err);
	process.exit(1);
});
