/**
 * injected.js — Network Interception Layer (Page Context)
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  ARCHITECTURE NOTE                                                       │
 * │                                                                          │
 * │  This script runs in the PAGE's own JavaScript context (not in the      │
 * │  isolated content-script sandbox). It is injected as a <script> tag by  │
 * │  launcher.js specifically so it can override the page's XMLHttpRequest   │
 * │  and fetch APIs — something content scripts cannot do directly.          │
 * │                                                                          │
 * │  Data flow for a feed interception:                                      │
 * │                                                                          │
 * │  X frontend  ──(XHR/fetch)──▶  injected.js                              │
 * │                                    │  fires CustomEvent "ProcessResponse" │
 * │                                    ▼                                      │
 * │                              logic.js (content script)                   │
 * │                                    │  POSTs raw feed to researcher server │
 * │                                    ▼                                      │
 * │                              Your backend  (rerank / filter / log)        │
 * │                                    │  returns modified feed JSON          │
 * │                                    ▼                                      │
 * │                              logic.js fires CustomEvent "CustomFeedReady" │
 * │                                    │                                      │
 * │                                    ▼                                      │
 * │                              injected.js replaces the response body       │
 * │                                    │                                      │
 * │                                    ▼                                      │
 * │                              X frontend renders the modified feed         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * RESEARCHERS: The key customisation point is `window.SUBSCRIBED` — the list
 * of X API endpoint names whose responses you want to intercept. Only responses
 * from those endpoints will be forwarded to your server. All other traffic
 * passes through unmodified.
 *
 * For X / Twitter the two feed endpoints are:
 *   - "HomeTimeline"      — the default ranked (algorithmic) feed
 *   - "HomeLatestTimeline" — the chronological feed
 */


/**
 * extensionConflict() — Conflict handler
 *
 * Called when a potentially interfering condition is detected at startup.
 * By default it shows an alert; you can change this to a silent log, a
 * custom UI message, or a redirect as appropriate for your study protocol.
 *
 * @param {string} origin - Machine-readable reason code for the conflict.
 */
function extensionConflict(origin) {
    switch (origin) {
        case 'sameCode':
            // injected.js has already run in this page context.
            // Most likely the participant is enrolled in two overlapping studies.
            alert("Conflict: The extension detected a conflict. Are you enrolled in 2 studies?");
            break;
        case 'isXHRModified':
            // XMLHttpRequest methods are no longer native — another extension
            // (e.g., an ad blocker or another research tool) has patched them.
            // This may or may not interfere with your study depending on what
            // the other extension is doing.
            alert("Conflict: The extension detected a potential conflict.");
            break;
        case 'isFetchModified':
            // Same as above but for the fetch API.
            alert("Conflict: The extension detected a potential conflict.");
            break;
        default:
            console.log("Conflict: unspecified reason.");
    }
}


/**
 * Guard against double-injection.
 *
 * If `window.SUBSCRIBED` is already defined, injected.js has run before in
 * this page context. We bail out immediately rather than setting up duplicate
 * overrides, which would cause requests to be processed and fired twice.
 */
