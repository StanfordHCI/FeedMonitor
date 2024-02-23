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