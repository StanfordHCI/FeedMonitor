/**
 * logic.js — Feed Processing Bridge (Content Script ↔ Server)
 *
 * This script is the central coordination point between the network
 * interception layer (injected.js) and your study backend.
 *
 * Responsibility:
 *   1. Listen for "ProcessResponse" events fired by injected.js whenever a
 *      subscribed feed endpoint returns data.
 *   2. Forward the raw feed JSON to your server via a POST request.
 *   3. Receive the server's response (e.g., a reranked or filtered feed).
 *   4. Fire a "CustomFeedReady" event so injected.js can deliver the modified
 *      response to X's frontend in place of the original.
 *
 * RESEARCHERS: This is the primary file to customise for your experiment.
 *   - Change the server endpoint ("/get_feed") if your API uses a different path.
 *   - Add error-handling logic in the error callback (currently a no-op) to
 *     decide what happens if your server is unreachable — e.g., fall back to
 *     the original feed so participants are not blocked.
 *   - If latency is a concern, consider moving the fetch call to a service
 *     worker (see the note below) to avoid CORS constraints and benefit from
 *     the service worker's persistent connection.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  SERVICE WORKER ALTERNATIVE                                              │
 * │                                                                          │
 * │  You can move the server communication to a Manifest V3 service worker. │
 * │  In that case:                                                           │
 * │    - You do NOT need CORS headers on your server (service workers make   │
 * │      requests from the extension origin, not the page origin).           │
 * │    - Use chrome.runtime.sendMessage() here to pass the feed payload to   │
 * │      the service worker, and load client.js there instead.               │
 * │    - This script then becomes a thin message relay.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * "ProcessResponse" handler
 *
 * Fired by injected.js (page context) whenever a subscribed feed API endpoint
 * responds. The event detail contains:
 *   - id        {number}  Unique request ID used to match the CustomFeedReady reply.
 *   - url       {string}  Full request URL.
 *   - startTime {string}  ISO timestamp of when the original request was opened.
 *   - type      {string}  Endpoint name (e.g. "HomeTimeline").
 *   - response  {string}  Raw JSON response body from the platform's API.
 *
 * The page's rendering of this feed is suspended until "CustomFeedReady" is
 * dispatched with the same `id`, so this handler should complete as quickly
 * as possible to minimise visible latency for the participant.
 */
window.addEventListener("ProcessResponse", function (evt) {

    console.log("ProcessResponse:", evt.detail);

    /**
     * Forward the raw feed to your server.
     *
     * Your server receives the full API response JSON and can:
     *   - Log it for later analysis (observation-only study)
     *   - Rerank the posts (algorithmic intervention study)
     *   - Filter posts (content moderation study)
     *   - Augment posts with labels (information labelling study)
     *
     * The server must return a JSON object with at least:
     *   { "feed": { "response": "<modified JSON string>" } }
     *
     * If you want an observation-only study, simply return the original
     * `evt.detail.response` unchanged inside that structure.
     *
     * RESEARCHERS: Replace "/get_feed" with your own API endpoint path.
     * The `feed_info` payload contains everything your server needs to
     * identify the request and the participant (user_id is added by client.js).
     */
    client.postRequest("/get_feed", {feed_info: evt.detail},
        function (res) {
            // SUCCESS: server returned a (possibly modified) feed response.
            let response = res.feed.response

            /**
             * Signal injected.js to resume delivery of this response.
             * The `id` must match the one from the ProcessResponse event so
             * the correct pending XHR callback / fetch Promise is resumed.
             */
            const event = new CustomEvent("CustomFeedReady",
                {
                    detail: {
                        id: evt.detail.id,
                        url: evt.detail.url,
                        response: response
                    }
                });

            window.dispatchEvent(event);
        },
        function (res) {
            /**
             * ERROR: server request failed (network error, timeout, 5xx, etc.)
             *
             * RESEARCHERS: Decide your fallback strategy here. Options:
             *   a) Do nothing — the participant's feed stays frozen (bad UX).
             *   b) Re-fire CustomFeedReady with the original response so the
             *      unmodified feed is shown (recommended for robustness):
             *
             *      window.dispatchEvent(new CustomEvent("CustomFeedReady", {
             *          detail: {
             *              id: evt.detail.id,
             *              url: evt.detail.url,
             *              response: evt.detail.response  // original, unmodified
             *          }
             *      }));
             *
             *   c) Log the error to your server asynchronously and fall back.
             */
        });

}, false);
