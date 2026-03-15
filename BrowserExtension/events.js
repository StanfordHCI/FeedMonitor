/**
 * events.js — DOM-Level Behavioural Event Tracking
 *
 * This class provides the second layer of data collection, complementing the
 * network-level interception in injected.js. While injected.js captures what
 * the platform's API returns, EventsManager captures how the participant
 * actually interacts with the page.
 *
 * Events tracked:
 *   - Scroll activity (used to trigger viewport checks)
 *   - Tweet visibility (which posts entered the viewport, for how long)
 *   - Link clicks within tweets
 *   - Retweets, likes (favourites), new tweet creation
 *   - Tab focus / blur (idle detection via TimeMe)
 *   - Page unload (total time on page)
 *   - URL changes (SPA navigation)
 *   - Scroll locking (prevents scrolling while a feed update is in progress)
 *
 * All events are sent to the researcher's server via client.logEvent(), which
 * calls the "/event" endpoint defined in client.js.
 *
 * RESEARCHERS: Add new event handlers here to capture additional behaviours.
 * For DOM-based events (e.g., detecting when a participant expands a thread),
 * use MutationObserver or jQuery event delegation on `article` elements.
 */

class EventsManager {

    /**
     * Regex for extracting the numeric tweet ID from an anchor href.
     * X URLs follow the pattern: /username/status/<tweet_id>
     */
    static tweetIdRegex = "\\/status\\/([0-9]+)";

    /**
     * The set of tweet IDs visible in the previous DOM scan cycle.
     * Used to detect when the visible set changes (user has scrolled to new content).
     */
    static previousRenderGroup = new Set()

    /** Timer handle for the DOM polling interval (see run()). */
    static statusTimer = null;

    /**
     * All tweet IDs that have ever been rendered in this session.
     * Used to avoid re-logging the same tweet as "new" after a feed refresh.
     */
    static renderedTweetHistory = new Set();

    /**
     * Tweet IDs for which a "TweetVisible" event has already been fired.
     * Prevents duplicate visibility events if the user scrolls back up.
     */
    static visualisedTweets = new Set();

    /**
     * Tracks whether the user has scrolled since the last DOM poll cycle.
     * The poll is skipped if no scroll has occurred (no new content to report).
     */
    static scrolled = true;

    /**
     * Key codes that trigger page scrolling (arrows, page up/down, space, home,
     * end). Used by onKeyDown to block keyboard-driven scrolling when lockScroll
     * is active.
     */
    static keys = {37: 1, 38: 1, 39: 1, 40: 1, 33: 1, 34: 1, 32: 1, 35: 1, 36: 1};

    /**
     * When true, prevents the participant from scrolling (both mouse-wheel and
     * keyboard). Set this to true in your intervention logic if you need to
     * hold the feed in place while a server request is in progress.
     */
    static lockScroll = false;


