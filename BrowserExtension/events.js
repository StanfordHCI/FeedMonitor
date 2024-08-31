class EventsManager {

    static tweetIdRegex = "\\/status\\/([0-9]+)";

    static previousRenderGroup = new Set()

    static statusTimer = null;

    static renderedTweetHistory = new Set();

    static visualisedTweets = new Set();

    static scrolled = true;

    static keys = {37: 1, 38: 1, 39: 1, 40: 1, 33: 1, 34: 1, 32: 1, 35: 1, 36: 1};

    static lockScroll = false;


    run() {
        console.log("Events manager started.");
        $(window).on('resize scroll', this.onScroll).bind(this);
        $(window).on('beforeunload', this.onUnload).bind(this);

        TimeMe.initialize({idleTimeoutInSeconds: 60});
        TimeMe.callWhenUserLeaves(this.userLeaveTab);
        TimeMe.callWhenUserReturns(this.userReturnToTab);

        window.addEventListener("UrlChanged", this.onUrlChange, false);

        let wheelEvent = 'onwheel' in document.createElement('div') ? 'wheel' : 'mousewheel';
        window.addEventListener(wheelEvent, this.onMouseWheel, {passive: false});
        window.addEventListener('touchmove', this.onMouseWheel, {passive: false});

        window.addEventListener('keydown', this.onKeyDown, false);

        EventsManager.statusTimer = window.setInterval(function () {

            // If no scroll ignore
            if (!new URL(document.URL).pathname.endsWith("home") || !EventsManager.scrolled)
                return;

            let tweets = $("article");
            // If there are tweets (useful for the first time when tweets are not rendered)
            if (tweets && tweets.length > 0) {
                let tweetsDOMReferences = {}
                let renderedTweets = new Set()
                for (let t = 0; t < tweets.length; t++) {
                    let current_id = "";
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
                    if (!has_attribute(tweets[t], "with_listeners")) {
                        $("a", $(tweets[t])).click(function (e) {
                            let href = $(e.currentTarget).attr("href");
                            this.onLinkClick({"href": href, "tweet_id": current_id});
                        }.bind(this));
                        $(tweets[t]).attr("with_listeners", "TRUE")
                    }
                }
                if (renderedTweets.size > 0 && !eqSet(EventsManager.previousRenderGroup, renderedTweets)) {
                    this.onCheckRenderStatus(renderedTweets);
                    EventsManager.previousRenderGroup = renderedTweets;
                    for (const [tweetID, domElement] of Object.entries(tweetsDOMReferences)) {
                        this.onTweetAvailable(tweetID, domElement);
                    }
                }
                EventsManager.scrolled = false;
            }

        }.bind(this), 800);


        window.addEventListener("FavoriteTweet", this.onFavoriteTweet, false);
        window.addEventListener("CreateRetweet", this.onCreateRetweet, false);
        window.addEventListener("CreateTweet", this.onCreateTweet, false);
    }

    onCreateTweet(data) {
        client.logEvent("CreateTweet", data.detail);
    }

    onLinkClick(data) {
        client.logEvent("LinkClick", data);
    }

    onCreateRetweet(data) {
        client.logEvent("CreateRetweet", data.detail);
    }

    onFavoriteTweet(data) {
        client.logEvent("FavoriteTweet", data.detail);
    }

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

    onScroll(e) {
        // console.log("Scroll", e);
        EventsManager.scrolled = true;
        const event = new CustomEvent("FeedScroll");
        window.dispatchEvent(event);
    }

    onTabStateCheck() {
        client.logEvent("Alive", {"url": document.URL, "visibility": document.visibilityState});
    }

    userLeaveTab() {
        client.logEvent("UserLeaveTab", {"url": document.URL});
    }

    userReturnToTab() {
        client.logEvent("UserReturnOnTab", {"url": document.URL});
    }

    onUnload() {
        let timeSpentOnPage = TimeMe.getTimeOnCurrentPageInSeconds();
        client.logEvent("PageUnload", {"timeOnPage": timeSpentOnPage})
    }

    onUrlChange(e) {
        client.logEvent("UrlChange", {"url": document.URL})
    }


    onMouseWheel(e) {
        if (EventsManager.lockScroll)
            e.preventDefault();
    }

    onKeyDown(e) {
        if (EventsManager.lockScroll) {
            if (EventsManager.keys[e.keyCode])
                e.preventDefault();
        }
    }

}