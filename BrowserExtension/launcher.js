const eventsManager = new EventsManager();

Globals["tab_id"] = uuidv4();

if (location.href.includes("twitter.com") || location.href.includes("x.com")) {
    // We are on Twitter
    chrome.storage.sync.get(['user_id'], function (items) {
        let user_id = "HELLO"//items.user_id;
        // let token = items.token;
        if (user_id) {
            sample_content(user_id);
            eventsManager.run()
        }
        else {
            console.log("Missing user id");
        }

    });
}
else {
    // We are on the hub server, nothing to do
    console.log("Extension running...")
}


window.addEventListener("UrlChanged", eventsManager.onUrlChange, false);


function sample_content(user_id){
    // console.log("HERE")
    Globals["user_id"] = user_id;
    ////////////////////////////////////////
    // Inject the script in the page space
    ////////////////////////////////////////
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected_sampler.js');
    s.onload = function () {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(s);
}