    /**
     * run() — Attach all event listeners and start the DOM polling loop.
     *
     * Called once from launcher.js after the user_id is confirmed.
     * All listeners are attached here rather than inline to keep setup centralised.
     */
    run() {
        console.log("Events manager started.");

        // Scroll and resize: update scroll state and dispatch FeedScroll.
        $(window).on('resize scroll', this.onScroll).bind(this);

        // Page unload: log total time spent on the page.
        $(window).on('beforeunload', this.onUnload).bind(this);

        /**
         * Idle / focus tracking via TimeMe.js.
         * TimeMe monitors whether the tab is active. After 60 seconds of
         * inactivity (no mouse/keyboard) the user is considered "idle" and
         * the active-time clock pauses.
         *
         * RESEARCHERS: Adjust `idleTimeoutInSeconds` to match your study's
         * definition of an "active" session.
         */
        TimeMe.initialize({idleTimeoutInSeconds: 60});
        TimeMe.callWhenUserLeaves(this.userLeaveTab);
        TimeMe.callWhenUserReturns(this.userReturnToTab);

        // SPA navigation events (fired by injected.js's history patch).
        window.addEventListener("UrlChanged", this.onUrlChange, false);

        // Scroll locking: block mouse-wheel and touch-scroll when lockScroll is set.
        let wheelEvent = 'onwheel' in document.createElement('div') ? 'wheel' : 'mousewheel';
        window.addEventListener(wheelEvent, this.onMouseWheel, {passive: false});
        window.addEventListener('touchmove', this.onMouseWheel, {passive: false});

        // Block keyboard-driven scrolling when lockScroll is set.
        window.addEventListener('keydown', this.onKeyDown, false);

        /**
         * DOM polling loop — runs every 800 ms.
         *
         * X's feed is rendered as a list of <article> elements. We periodically
         * scan the DOM to detect newly rendered tweets and track which are
         * visible in the viewport. This polling approach is necessary because
         * X's frontend does not emit events when it adds tweets to the DOM.
         *
         * The poll is skipped if:
         *   - The current URL is not the /home feed.
         *   - No scroll has occurred since the last cycle (nothing changed).
         *
         * RESEARCHERS: Reduce the interval (e.g., 400 ms) for finer-grained
         * visibility tracking, at the cost of slightly higher CPU usage.
         */
        EventsManager.statusTimer = window.setInterval(function () {

            // Only track the home feed, and only when the user has scrolled.
            if (!new URL(document.URL).pathname.endsWith("home") || !EventsManager.scrolled)
                return;

            let tweets = $("article");

            if (tweets && tweets.length > 0) {
                let tweetsDOMReferences = {}
                let renderedTweets = new Set()

                for (let t = 0; t < tweets.length; t++) {
                    let current_id = "";

                    // Extract the tweet ID from the first status link inside the article.
                    let links = $("a[href*=status]", tweets[t]);
                    if (links)
                        for (let i = 0; i < links.length; i++) {
                            let tweet_id = links[i].href.match(EventsManager.tweetIdRegex);
                            if (tweet_id != null && tweet_id.length > 0) {
                                current_id = tweet_id[1];
                                renderedTweets.add(current_id)
                                tweetsDOMReferences[current_id] = tweets[t];
                            }
                        }

                    /**
                     * Attach click listeners to each tweet exactly once.
                     * We mark processed articles with a `with_listeners` attribute
                     * to avoid duplicate listener registration across poll cycles.
                     */
                    if (!has_attribute(tweets[t], "with_listeners")) {
                        $("a", $(tweets[t])).click(function (e) {
                            let href = $(e.currentTarget).attr("href");
                            this.onLinkClick({"href": href, "tweet_id": current_id});
                        }.bind(this));
                        $(tweets[t]).attr("with_listeners", "TRUE")
                    }
                }

                // If the visible set has changed, log newly rendered tweets
                // and fire onTweetAvailable for each new one.
                if (renderedTweets.size > 0 && !eqSet(EventsManager.previousRenderGroup, renderedTweets)) {
                    this.onCheckRenderStatus(renderedTweets);
                    EventsManager.previousRenderGroup = renderedTweets;
                    for (const [tweetID, domElement] of Object.entries(tweetsDOMReferences)) {
                        this.onTweetAvailable(tweetID, domElement);
                    }
                }

                // Reset scroll flag until the next scroll event.
                EventsManager.scrolled = false;
            }

        }.bind(this), 800);

        /**
         * Social interaction events.
         * These CustomEvents are fired by injected.js when it intercepts the
         * corresponding X API calls (FavoriteTweet, CreateRetweet, CreateTweet).
         *
         * RESEARCHERS: Add additional interaction types here by intercepting
         * additional endpoint names in injected.js's SUBSCRIBED array and
         * dispatching corresponding CustomEvents.
         */
        window.addEventListener("FavoriteTweet", this.onFavoriteTweet, false);
        window.addEventListener("CreateRetweet", this.onCreateRetweet, false);
        window.addEventListener("CreateTweet", this.onCreateTweet, false);
    }

    /** Log when the participant posts a new tweet. */
    onCreateTweet(data) {
        client.logEvent("CreateTweet", data.detail);
    }

    /** Log when the participant clicks any link inside a tweet. */
    onLinkClick(data) {
        client.logEvent("LinkClick", data);
    }

    /** Log when the participant retweets a post. */
    onCreateRetweet(data) {
        client.logEvent("CreateRetweet", data.detail);
    }

    /** Log when the participant likes (favourites) a post. */
    onFavoriteTweet(data) {
        client.logEvent("FavoriteTweet", data.detail);
    }

