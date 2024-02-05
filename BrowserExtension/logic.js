window.addEventListener("SaveBatch", function (evt) {

    console.log("SaveBatch:", evt.detail);
    client.postRequest("/save_feed", {feed_info: evt.detail},
        function (res) {
            // OK
        },
        function (res) {
            // ERROR
        });

}, false);