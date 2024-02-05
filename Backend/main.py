import yaml
from flask import Flask, request, render_template, redirect, jsonify, g, make_response
from flask_cors import CORS

with open('config.yaml', 'r') as file:
    config = yaml.safe_load(file)

app = Flask(__name__)
CORS(app)


@app.route("/event", methods=['POST'])
def event():
    print(request.form)
    return jsonify({"success": True})


@app.route("/save_feed", methods=['POST'])
def save_feed():
    print(request.form)
    return jsonify({"success": True})


if __name__ == '__main__':
    app.run(
        "0.0.0.0",
        port=5000,
        debug=True,
    )
