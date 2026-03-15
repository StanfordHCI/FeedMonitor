import json
import os
import yaml
from flask import Flask, request, jsonify
from flask_cors import CORS
from feed_logic import get_custom_feed

# Load application configuration from config.yaml.
# Currently empty; add study-specific settings here (e.g. server port, storage path).
with open('config.yaml', 'r') as file:
    config = yaml.safe_load(file)

app = Flask(__name__)

# Enable Cross-Origin Resource Sharing so the browser extension (running on
# twitter.com / x.com) can POST to this server without being blocked by the
# browser's same-origin policy.
CORS(app)

# Create the data directory if it doesn't exist yet.
# All per-participant log files are written here.
os.makedirs("data", exist_ok=True)


@app.route("/", methods=['GET'])
def index():
    """Health-check endpoint. Useful for confirming the server is reachable."""
    return "Welcome."


@app.route("/event", methods=['POST'])
def event():
    """Receive and persist a behavioural event from the browser extension.

    The extension sends events such as TweetVisible, LinkClick, FavoriteTweet,
    UserLeaveTab, etc. Each event is appended as a JSON line to a per-participant
    log file (data/events_<user_id>.json), making the log easy to stream-process
    later.

    Expected form fields (sent by libs/client.js):
        user_id           -- persistent participant identifier
        tab_id            -- per-tab session identifier
        url               -- page URL at the time of the event
        extension_version -- extension version string (for data provenance)
        data              -- JSON-encoded event payload including 'event_type'
    """
    user_id = request.form.get('user_id')

    # Append the full form payload as a JSON line to the participant's event log.
    # Using append mode ("a") means no data is ever overwritten between requests.
    with open("data/events_{}.json".format(user_id), "a") as f:
        f.write(json.dumps(request.form) + "\n")

    return jsonify({"success": True})


@app.route("/get_feed", methods=['POST'])
def get_feed():
    """Receive a raw feed response, log it, optionally transform it, and return it.

    This is the core endpoint of the study pipeline. The browser extension
    intercepts X's feed API response before the page renders it and forwards
    it here. The server can then:
        - Log it for offline analysis (observation-only study)
        - Rerank the posts (algorithmic intervention)
        - Filter posts (content moderation study)
        - Inject additional posts (augmentation study)

    The (possibly modified) feed is returned to the extension, which delivers
    it to X's frontend as if it came directly from the platform.

    Expected form fields (sent by libs/client.js):
        user_id           -- persistent participant identifier
        tab_id            -- per-tab session identifier
        url               -- page URL at the time of the request
        extension_version -- extension version string
        data              -- JSON string containing 'feed_info' (the raw feed payload)

    Returns:
        JSON: { "feed": <feed_info dict, possibly modified> }
              The extension reads feed["response"] and substitutes it into
              the intercepted XHR/fetch response body.
    """
    user_id = request.form.get('user_id')

    # Log the raw request before any transformation so the original feed is
    # always preserved for offline analysis, regardless of what the server does.
    with open("data/feed_{}.json".format(user_id), "a") as f:
        f.write(json.dumps(request.form) + "\n")

    # The "data" form field is a JSON string; parse it to access feed_info.
    payload = json.loads(request.form["data"])

    # Pass the feed through the customisation layer.
    # Edit feed_logic.py to implement reranking, filtering, or any other
    # transformation. By default get_custom_feed() returns the feed unchanged.
    custom_feed = get_custom_feed(payload["feed_info"])

    response = {"feed": custom_feed}
    return jsonify(response)


if __name__ == '__main__':
    # Run the development server on all network interfaces so the browser
    # extension (or another device on the same network) can reach it.
    # RESEARCHERS: Use a production WSGI server (e.g. Gunicorn) for deployments.
    app.run(
        "0.0.0.0",
        port=5000,
        debug=True,
    )
