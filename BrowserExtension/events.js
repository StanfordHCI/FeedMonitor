class EventsManager {
    // eventsQueue = [];


    static tweetIdRegex = "\\/status\\/([0-9]+)";

    // static allRenderedTweetsIds = new Set();

    static previousRenderGroup = new Set()

    static statusTimer = null;

    static enableDebug = false;

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
            if (!document.URL.endsWith("home") || !EventsManager.scrolled)
                return;

            let tweets = $("article");
            // If there are tweets (useful for the first time when tweets are not rendered)
            if (tweets && tweets.length > 0) {
                let tweetsDOMReferences = {}
                let renderedTweets = new Set()
                for (let t = 0; t < tweets.length; t++) {
                    let links = $("a[href*=status]", tweets[t]);
                    if (links)
                        for (let i = 0; i < links.length; i++) {
                            let tweet_id = links[i].href.match(EventsManager.tweetIdRegex);
                            if (tweet_id!=null && tweet_id.length>0) {
                                renderedTweets.add(tweet_id[1])
                                tweetsDOMReferences[tweet_id[1]] = tweets[t];
                            }
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
        console.log("onCreateTweet", data.detail);
        client.logEvent("CreateTweet", data.detail);
    }

    onCreateRetweet(data) {
        console.log("CreateRetweet", data.detail);
        client.logEvent("CreateRetweet", data.detail);
    }

    onFavoriteTweet(data) {
        console.log("FavoriteTweet", data.detail);
        client.logEvent("FavoriteTweet", data.detail);
    }

    onTweetAvailable(tweetId, tweetDOM) {


        let currentTweet = $(tweetDOM)
        window.addEventListener("FeedScroll", function (evt) {
            if (!EventsManager.visualisedTweets.has(tweetId) && currentTweet.isInViewport()) {
                console.log("TweetVisible", tweetId);
                client.logEvent("TweetVisible", {tweetId: tweetId});

                EventsManager.visualisedTweets.add(tweetId);
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
        console.log("Tab state: " + document.visibilityState)
        client.logEvent("Alive", {"url": document.URL, "visibility": document.visibilityState});
    }

    userLeaveTab() {
        client.logEvent("UserLeaveTab", {"url": document.URL});
        console.log("Leave ")
    }

    userReturnToTab() {
        client.logEvent("UserReturnOnTab", {"url": document.URL});
        console.log("Return")
    }

    onUnload() {
        console.log("Unload")
        let timeSpentOnPage = TimeMe.getTimeOnCurrentPageInSeconds();
        client.logEvent("PageUnload", {"timeOnPage": timeSpentOnPage})
    }

    onUrlChange(e) {
        console.log("Page loaded " + document.URL)
        client.logEvent("UrlChange", {"url": document.URL})
    }

    //NOT USED
    stop() {
        clearInterval(EventsManager.statusTimer);
        TimeMe.stopTimer();
    }


    onMouseWheel(e) {
        if (EventsManager.lockScroll)
            e.preventDefault();
    }

    onKeyDown(e) {
        console.log(e.keyCode)
        if (EventsManager.lockScroll) {
            if (EventsManager.keys[e.keyCode])
                e.preventDefault();
        }
    }

}