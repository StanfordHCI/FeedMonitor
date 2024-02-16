import json
import os
from functools import wraps

import yaml
from flask import Flask, request, render_template, redirect, jsonify, g, make_response
from flask_cors import CORS

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
    user_id = request.form.get('user_id')
    with open("data/events_{}.json".format(user_id), "a") as f:
        f.write(json.dumps(request.form)+"\n")
    return jsonify({"success": True})


@app.route("/save_feed", methods=['POST'])
def save_feed():
    user_id = request.form.get('user_id')
    with open("data/feed_{}.json".format(user_id), "a") as f:
        f.write(json.dumps(request.form)+"\n")
    return jsonify({"success": True})


if __name__ == '__main__':
    app.run(
        "0.0.0.0",
        port=5000,
        debug=True,
    )
