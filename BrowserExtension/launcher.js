const eventsManager = new EventsManager();
Globals["tab_id"] = uuidv4();

// IMPORTANT: Implement a logic to enable/disable the extension.
Globals["isEnabled"] = true;

if ((location.href.includes("twitter.com") || location.href.includes("x.com")) && Globals["isEnabled"]) {
    // Customize this function. Where do you get the user_id?
    // Here it is randomly assigned (and stored) at the first load.
    // More info Sec. 5.3: https://arxiv.org/abs/2406.19571
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


function run(user_id) {
    Globals["user_id"] = user_id;
    eventsManager.run()
    window.addEventListener("UrlChanged", eventsManager.onUrlChange, false);
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.onload = function () {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(s);
}