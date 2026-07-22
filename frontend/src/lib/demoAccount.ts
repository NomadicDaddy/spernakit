/**
 * Fill input fields with demo credentials, dispatching events to trigger React state updates.
 * Uses native setter to bypass React's synthetic event system.
 */
function fillDemoCredentials(
	usernameInput: HTMLInputElement,
	passwordInput: HTMLInputElement,
	username: string,
	password: string
): void {
	const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
	// eslint-disable-next-line @typescript-eslint/unbound-method
	const setter = descriptor?.set;
	if (!setter) return;

	setter.call(usernameInput, username);
	setter.call(passwordInput, password);

	usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
	passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
}

export { fillDemoCredentials };
