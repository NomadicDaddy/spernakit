import type { SignOptions } from 'jsonwebtoken';

import jwt from 'jsonwebtoken';

import type { UserRole } from '../types/roles.ts';

import { getConfig } from '../config/configLoader.ts';
import { logger } from '../utils/logger.ts';

interface AuthPayload {
	id: number;
	impersonatedBy?: number;
	isApiKey?: boolean;
	role: UserRole;
	typ?: 'access' | 'refresh';
}

interface TokenPair {
	accessToken: string;
	refreshToken: string;
}

function signAccessToken(payload: AuthPayload): string {
	const config = getConfig();
	return jwt.sign({ ...payload, typ: 'access' }, config.security.jwtPrivateKey, {
		algorithm: 'ES256',
		audience: config.server.frontendUrl,
		expiresIn: config.security.jwtExpiresIn,
		issuer: config.server.backendUrl,
	} as SignOptions);
}

function signRefreshToken(payload: AuthPayload): string {
	const config = getConfig();
	return jwt.sign({ ...payload, typ: 'refresh' }, config.security.jwtRefreshPrivateKey, {
		algorithm: 'ES256',
		audience: config.server.frontendUrl,
		expiresIn: config.security.jwtRefreshExpiresIn,
		issuer: config.server.backendUrl,
	} as SignOptions);
}

function signTokenPair(payload: AuthPayload): TokenPair {
	return {
		accessToken: signAccessToken(payload),
		refreshToken: signRefreshToken(payload),
	};
}

function verifyWithKey(
	token: string,
	publicKey: string,
	audience: string,
	issuer: string
): AuthPayload | null {
	try {
		return jwt.verify(token, publicKey, {
			algorithms: ['ES256'],
			audience,
			issuer,
		}) as AuthPayload;
	} catch (err) {
		logger.debug({ audience, err, issuer }, 'JWT verification failed');
		return null;
	}
}

function verifyAccessToken(token: string): AuthPayload | null {
	const config = getConfig();

	if (token.length > config.security.maxTokenSize) {
		logger.warn({ tokenLength: token.length }, 'Access token exceeds maximum size');
		return null;
	}

	const audience = config.server.frontendUrl;
	const issuer = config.server.backendUrl;

	let decoded = verifyWithKey(token, config.security.jwtPublicKey, audience, issuer);
	if (!decoded && config.security.jwtPublicKeyPrevious) {
		decoded = verifyWithKey(token, config.security.jwtPublicKeyPrevious, audience, issuer);
	}

	if (!decoded) return null;
	if (decoded.typ !== 'access') {
		logger.warn('Token type mismatch: expected access token');
		return null;
	}
	return decoded;
}

function verifyRefreshToken(token: string): AuthPayload | null {
	const config = getConfig();

	if (token.length > config.security.maxTokenSize) {
		logger.warn({ tokenLength: token.length }, 'Refresh token exceeds maximum size');
		return null;
	}

	const audience = config.server.frontendUrl;
	const issuer = config.server.backendUrl;

	let decoded = verifyWithKey(token, config.security.jwtRefreshPublicKey, audience, issuer);
	if (!decoded && config.security.jwtRefreshPublicKeyPrevious) {
		decoded = verifyWithKey(
			token,
			config.security.jwtRefreshPublicKeyPrevious,
			audience,
			issuer
		);
	}

	if (!decoded) return null;
	if (decoded.typ !== 'refresh') {
		logger.warn('Token type mismatch: expected refresh token');
		return null;
	}
	return decoded;
}

export {
	type AuthPayload,
	parseCookies,
	signAccessToken,
	signTokenPair,
	verifyAccessToken,
	verifyRefreshToken,
};

function parseCookies(cookieHeader: string): Record<string, string> {
	const cookies: Record<string, string> = {};
	for (const pair of cookieHeader.split(';')) {
		const trimmed = pair.trim();
		const eqIdx = trimmed.indexOf('=');
		if (eqIdx > 0) {
			const name = trimmed.substring(0, eqIdx);
			const value = trimmed.substring(eqIdx + 1);
			try {
				cookies[name] = decodeURIComponent(value);
			} catch {
				cookies[name] = value;
			}
		}
	}
	return cookies;
}
