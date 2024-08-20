function extensionConflict(origin) {
    // CHOOSE WHAT TO DO IF THE USER HAS A CONFLICTING EXTENSION
    // i.e., redirect to a message
    switch (origin) {
        case 'sameCode':
            // There is already an injected script.
            alert("Conflict: The extension detected a conflict. Are you enrolled in 2 studies?");
            break;
        case 'isXHRModified':
            // There is another extension intercepting the network requests.
            // This could be an ads blocker (no problem), or a similar study (potential problems)
            alert("Conflict: The extension detected a potential conflict.");
            break;
        default:
            console.log("Conflict: unspecified reason.");
    }

}

if (typeof window.SUBSCRIBED !== "undefined") {
    console.error("window.SUBSCRIBED already defined. Conflict.");
    extensionConflict("sameCode");
} else {
    // Define your variables only if they are not already defined
    window.SUBSCRIBED = ["HomeTimeline", "HomeLatestTimeline"];
    window.httpRequestIdCounter = 0;
    window.event_handlers = {};

    function isNativeFunction(func) {
        return func.toString().indexOf('[native code]') !== -1;
    }

    (function (xhr) {

        const XHR = XMLHttpRequest.prototype;
        const open = XHR.open;
        const send = XHR.send;
        const setRequestHeader = XHR.setRequestHeader;

        const isXHRModified = !isNativeFunction(XMLHttpRequest.prototype.open) ||
            !isNativeFunction(XMLHttpRequest.prototype.send) ||
            !isNativeFunction(XMLHttpRequest.prototype.setRequestHeader);

        if (isXHRModified)
            extensionConflict("isXHRModified");

        XHR.setRequestHeader = function (header, value) {
            this._requestHeaders[header] = value;
            return setRequestHeader.apply(this, arguments);
        };

        XHR.open = function (method, url) {
            this._url = url;
            this._id = window.httpRequestIdCounter++;
            this._startTime = (new Date()).toISOString();
            this._requestHeaders = {};
            return open.apply(this, arguments);
        };

        XHR.send = function (postData) {

            let actionName = new URL(this._url).pathname.split("/").at(-1);
            // If we subscribed for this call
            if (window.SUBSCRIBED.includes(actionName)) {
                let callback = this.onreadystatechange;
                this.onreadystatechange = function () {
                    if (this.readyState === XMLHttpRequest.DONE) {
                        let response = this.responseText;

                        if (response.length > 0) {

                            window.event_handlers[this._id] = {
                                callback: callback,
                                source: this,
                                arguments: arguments
                            };

                            const event = new CustomEvent("SaveBatch", {
                                detail: {
                                    id: this._id,
                                    url: this._url,
                                    startTime: this._startTime,
                                    type: actionName,
                                    response: this.response
                                }
                            });

                            window.dispatchEvent(event);

                            console.log("Request Headers for ID " + this._id + ":", this._requestHeaders);
                            console.log("Waiting for the green light for connection #" + this._id);
                        }
                    }
                };
            }
            return send.apply(this, arguments);
        };
    })(XMLHttpRequest);
}

window.addEventListener("CustomFeedReady", function (evt) {
    console.log("Green light for connection #" + evt.detail.id);

    let event_handler = window.event_handlers[evt.detail.id]

    Object.defineProperty(event_handler['source'], 'responseText', {
        writable: true
    });

    Object.defineProperty(event_handler['source'], 'response', {
        writable: true
    });

    event_handler['source'].responseText = evt.detail.response;
    event_handler['source'].response = evt.detail.response;

    console.log("CustomFeedReady: ", event_handler['source']);

    event_handler['callback'].apply(event_handler['source'], event_handler['arguments'])
}, false);


/*****************************
 * Change URL event
 *****************************/

// https://stackoverflow.com/questions/6390341/how-to-detect-if-url-has-changed-after-hash-in-javascript
(() => {
    let oldPushState = history.pushState;
    history.pushState = function pushState() {
        let ret = oldPushState.apply(this, arguments);
        window.dispatchEvent(new Event('pushstate'));
        window.dispatchEvent(new Event('locationchange'));
        return ret;
    };

    let oldReplaceState = history.replaceState;
    history.replaceState = function replaceState() {
        let ret = oldReplaceState.apply(this, arguments);
        window.dispatchEvent(new Event('replacestate'));
        window.dispatchEvent(new Event('locationchange'));
        return ret;
    };

    window.addEventListener('popstate', () => {
        window.dispatchEvent(new Event('locationchange'));
    });
})();

window.addEventListener('locationchange', function () {
    const event = new CustomEvent("UrlChanged",
        {
            detail: {
                url: location.href
            }
        });
    window.dispatchEvent(event);
});

// Log the first load
window.dispatchEvent(new Event('locationchange'));