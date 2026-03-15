/**
 * config.js — Global Configuration
 *
 * This file defines the global settings shared across all extension scripts.
 * It is the first script loaded (see manifest.json), so all other scripts can
 * safely read from `Globals` at startup.
 *
 * RESEARCHERS: The two most common things to change here are:
 *   - `server_url`: point this to your study backend
 *   - `alive_interval`: frequency (ms) of heartbeat pings to your server
 *
 * The extension automatically detects whether it is running in developer mode
 * (loaded unpacked from disk) or production mode (distributed via Chrome Web
 * Store). In dev mode it falls back to localhost so you can test locally without
 * changing any URLs.
 */

let Globals = {
    /**
     * How often (in milliseconds) the extension sends an "Alive" heartbeat to
     * the server. Useful for tracking active session duration.
     * Default: 10000 ms (10 seconds)
     */
    alive_interval: 10000,

    /**
     * The participant's unique identifier. This is set at runtime in launcher.js
     * after being read from (or generated into) Chrome's synced storage.
     * It is null here and populated before any network calls are made.
     */
    user_id: null,

    /**
     * Base URL of your study backend.
     * All API calls in client.js are made relative to this URL.
     * Replace with your own server endpoint before distributing to participants.
     */
    server_url: "https://youronlineservice.com"
}

/**
 * Dev mode detection.
 * Chrome extensions distributed through the Web Store have an `update_url`
 * field in their manifest; locally loaded ("unpacked") extensions do not.
 * We use this to automatically switch to a local server during development,
 * so you never accidentally send test traffic to the production server.
 */
const isDevMode = !('update_url' in chrome.runtime.getManifest());
if (isDevMode) {
    Globals['server_url'] = "http://localhost:5000"
}
