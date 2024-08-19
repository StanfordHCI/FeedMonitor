/********************
 * You can move the interaction with your server to a service worker.
 * In that case, you won't need CORS enabled on the server, and this
 * script can be used only as a bridge to pass the message.
 * Use chrome.runtime.sendMessage and load client.js in the service worker.
 */
window.addEventListener("SaveBatch", function (evt) {

    console.log("SaveBatch:", evt.detail);
    client.postRequest("/get_feed", {feed_info: evt.detail},
        function (res) {
            // OK
            let response = res.feed.response
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
            // ERROR
        });

}, false);