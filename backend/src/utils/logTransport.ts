import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * Resolve a transport module to an absolute path.
 *
 * pino resolves a bare target name against the files on the stack that called it, which under Bun
 * is the process entry rather than this module. A process that starts anywhere outside backend/
 * therefore dies with "unable to determine transport target for pino-pretty" instead of logging.
 * Resolving from this file gives the same answer for every entry point.
 *
 * @param name - Transport package to resolve
 * @returns Absolute path pino can load without consulting the call stack
 */
function resolveTransport(name: string): string {
	return createRequire(import.meta.url).resolve(name);
}

/**
 * Resolve a transport that may not be installed.
 *
 * pino-pretty is a devDependency, so an image built from production dependencies does not carry
 * it. docker-local runs exactly that image with a development configuration, and there the
 * transport worker failed to load its target and the backend exited before serving a request.
 * Resolution alone does not answer the question: a production install can leave the package's link
 * in node_modules pointing at a store entry it never fetched, and resolving then returns that
 * dangling path instead of throwing. So the resolved path is checked for existence too.
 *
 * @param name - Transport package to resolve
 * @param resolve - Resolver, injectable so a gate can simulate a missing or dangling package
 * @returns Absolute path of an installed transport, or undefined when it is not usable
 */
function resolveOptionalTransport(
	name: string,
	resolve: (name: string) => string = resolveTransport,
): string | undefined {
	try {
		const path = resolve(name);
		return existsSync(path) ? path : undefined;
	} catch {
		return undefined;
	}
}

export { resolveOptionalTransport, resolveTransport };
