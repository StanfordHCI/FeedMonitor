class MainHttpClient {

    constructor(host) {
        this.host = host;
        this.version = chrome.runtime.getManifest().version;
    }

    getUrl(path) {
        return this.host + path;
    }

    makeRequestBody(params) {
        return {
            tab_id: Globals.tab_id,
            user_id: Globals.user_id,
            url: document.URL,
            extension_version: this.version,
            data: JSON.stringify(params)
        };
    }

    postRequest(path, params,
                callback = function (d) {},
                callback_err = function (s) {
    }) {
        let body = this.makeRequestBody(params);
        $.post(this.getUrl(path),
            body,
            function (data, status) {

                if (status == 'success') {
                    callback(data);
                } else {
                    callback_err(status);
                }
            }, "json").fail(function(xhr, status, error) {
                console.log(path, " failed with status", status, "Calling error callback");
            callback_err(status);
        });
    }

    logEvent(eventType, params = {}) {
        params['event_type'] = eventType;
        console.log("Logging:", params)
        this.postRequest("/event", params);
    }


}

let client = new MainHttpClient(Globals["server_url"])