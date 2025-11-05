/** @import { RemoteQueryOverride } from '@sveltejs/kit' */
/** @import { RemoteFunctionResponse } from 'types' */
/** @import { Query } from './query.svelte.js' */
import * as devalue from 'devalue';
import { app, goto, query_map, remote_responses } from '../client.js';
import { HttpError, Redirect } from '@sveltejs/kit/internal';
import { tick } from 'svelte';
import { create_remote_cache_key, stringify_remote_arg } from '../../shared.js';

/**
 *
 * @param {string} url
 * @param {string} id - Remote function ID
 * @param {string} payload - Stringified arguments
 * @param {string} key - Cache key
 */
export async function remote_request(url, id, payload, key) {
	let request_url = url;
	/** @type {RequestInit} */
	let init = {
		headers: {
			// TODO in future, when we support forking, we will likely need
			// to grab this from context as queries will run before
			// `location.pathname` is updated
			'x-sveltekit-pathname': location.pathname,
			'x-sveltekit-search': location.search
		}
	};

	// Call handleRemote hook if it exists
	if (app.hooks.handleRemote) {
		const result = await app.hooks.handleRemote({
			id,
			payload,
			key,
			url: request_url,
			init
		});

		if (result instanceof Response) {
			// Hook returned a custom Response, use it directly
			const response_result = /** @type {RemoteFunctionResponse} */ (await result.json());

			if (response_result.type === 'redirect') {
				await goto(response_result.location);
				throw new Redirect(307, response_result.location);
			}

			if (response_result.type === 'error') {
				throw new HttpError(response_result.status ?? 500, response_result.error);
			}

			return response_result.result;
		} else if (result) {
			// Hook returned modified request options
			if (result.url !== undefined) {
				request_url = result.url;
			}
			if (result.init !== undefined) {
				init = result.init;
			}
		}
	}

	const response = await fetch(request_url, init);

	if (!response.ok) {
		throw new HttpError(500, 'Failed to execute remote function');
	}

	const result = /** @type {RemoteFunctionResponse} */ (await response.json());

	if (result.type === 'redirect') {
		await goto(result.location);
		throw new Redirect(307, result.location);
	}

	if (result.type === 'error') {
		throw new HttpError(result.status ?? 500, result.error);
	}

	return result.result;
}

/**
 * Client-version of the `query`/`prerender`/`cache` function from `$app/server`.
 * @param {string} id
 * @param {(key: string, args: string) => any} create
 */
export function create_remote_function(id, create) {
	return (/** @type {any} */ arg) => {
		const payload = stringify_remote_arg(arg, app.hooks.transport);
		const cache_key = create_remote_cache_key(id, payload);
		let entry = query_map.get(cache_key);

		let tracking = true;
		try {
			$effect.pre(() => {
				if (entry) entry.count++;
				return () => {
					const entry = query_map.get(cache_key);
					if (entry) {
						entry.count--;
						void tick().then(() => {
							if (!entry.count && entry === query_map.get(cache_key)) {
								query_map.delete(cache_key);
								delete remote_responses[cache_key];
							}
						});
					}
				};
			});
		} catch {
			tracking = false;
		}

		let resource = entry?.resource;
		if (!resource) {
			resource = create(cache_key, payload);

			Object.defineProperty(resource, '_key', {
				value: cache_key
			});

			query_map.set(
				cache_key,
				(entry = {
					count: tracking ? 1 : 0,
					resource
				})
			);

			resource
				.then(() => {
					void tick().then(() => {
						if (
							!(/** @type {NonNullable<typeof entry>} */ (entry).count) &&
							entry === query_map.get(cache_key)
						) {
							// If no one is tracking this resource anymore, we can delete it from the cache
							query_map.delete(cache_key);
						}
					});
				})
				.catch(() => {
					// error delete the resource from the cache
					// TODO is that correct?
					query_map.delete(cache_key);
				});
		}

		return resource;
	};
}

/**
 * @param {Array<Query<any> | RemoteQueryOverride>} updates
 */
export function release_overrides(updates) {
	for (const update of updates) {
		if ('release' in update) {
			update.release();
		}
	}
}

/**
 * @param {string} stringified_refreshes
 * @param {Array<Query<any> | RemoteQueryOverride>} updates
 */
export function refresh_queries(stringified_refreshes, updates = []) {
	const refreshes = Object.entries(devalue.parse(stringified_refreshes, app.decoders));

	// `refreshes` is a superset of `updates`
	for (const [key, value] of refreshes) {
		// If there was an optimistic update, release it right before we update the query
		const update = updates.find((u) => u._key === key);
		if (update && 'release' in update) {
			update.release();
		}
		// Update the query with the new value
		const entry = query_map.get(key);
		entry?.resource.set(value);
	}
}
