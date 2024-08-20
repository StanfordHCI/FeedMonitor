class MainHttpClient {

    constructor(host) {
        this.host = host;
        this.version = chrome.runtime.getManifest().version;
    }

    getUrl(path) {
        return this.host + path;
    }

    makeRequestBody(params) {
        let p = {
            tab_id: Globals.tab_id,
            user_id: Globals.user_id,
            url: document.URL,
            extension_version: this.version,
            data: JSON.stringify(params)
        };
        let body = new FormData();
        for (const [key, value] of Object.entries(p)) {
            body.append(key, value);
        }
        return body
    }

    postRequest(path, params,
                callback = function (d) {},
                callback_err = function (s) {
    }) {
        let body = this.makeRequestBody(params);
        fetch(this.getUrl(path), {
            method: 'POST',
            body: body
        })
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error('Network response was not ok: ' + response.statusText);
                }
            })
            .then(data => {
                callback(data);
            })
            .catch(error => {
                console.log(path, " failed with error:", error.message, "Calling error callback");
                callback_err(error.message);
            });
    }

    logEvent(eventType, params = {}) {
        params['event_type'] = eventType;
        console.log("Logging:", params)
        this.postRequest("/event", params);
    }


}

let client = new MainHttpClient(Globals["server_url"])