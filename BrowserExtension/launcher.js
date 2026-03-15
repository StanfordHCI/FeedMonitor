/**
 * launcher.js — Extension Entry Point
 *
 * This is the last content script loaded (see manifest.json). It is responsible
 * for two things:
 *
 *   1. Participant identity — reads or generates a persistent unique user ID
 *      stored in Chrome's synced storage, so the same ID is preserved across
 *      sessions and browser restarts.
 *
 *   2. Injecting injected.js into the PAGE context — content scripts run in an
 *      isolated JavaScript environment and cannot intercept the page's own XHR /
 *      fetch calls. To intercept network requests we must inject a <script> tag
 *      directly into the page's DOM so it runs in the same JS context as X's
 *      frontend code. injected.js is that script.
 *
 * RESEARCHERS: The most common customisations here are:
 *   - Changing the condition logic in `Globals["isEnabled"]` to enable/disable
 *     the intervention for specific participants (e.g., treatment vs. control).
 *   - Changing how `user_id` is assigned. By default it is a random UUID minted
 *     on first load. You might instead want to read it from an onboarding flow,
 *     a login token, or a URL parameter.
 *     See also: https://arxiv.org/abs/2406.19571 §5.3 for a discussion of
 *     participant-ID strategies.
 */

const eventsManager = new EventsManager();

/**
 * A per-tab session identifier (not persisted). Useful for distinguishing
 * multiple simultaneous tabs from the same participant on your server.
 */
Globals["tab_id"] = uuidv4();

/**
 * Master on/off switch for the extension's intervention logic.
 *
 * RESEARCHERS: Replace `true` with your own condition assignment logic.
 * For example, to run a 50/50 A/B test you could hash the user_id, or fetch
 * the assignment from your server after authentication.
 * The extension must still load to be able to make that determination, but
 * you can skip calling `run()` for control-group participants.
 */
Globals["isEnabled"] = true;

if ((location.href.includes("twitter.com") || location.href.includes("x.com")) && Globals["isEnabled"]) {

    /**
     * Retrieve the participant's persistent ID from Chrome's synced storage.
     * If no ID exists yet (first install), generate a fresh UUID and store it.
     * Chrome sync means the ID survives browser reinstalls on the same account.
     *
     * RESEARCHERS: If your study uses a login or enrollment flow, replace this
     * block with logic that reads the user_id from your own authentication
     * mechanism instead of generating a random one.
     */
    chrome.storage.sync.get(['user_id'], function (items) {
        let user_id = items.user_id;

        if (!user_id) {
            user_id = uuidv4();
            chrome.storage.sync.set({user_id: user_id}, function () {
                run(user_id);
            });
        } else
            run(user_id);
    });

} else {
    console.log("Extension running...")
}


/**
 * run() — Initialises all extension subsystems for an active participant.
 *
 * Called once we have a confirmed user_id. It:
 *   1. Stores the user_id globally so client.js can attach it to every request.
 *   2. Starts the EventsManager (scroll tracking, visibility, interaction logs).
 *   3. Injects injected.js into the page context to enable network interception.
 *
 * Why inject a <script> tag instead of using the content script directly?
 * Chrome's content script sandbox prevents direct access to the page's window
 * object, so we cannot override XMLHttpRequest or fetch from there. Injecting
 * a script tag executes code in the page's own JS environment, giving us access
 * to the same globals that X's frontend uses.
 *
 * @param {string} user_id - The participant's persistent unique identifier.
 */
function run(user_id) {
    Globals["user_id"] = user_id;

    // Start DOM-level event tracking (scroll, clicks, visibility dwell time).
    eventsManager.run()

    // Also listen for URL changes from within the content script context.
    window.addEventListener("UrlChanged", eventsManager.onUrlChange, false);

    // Inject injected.js into the page's own JavaScript context.
    // `web_accessible_resources` in manifest.json makes this file accessible.
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.onload = function () {
        this.remove(); // Clean up the <script> tag after execution.
    };
    (document.head || document.documentElement).appendChild(s);
}