if (typeof window.SUBSCRIBED !== "undefined") {
    console.error("window.SUBSCRIBED already defined. Conflict.");
    extensionConflict("sameCode");
} else {

    /**
     * RESEARCHERS: Edit this array to control which API endpoints are
     * intercepted. Each entry is matched against the last path segment of the
     * request URL (e.g., ".../graphql/<hash>/HomeTimeline" → "HomeTimeline").
     *
     * Add or remove endpoint names here to change which feed responses your
     * server receives and can modify.
     */
    window.SUBSCRIBED = ["HomeTimeline", "HomeLatestTimeline"];

    const ACTION_EVENTS = ['FavoriteTweet', 'CreateRetweet', 'CreateTweet'];

    function dispatchActionEvent(name, bodyText) {
        try { window.dispatchEvent(new CustomEvent(name, {detail: JSON.parse(bodyText)})); } catch (e) {}
    }

    /**
     * Monotonically increasing counter used to assign a unique ID to every
     * intercepted request. The ID is used to correlate:
     *   - The "ProcessResponse" event (sent to logic.js)
     *   - The "CustomFeedReady" event (received from logic.js)
     *   - The pending XHR callback / fetch Promise stored in event_handlers
     */
    window.httpRequestIdCounter = 0;

    /**
     * In-flight request registry.
     * Maps request ID → handler object containing enough state to resume
     * delivery of the (possibly modified) response to the page.
     *
     * For XHR entries: { type, callback, source, arguments }
     * For fetch entries: { type, resolve, originalResponse }
     */
    window.event_handlers = {};

    /**
     * isNativeFunction() — Detect whether a function has been patched.
     *
     * Native browser functions serialise to "function foo() { [native code] }".
     * If another extension has wrapped the function, toString() will return the
     * wrapper's source instead. This is a heuristic — a sophisticated extension
     * could spoof toString() — but it is effective against the realistic
     * conflict scenarios (ad blockers, other research tools).
     *
     * @param {Function} func - The function to inspect.
     * @returns {boolean} True if the function appears to be a native browser API.
     */
    function isNativeFunction(func) {
        return func.toString().indexOf('[native code]') !== -1;
    }


    /***************************************************************************
     * XHR INTERCEPTION
     *
     * We patch three methods on XMLHttpRequest.prototype:
     *   - open()             — capture the URL and assign a request ID
     *   - setRequestHeader() — record request headers (useful for debugging)
     *   - send()             — intercept the response for subscribed endpoints
     *
     * The prototype is patched once and affects all XHR instances created
     * by the page's own JS from this point forward.
     **************************************************************************/
    (function (xhr) {

        const XHR = XMLHttpRequest.prototype;
        const open = XHR.open;
        const send = XHR.send;
        const setRequestHeader = XHR.setRequestHeader;

        // Conflict check: are any of the three methods already patched?
        const isXHRModified = !isNativeFunction(XMLHttpRequest.prototype.open) ||
            !isNativeFunction(XMLHttpRequest.prototype.send) ||
            !isNativeFunction(XMLHttpRequest.prototype.setRequestHeader);

        if (isXHRModified)
            extensionConflict("isXHRModified");

        /**
         * Patched setRequestHeader — records each request header on the XHR
         * instance so they can be inspected later (e.g., for debugging auth
         * tokens or GraphQL operation names). The original method is still
         * called so the actual HTTP request is unaffected.
         */
        XHR.setRequestHeader = function (header, value) {
            this._requestHeaders[header] = value;
            return setRequestHeader.apply(this, arguments);
        };

        /**
         * Patched open — captures the request URL and assigns a unique ID.
         * Called before send(), so by the time send() runs we already know
         * which endpoint is being called.
         */
        XHR.open = function (method, url) {
            this._url = url;
            this._id = window.httpRequestIdCounter++;
            this._startTime = (new Date()).toISOString();
            this._requestHeaders = {};
            return open.apply(this, arguments);
        };

        /**
         * Patched send — the core of XHR interception.
         *
         * For subscribed endpoints:
         *   1. We wrap the page's own onreadystatechange callback.
         *   2. When the response arrives (readyState === DONE), instead of
         *      immediately calling the page's callback, we:
         *        a. Store the callback and XHR instance in event_handlers.
         *        b. Fire a "ProcessResponse" CustomEvent so logic.js can forward
         *           the raw feed JSON to your server.
         *   3. Execution is suspended here. The page's callback will only be
         *      invoked once logic.js fires "CustomFeedReady" (see below).
         *
         * For non-subscribed endpoints the original send() runs unmodified.
         */
        XHR.send = function (postData) {

            let actionName;
            try {
                actionName = new URL(this._url, location.href).pathname.split("/").at(-1);
            } catch (e) {
                return send.apply(this, arguments);
            }

            if (window.SUBSCRIBED.includes(actionName)) {
                let callback = this.onreadystatechange;
                this.onreadystatechange = function () {
                    if (this.readyState === XMLHttpRequest.DONE) {
                        let response = this.responseText;

                        if (response.length > 0) {

                            // Stash everything needed to resume delivery later.
                            window.event_handlers[this._id] = {
                                type: 'xhr',
                                callback: callback,
                                source: this,
                                arguments: arguments
                            };

                            // Notify logic.js that a feed response is ready
                            // to be forwarded to the researcher's server.
                            const event = new CustomEvent("ProcessResponse", {
                                detail: {
                                    id: this._id,
                                    url: this._url,
                                    startTime: this._startTime,
                                    type: actionName,
                                    response: this.response
                                }
                            });

                            window.dispatchEvent(event);

                            console.log("Request Headers for ID " + this._id + ":", this._requestHeaders);
                            console.log("Waiting for the green light for connection #" + this._id);
                        }
                    }
                };
            }

            else if (ACTION_EVENTS.includes(actionName)) {
                dispatchActionEvent(actionName, postData);
            }
            return send.apply(this, arguments);
        };
    })(XMLHttpRequest);


    /***************************************************************************
     * FETCH INTERCEPTION
     *
     * Some platforms (or future X versions) use the fetch API instead of XHR.
     * We override window.fetch with a wrapper that mirrors the XHR logic:
     *   1. For subscribed endpoints, read the full response body.
     *   2. Dispatch "ProcessResponse" so logic.js can send it to your server.
     *   3. Return a Promise that stays pending until "CustomFeedReady" fires,
     *      then resolve with a new Response containing the modified body.
     *
     * For non-subscribed endpoints the original fetch is called unchanged.
     **************************************************************************/
    (function () {
        const originalFetch = window.fetch;

        // Conflict check: is fetch already wrapped by another extension?
        if (!isNativeFunction(originalFetch))
            extensionConflict("isFetchModified");

        window.fetch = function (input, init) {
            // Normalise input — fetch accepts either a URL string or a Request object.
            const url = (input instanceof Request) ? input.url : input;
            const id = window.httpRequestIdCounter++;
            const startTime = (new Date()).toISOString();

            let actionName;
            try {
                actionName = new URL(url, location.href).pathname.split("/").at(-1);
            } catch (e) {
                // Malformed URL — pass through unmodified.
                return originalFetch.apply(this, arguments);
            }

            // Not a subscribed endpoint — pass through, but dispatch action events.
            if (!window.SUBSCRIBED.includes(actionName)) {
                if (ACTION_EVENTS.includes(actionName)) {
                    if (input instanceof Request) {
                        input.clone().text().then(text => dispatchActionEvent(actionName, text));
                    } else if (init && typeof init.body === 'string') {
                        dispatchActionEvent(actionName, init.body);
                    }
                }
                return originalFetch.apply(this, arguments);
            }

            // Subscribed endpoint: intercept the response.
            return originalFetch.apply(this, arguments).then(function (response) {
                // Read the full body as text. Note: calling .text() consumes
                // the body stream, so we reconstruct a new Response below.
                return response.text().then(function (responseText) {

                    if (responseText.length === 0) {
                        // Empty body — nothing to intercept, reconstruct and return.
                        return new Response(responseText, {
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers
                        });
                    }

                    // Notify logic.js that a feed response is ready.
                    const event = new CustomEvent("ProcessResponse", {
                        detail: {
                            id: id,
                            url: url,
                            startTime: startTime,
                            type: actionName,
                            response: responseText
                        }
                    });

                    window.dispatchEvent(event);
                    console.log("Waiting for the green light for fetch connection #" + id);

                    /**
                     * Return a pending Promise. This keeps the page's await /
                     * .then() chain suspended until "CustomFeedReady" fires.
                     * The resolve function is stored so the event handler below
                     * can fulfil the promise with the (possibly modified) body.
                     */
                    return new Promise(function (resolve) {
                        window.event_handlers[id] = {
                            type: 'fetch',
                            resolve: resolve,
                            originalResponse: response
                        };
                    });
                });
            });
        };
    })();



/*******************************************************************************
 * "CustomFeedReady" event handler
 *
 * This event is fired by logic.js after your server has processed the raw feed
 * and returned the (possibly reranked / filtered) response.
 *
 * For XHR requests:
 *   We make the XHR's responseText and response properties writable (they are
 *   normally read-only), overwrite them with the server's response, then
 *   manually call the page's original onreadystatechange callback so X's
 *   frontend proceeds as if the modified response came from the network.
 *
 * For fetch requests:
 *   We construct a new Response object containing the server's response body
 *   and resolve the pending Promise, resuming the page's await chain.
 *
 * RESEARCHERS: If you do not want to modify the feed (observation-only study),
 * your server can return the original response unchanged. The mechanism still
 * works — it just adds a small round-trip latency. See the FeedKit documentation
 * on latency absorption via infinite-scroll preloading:
 * https://feedkit.org/webextensions/
 ******************************************************************************/
window.addEventListener("CustomFeedReady", function (evt) {
    console.log("Green light for connection #" + evt.detail.id);

    let event_handler = window.event_handlers[evt.detail.id];
    delete window.event_handlers[evt.detail.id];

    if (event_handler.type === 'fetch') {
        // Fetch path: resolve the pending Promise with the modified body.
        const modifiedResponse = new Response(evt.detail.response, {
            status: event_handler.originalResponse.status,
            statusText: event_handler.originalResponse.statusText,
            headers: event_handler.originalResponse.headers
        });
        event_handler.resolve(modifiedResponse);
    } else {
        // XHR path: overwrite responseText/response and invoke the page's callback.
        Object.defineProperty(event_handler['source'], 'responseText', {
            writable: true
        });

        Object.defineProperty(event_handler['source'], 'response', {
            writable: true
        });

        event_handler['source'].responseText = evt.detail.response;
        event_handler['source'].response = evt.detail.response;

        console.log("CustomFeedReady: ", event_handler['source']);

        event_handler['callback'].apply(event_handler['source'], event_handler['arguments']);
    }
}, false);


/*******************************************************************************
 * URL CHANGE DETECTION
 *
 * X is a Single-Page Application (SPA): navigating between pages does not
 * trigger a full browser reload, so the standard "load" event is not fired.
 * Instead, X calls history.pushState() / replaceState() for in-app navigation.
 *
 * We patch both methods to emit a synthetic "locationchange" event that the
 * rest of the extension can listen to. This allows EventsManager and logic.js
 * to react to navigation (e.g., detecting when the user moves to or from /home).
 *
 * The "popstate" event covers back/forward browser button navigation.
 ******************************************************************************/
(() => {
    let oldPushState = history.pushState;
    history.pushState = function pushState() {
        let ret = oldPushState.apply(this, arguments);
        window.dispatchEvent(new Event('pushstate'));
        window.dispatchEvent(new Event('locationchange'));
        return ret;
    };

    let oldReplaceState = history.replaceState;
    history.replaceState = function replaceState() {
        let ret = oldReplaceState.apply(this, arguments);
        window.dispatchEvent(new Event('replacestate'));
        window.dispatchEvent(new Event('locationchange'));
        return ret;
    };

    // Back / forward navigation
    window.addEventListener('popstate', () => {
        window.dispatchEvent(new Event('locationchange'));
    });
})();

/**
 * Translate the low-level "locationchange" event into a higher-level
 * "UrlChanged" CustomEvent that includes the new URL in its detail payload.
 * Other scripts listen for "UrlChanged" rather than the raw history events.
 */
window.addEventListener('locationchange', function () {
    const event = new CustomEvent("UrlChanged",
        {
            detail: {
                url: location.href
            }
        });
    window.dispatchEvent(event);
});

// Also fire once for the initial page load (no history event is emitted then).
window.dispatchEvent(new Event('locationchange'));

} // end of SUBSCRIBED guard
