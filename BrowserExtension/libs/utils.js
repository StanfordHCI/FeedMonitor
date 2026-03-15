/**
 * libs/utils.js — Shared Utility Functions
 *
 * General-purpose helpers used across the extension. Loaded early in the
 * content-script stack (see manifest.json) so all subsequent scripts can rely
 * on these being available.
 */

/**
 * jQuery plugin — $.fn.isInViewport()
 *
 * Returns true if any part of the selected element is currently visible within
 * the browser viewport. Used by EventsManager to determine whether a tweet has
 * been seen by the participant.
 *
 * Usage: $(element).isInViewport()  → boolean
 */
$.fn.isInViewport = function () {
    let elementTop = $(this).offset().top;
    let elementBottom = elementTop + $(this).outerHeight();

    let viewportTop = $(window).scrollTop();
    let viewportBottom = viewportTop + $(window).height();

    return elementBottom > viewportTop && elementTop < viewportBottom;
};

/**
 * uuidv4() — Generate a random UUID (version 4).
 *
 * Used to create unique identifiers for:
 *   - `user_id` (persistent participant identifier stored in Chrome sync storage)
 *   - `tab_id`  (per-tab session identifier, regenerated on each page load)
 *
 * Uses the Web Crypto API (crypto.getRandomValues) for cryptographic randomness,
 * making collisions negligible even at the scale of large studies.
 *
 * @returns {string} A UUID string of the form "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".
 */
function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

/**
 * eqSet() — Shallow equality check for two Sets.
 *
 * Returns true if both sets have the same size and every element of `xs` is
 * also in `ys`. Used by EventsManager to detect when the set of rendered
 * tweet IDs has changed between DOM poll cycles.
 *
 * @param {Set} xs
 * @param {Set} ys
 * @returns {boolean}
 */
const eqSet = (xs, ys) =>
    xs.size === ys.size &&
    [...xs].every((x) => ys.has(x));

/**
 * String.prototype.format()
 *
 * Minimal Python-style string interpolation using positional placeholders.
 * Replaces {0}, {1}, … with the corresponding arguments.
 *
 * Example: "Hello {0}, you have {1} messages".format("Alice", 3)
 *          → "Hello Alice, you have 3 messages"
 */
String.prototype.format = function () {
    const args = arguments;
    return this.replace(/{([0-9]+)}/g, function (match, index) {
        return typeof args[index] == 'undefined' ? match : args[index];
    });
};

/**
 * String.prototype.escape()
 *
 * HTML-escapes a string to prevent XSS when inserting user-controlled content
 * into the DOM via innerHTML. Replaces the five characters that have special
 * meaning in HTML (&, <, >, ", ') with their safe entity equivalents.
 *
 * RESEARCHERS: Always escape strings that originate from tweet content or
 * participant input before inserting them into the DOM.
 */
String.prototype.escape = function () {
    return this.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
};

/**
 * has_attribute() — Safely check for the presence of a DOM attribute.
 *
 * jQuery's .attr() returns undefined when the attribute is absent; this helper
 * wraps that check into a clean boolean return value.
 *
 * Used by EventsManager to test whether an <article> element has already had
 * click listeners attached (via the synthetic `with_listeners` attribute),
 * preventing duplicate listener registration across DOM poll cycles.
 *
 * @param {Element} dom       - The DOM element to inspect.
 * @param {string}  attribute - The attribute name to check.
 * @returns {boolean}
 */
function has_attribute(dom, attribute) {
    let with_listener = $(dom).attr(attribute);
    return typeof with_listener !== 'undefined' && with_listener !== false
}
