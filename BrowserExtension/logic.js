window.addEventListener("SaveBatch", function (evt) {

    console.log("SaveBatch:", evt.detail);
    client.postRequest("/check_feed", {feed_info: evt.detail},
        function (res) {
            // OK
        },
        function (res) {
            // ERROR
        });

}, false);