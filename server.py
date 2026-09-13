from pathlib import Path

from flask import Flask, jsonify, request


PROJECT_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = PROJECT_DIR / "public"

app = Flask(
    __name__,
    static_folder=str(PUBLIC_DIR),
    static_url_path="",
)


app.config["MAX_CONTENT_LENGTH"] = 32 * 1024

DEMO_REPLIES = {
    "playful": (
        "Your message made it to Python and back. "
        "Bro has a backend now 🌙 "
        "This reply is still scripted—no AI connected yet."
    ),
    "brooding": (
        "The connection is established. "
        "Your words reached the server; this response came back. "
        "For now, it is scripted."
    ),
    "clinical": (
        "Browser-to-server communication confirmed. "
        "Actual intelligence remains pending. "
        "A functional nervous system; currently no thoughts."
    ),
    "boomer": (
        "Message received down here in the engine room. "
        "Python sent this one back. "
        "Still scripted, but the plumbing works."
    ),
    "creative": (
        "Your transmission reached the observatory. "
        "Python has returned its first signal across the dark. "
        "A scripted constellation, awaiting a thinking voice."
    ),
}


@app.get("/")
def home():
    return app.send_static_file("index.html")


@app.get("/api/health")
def health():
    return jsonify(status="ok", mode="demo")


@app.post("/api/chat")
def chat():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify(error="Send a JSON object."), 400

    message = data.get("message")
    personality = data.get("personality", "playful")

    if not isinstance(message, str) or not message.strip():
        return jsonify(error="Please enter a message."), 400

    if len(message) > 4000:
        return jsonify(error="Keep messages within 4,000 characters."), 400

    if (
        not isinstance(personality, str)
        or personality not in DEMO_REPLIES
    ):
        return jsonify(error="Choose a supported personality."), 400

    return jsonify(
        reply=DEMO_REPLIES[personality],
        personality=personality,
        mode="demo",
    )


@app.errorhandler(413)
def request_too_large(error):
    return jsonify(error="That request is too large."), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)