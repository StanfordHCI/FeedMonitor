console.log("FeedWizard enabled - Sampler Only");

const SUBSCRIBED = ["HomeTimeline", "HomeLatestTimeline"];
let httpRequestIdCounter = 0;

(function (xhr) {

    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;
    const setRequestHeader = XHR.setRequestHeader;

    XHR.setRequestHeader = function(header, value) {
        this._requestHeaders[header] = value;
        return setRequestHeader.apply(this, arguments);
    };

    XHR.open = function (method, url) {
        this._url = url;
        this._id = httpRequestIdCounter++;
        this._startTime = (new Date()).toISOString();
        this._requestHeaders = {};
        return open.apply(this, arguments);
    };

    XHR.send = function (postData) {

        let actionName = new URL(this._url).pathname.split("/").at(-1);
        // If we subscribed for this call
        if (SUBSCRIBED.includes(actionName)) {
            let callback = this.onreadystatechange
            this.onreadystatechange = function () {
                if (this.readyState === XMLHttpRequest.DONE) {
                    let response = this.responseText

                    if (response.length > 0) {

                        const event = new CustomEvent("SaveBatch",
                            {
                                detail: {
                                    id: this._id,
                                    url: this._url,
                                    startTime: this._startTime,
                                    type: actionName,
                                    response: this.response
                                }
                            });

                        window.dispatchEvent(event);

                    }

                    console.log("Request Headers for ID " + this._id + ":", this._requestHeaders);

                    callback.apply(this, arguments);
                }

            }

        }
        return send.apply(this, arguments);
    }



})(XMLHttpRequest);

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