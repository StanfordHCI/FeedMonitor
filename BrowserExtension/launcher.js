const eventsManager = new EventsManager();
Globals["tab_id"] = uuidv4();

if (location.href.includes("twitter.com") || location.href.includes("x.com")) {
    // We are on Twitter
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
    // We are on the hub server, nothing to do
    console.log("Extension running...")
}


function run(user_id) {
    Globals["user_id"] = user_id;
    eventsManager.run()
    window.addEventListener("UrlChanged", eventsManager.onUrlChange, false);
    ////////////////////////////////////////
    // Inject the script in the page space
    ////////////////////////////////////////
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.onload = function () {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(s);
}