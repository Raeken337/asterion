import json
from pathlib import Path

from flask import Flask, Response, jsonify, request

from local_model import MODEL_NAME, ModelError, stream_reply
from personalities import PERSONALITIES, build_system_prompt

import webbrowser
from threading import Timer


PROJECT_DIR = Path(__file__).resolve().parent

app = Flask(
    __name__,
    static_folder=str(PROJECT_DIR / "public"),
    static_url_path="",
)

app.config["MAX_CONTENT_LENGTH"] = 256 * 1024

MAX_HISTORY_MESSAGES = 12
CONTEXT_BYTE_BUDGET = 6000


def text_size(text):
    return len(text.encode("utf-8"))


def validate_history(history):
    if not isinstance(history, list):
        raise ValueError("Conversation history must be a list.")

    if len(history) > MAX_HISTORY_MESSAGES or len(history) % 2:
        raise ValueError("Conversation history must contain complete exchanges.")

    clean = []

    for index, item in enumerate(history):
        expected_role = "user" if index % 2 == 0 else "assistant"

        if not isinstance(item, dict) or item.get("role") != expected_role:
            raise ValueError("Conversation history has an invalid role.")

        content = item.get("content")

        if (
            not isinstance(content, str)
            or not content.strip()
            or len(content) > 16000
        ):
            raise ValueError("Conversation history contains invalid text.")

        clean.append({"role": expected_role, "content": content})

    return clean


def select_recent_history(history, current_message):
    remaining = CONTEXT_BYTE_BUDGET - text_size(current_message)
    selected = []

    # Keep complete user/assistant pairs, newest first.
    for index in range(len(history) - 2, -1, -2):
        pair = history[index:index + 2]
        size = sum(text_size(item["content"]) for item in pair)

        if size > remaining:
            break

        selected = pair + selected
        remaining -= size

    return selected


@app.get("/")
def home():
    return app.send_static_file("index.html")


@app.get("/api/health")
def health():
    # This reports Flask's configuration, not Ollama's availability.
    return jsonify(
        server="ok",
        mode="local",
        model=MODEL_NAME,
        ollama="not_checked",
    )


@app.post("/api/chat")
def chat():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify(error="Send a JSON object."), 400

    message = data.get("message")
    personality = data.get("personality", "playful")

    if not isinstance(message, str) or not message.strip():
        return jsonify(error="Please enter a message."), 400

    message = message.strip()

    if len(message) > 4000 or text_size(message) > CONTEXT_BYTE_BUDGET:
        return jsonify(error="That message is too long. Please shorten it."), 400

    if not isinstance(personality, str) or personality not in PERSONALITIES:
        return jsonify(error="Choose a supported personality."), 400

    try:
        history = validate_history(data.get("history", []))
    except ValueError as error:
        return jsonify(error=str(error)), 400

    recent = select_recent_history(history, message)

    model_messages = [
        {
            "role": "system",
            "content": build_system_prompt(personality),
        },
        *recent,
        {"role": "user", "content": message},
    ]

    def generate_events():
        stream = stream_reply(model_messages)

        try:
            for event in stream:
                yield json.dumps(event) + "\n"
        except ModelError as error:
            yield json.dumps({
                "type": "error",
                "message": str(error),
            }) + "\n"
        except Exception:
            app.logger.exception("Unexpected streaming failure")
            yield json.dumps({
                "type": "error",
                "message": "The server could not finish this reply.",
            }) + "\n"
        finally:
            stream.close()

    return Response(
        generate_events(),
        mimetype="application/x-ndjson",
        headers={
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )


@app.errorhandler(413)
def request_too_large(error):
    return jsonify(error="That request is too large. Clear chat and retry."), 413


if __name__ == "__main__":
    Timer(
        1.0,
        lambda: webbrowser.open("http://127.0.0.1:5000")
    ).start()

    app.run(host="127.0.0.1", port=5000, debug=False)