/**
 * libs/client.js — HTTP Client for Researcher Backend Communication
 *
 * Provides a thin wrapper around the browser's fetch API for sending data to
 * the study server. Every request automatically includes participant metadata
 * (user_id, tab_id, current URL, extension version) so your server can
 * attribute incoming data to the correct participant and session without
 * requiring explicit parameters at each call site.
 *
 * Two public methods:
 *   - postRequest(path, params, callback, callback_err)
 *       Generic POST to any server endpoint. Used by logic.js for feed processing.
 *   - logEvent(eventType, params)
 *       Convenience wrapper that POSTs to "/event". Used throughout the extension
 *       to record participant behaviour (scroll, visibility, clicks, etc.).
 *
 * RESEARCHERS:
 *   - Your server must accept multipart/form-data POST requests.
 *   - If you move communication to a service worker, load this file there
 *     instead and remove it from the content_scripts list in manifest.json.
 *   - For HTTPS deployments, ensure your server has a valid TLS certificate;
 *     Chrome blocks mixed-content requests from HTTPS pages to HTTP servers.
 *   - The `data` field is JSON-stringified before being appended to the form,
 *     so your server should parse it accordingly.
 *
 * Server API contract (minimum expected endpoints):
 *
 *   POST /get_feed
 *     Request body: { tab_id, user_id, url, extension_version, data: JSON }
 *       where data = { feed_info: { id, url, startTime, type, response } }
 *     Response: { "feed": { "response": "<modified feed JSON string>" } }
 *
 *   POST /event
 *     Request body: { tab_id, user_id, url, extension_version, data: JSON }
 *       where data = { event_type: "<EventName>", ...other params }
 *     Response: any (ignored by the extension)
 */

class MainHttpClient {

    /**
     * @param {string} host - Base URL of the study server (from Globals.server_url).
     */
    constructor(host) {
        this.host = host;
        /** Extension version from manifest, sent with every request for debugging. */
        this.version = chrome.runtime.getManifest().version;
    }

    /**
     * getUrl() — Resolve a relative API path to an absolute URL.
     * @param {string} path - e.g. "/get_feed" or "/event"
     * @returns {string} Full URL.
     */
    getUrl(path) {
        return this.host + path;
    }

    /**
     * makeRequestBody() — Build the standard multipart form body for all requests.
     *
     * Every request includes these fields so your server always has the context
     * it needs without requiring callers to pass them explicitly:
     *   - tab_id           Unique ID for this browser tab session (resets on tab close).
     *   - user_id          Persistent participant identifier (survives restarts).
     *   - url              The page URL at the time of the request.
     *   - extension_version Useful for filtering data during staged rollouts.
     *   - data             JSON-encoded payload specific to this request type.
     *
     * @param {Object} params - The request-specific payload to encode into `data`.
     * @returns {FormData}
     */
    makeRequestBody(params) {
        let p = {
            tab_id: Globals.tab_id,
            user_id: Globals.user_id,
            url: document.URL,
            extension_version: this.version,
            data: JSON.stringify(params)
        };
        let body = new FormData();
        for (const [key, value] of Object.entries(p)) {
            body.append(key, value);
        }
        return body
    }

    /**
     * postRequest() — Send a POST request to the study server.
     *
     * Uses the browser's native fetch (not the overridden window.fetch from
     * injected.js — this runs in the content-script context which has its own
     * fetch implementation unaffected by the page-context override).
     *
     * @param {string}   path         - API endpoint path, e.g. "/get_feed".
     * @param {Object}   params       - Payload to JSON-encode into the `data` field.
     * @param {Function} callback     - Called with the parsed JSON response on success.
     * @param {Function} callback_err - Called with the error message on failure.
     */
    postRequest(path, params,
                callback = function (d) {},
                callback_err = function (s) {}) {
        let body = this.makeRequestBody(params);
        fetch(this.getUrl(path), {
            method: 'POST',
            body: body
        })
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error('Network response was not ok: ' + response.statusText);
                }
            })
            .then(data => {
                callback(data);
            })
            .catch(error => {
                console.log(path, " failed with error:", error.message, "Calling error callback");
                callback_err(error.message);
            });
    }

    /**
     * logEvent() — Record a participant behaviour event on the server.
     *
     * Convenience wrapper around postRequest that always targets the "/event"
     * endpoint and injects `event_type` into the payload. The server response
     * is ignored (fire-and-forget).
     *
     * RESEARCHERS: Your "/event" endpoint should persist these to a database
     * or append to a log file indexed by user_id and tab_id.
     *
     * @param {string} eventType - Human-readable event name (e.g. "TweetVisible").
     * @param {Object} params    - Additional event-specific fields.
     */
    logEvent(eventType, params = {}) {
        params['event_type'] = eventType;
        console.log("Logging:", params)
        this.postRequest("/event", params);
    }

}

/**
 * Singleton HTTP client instance used by all other scripts.
 * Initialised with the server URL from Globals (set in config.js).
 */
let client = new MainHttpClient(Globals["server_url"])