    /**
     * onTweetAvailable() — Set up viewport-visibility tracking for a tweet.
     *
     * Called once per tweet when it first appears in the DOM. Attaches a
     * "FeedScroll" listener that checks whether the tweet is in the viewport
     * each time the user scrolls, logging:
     *   - "TweetVisible"     — first time the tweet enters the viewport
     *   - "TweetVisible1Sec" — if still visible 1 second later
     *   - "TweetVisible3Sec" — if still visible 3 seconds later
     *
     * The timed checks approximate reading engagement: a tweet seen for 3+
     * seconds is more likely to have been actually read than one that scrolled
     * past instantly.
     *
     * @param {string} tweetId  - The tweet's numeric ID string.
     * @param {Element} tweetDOM - The <article> DOM element for the tweet.
     */
    onTweetAvailable(tweetId, tweetDOM) {
        let currentTweet = $(tweetDOM)
        window.addEventListener("FeedScroll", function (evt) {
            if (!EventsManager.visualisedTweets.has(tweetId) && currentTweet.isInViewport()) {
                client.logEvent("TweetVisible", {tweetId: tweetId});
                EventsManager.visualisedTweets.add(tweetId);

                setTimeout(function () {
                    if (currentTweet.isInViewport())
                        client.logEvent("TweetVisible1Sec", {tweetId: tweetId});
                }, 1000);

                setTimeout(function () {
                    if (currentTweet.isInViewport())
                        client.logEvent("TweetVisible3Sec", {tweetId: tweetId});
                }, 3000);
            }
        }, false);
    }


    /**
     * onCheckRenderStatus() — Log tweets that are newly rendered in this cycle.
     *
     * Compares the current set of rendered tweet IDs against the history of
     * all previously seen IDs. Only tweets appearing for the first time in this
     * session are logged as "RenderedTweets".
     *
     * @param {Set<string>} ids - Tweet IDs currently present in the DOM.
     */
    onCheckRenderStatus(ids) {
        console.log("Rendered tweets:", ids);
        let newTweets = []
        for (let i of ids)
            if (!EventsManager.renderedTweetHistory.has(i)) {
                newTweets.push(i);
                EventsManager.renderedTweetHistory.add(i);
            }
        if (newTweets.length > 0)
            client.logEvent("RenderedTweets", {ids: newTweets});
    }

    /**
     * onScroll() — Called on every scroll and resize event.
     *
     * Sets the scrolled flag (so the next DOM poll cycle runs) and dispatches
     * the "FeedScroll" event so viewport-visibility listeners can fire.
     */
    onScroll(e) {
        EventsManager.scrolled = true;
        const event = new CustomEvent("FeedScroll");
        window.dispatchEvent(event);
    }

    /** Send a heartbeat ping to confirm the participant is still active. */
    onTabStateCheck() {
        client.logEvent("Alive", {"url": document.URL, "visibility": document.visibilityState});
    }

    /** Log when the participant switches away from the tab. */
    userLeaveTab() {
        client.logEvent("UserLeaveTab", {"url": document.URL});
    }

    /** Log when the participant returns to the tab. */
    userReturnToTab() {
        client.logEvent("UserReturnOnTab", {"url": document.URL});
    }

    /** Log total time spent on the page when the tab/window is closed. */
    onUnload() {
        let timeSpentOnPage = TimeMe.getTimeOnCurrentPageInSeconds();
        client.logEvent("PageUnload", {"timeOnPage": timeSpentOnPage})
    }

    /** Log every in-app navigation (SPA route change). */
    onUrlChange(e) {
        client.logEvent("UrlChange", {"url": document.URL})
    }

    /**
     * onMouseWheel() — Conditionally block scroll events.
     *
     * When lockScroll is true, calling preventDefault() stops the page from
     * scrolling in response to mouse-wheel / touch events. Use this to freeze
     * the feed while a network intervention is in progress.
     */
    onMouseWheel(e) {
        if (EventsManager.lockScroll)
            e.preventDefault();
    }

    /**
     * onKeyDown() — Conditionally block keyboard-driven scrolling.
     *
     * Blocks arrow keys, page up/down, space, home, and end when lockScroll
     * is true, mirroring the mouse-wheel block above.
     */
    onKeyDown(e) {
        if (EventsManager.lockScroll) {
            if (EventsManager.keys[e.keyCode])
                e.preventDefault();
        }
    }

}
