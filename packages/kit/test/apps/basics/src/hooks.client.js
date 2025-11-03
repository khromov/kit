import { env } from '$env/dynamic/public';

window.PUBLIC_DYNAMIC = env.PUBLIC_DYNAMIC;

/** @type{import("@sveltejs/kit").HandleClientNavigate} */
export async function handle({ event, resolve }) {
	// Log navigation events for testing
	if (typeof window !== 'undefined') {
		window.__sveltekit_navigation_events = window.__sveltekit_navigation_events || [];
		window.__sveltekit_navigation_events.push({
			url: event.url.pathname,
			type: event.type,
			params: event.params
		});
	}

	// Block navigation to paths starting with /blocked (for testing)
	if (event.url.pathname.startsWith('/blocked')) {
		return { status: 403, ok: false };
	}

	// Transform navigation: redirect /redirect-me to /redirected (for testing)
	if (event.url.pathname === '/redirect-me') {
		event.url.pathname = '/redirected';
	}

	const response = await resolve(event);
	return response;
}

/** @type{import("@sveltejs/kit").HandleClientError} */
export function handleError({ error, event, status, message }) {
	return event.url.pathname.endsWith('404-fallback')
		? undefined
		: { message: `${/** @type {Error} */ (error).message} (${status} ${message})` };
}

export function init() {
	console.log('init hooks.client.js');
}
