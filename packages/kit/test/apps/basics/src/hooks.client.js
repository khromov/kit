import { env } from '$env/dynamic/public';

window.PUBLIC_DYNAMIC = env.PUBLIC_DYNAMIC;

/** @type{import("@sveltejs/kit").HandleClientError} */
export function handleError({ error, event, status, message }) {
	return event.url.pathname.endsWith('404-fallback')
		? undefined
		: { message: `${/** @type {Error} */ (error).message} (${status} ${message})` };
}

export function init() {
	console.log('init hooks.client.js');
}

/** @type{import("@sveltejs/kit").HandleRemote} */
export function handleRemote({ id, payload, key, url, init }) {
	// Store call info for testing
	if (!window.__handleRemoteCalls) {
		window.__handleRemoteCalls = [];
	}
	window.__handleRemoteCalls.push({ id, payload, key, url });

	// Allow tests to control behavior via URL parameters
	const testUrl = new URL(window.location.href);

	// Test 1: Add custom header
	if (testUrl.searchParams.get('handle_remote_test') === 'header') {
		return {
			init: {
				...init,
				headers: {
					...init.headers,
					'x-custom-test-header': 'test-value'
				}
			}
		};
	}

	// Test 2: Modify URL
	if (testUrl.searchParams.get('handle_remote_test') === 'url') {
		return {
			url: url + (url.includes('?') ? '&' : '?') + 'injected=true'
		};
	}

	// Test 3: Return custom response (mock data)
	if (testUrl.searchParams.get('handle_remote_test') === 'mock') {
		return new Response(
			JSON.stringify({
				type: 'success',
				result: 'mocked-result'
			}),
			{
				headers: {
					'Content-Type': 'application/json'
				}
			}
		);
	}

	// Default: no modification
	return;
}
