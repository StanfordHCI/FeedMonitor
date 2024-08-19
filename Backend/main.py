import json
import os
import yaml
from flask import Flask, request, jsonify
from flask_cors import CORS
from feed_logic import get_custom_feed

with open('config.yaml', 'r') as file:
    config = yaml.safe_load(file)

app = Flask(__name__)
CORS(app)

os.makedirs("data", exist_ok=True)


@app.route("/", methods=['GET'])
def index():
    return "Welcome."


@app.route("/event", methods=['POST'])
def event():
    """ Send all the client-side events to this endpoint """
    user_id = request.form.get('user_id')
    # Save this event in the database
    with open("data/events_{}.json".format(user_id), "a") as f:
        f.write(json.dumps(request.form) + "\n")
    return jsonify({"success": True})


@app.route("/get_feed", methods=['POST'])
def get_feed():
    """ Send feed response to this endpoint """
    user_id = request.form.get('user_id')

    # Save the feed in the database
    with open("data/feed_{}.json".format(user_id), "a") as f:
        f.write(json.dumps(request.form) + "\n")

    # Load the feed content
    payload = json.loads(request.form["data"])

    # Customize the feed here
    custom_feed = get_custom_feed(payload["feed_info"])

    response = {"feed": custom_feed}
    return jsonify(response)


if __name__ == '__main__':
    app.run(
        "0.0.0.0",
        port=5000,
        debug=True,
    )
