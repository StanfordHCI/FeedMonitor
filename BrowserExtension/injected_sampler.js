console.log("FeedWizard enabled - Sampler Only");

const SUBSCRIBED = ["HomeTimeline", "HomeLatestTimeline"];
let httpRequestIdCounter = 0;

(function (xhr) {

    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;

    XHR.open = function (method, url) {
        this._url = url;
        this._id = httpRequestIdCounter++;
        this._startTime = (new Date()).toISOString();

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

                    callback.apply(this, arguments);
                }

            }

        }
        return send.apply(this, arguments);
    }



})(XMLHttpRequest);
