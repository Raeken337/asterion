import json
from pathlib import Path

from flask import Flask, Response, jsonify, request

from local_model import MODEL_NAME, ModelError, stream_reply
from personalities import ASPECTS, build_system_prompt
from chat_store import ChatStore, ChatMissing, ChatConflict
import sqlite3

import webbrowser
from threading import Timer


PROJECT_DIR = Path(__file__).resolve().parent

app = Flask(
    __name__,
    static_folder=str(PROJECT_DIR / "public"),
    static_url_path="",
)

app.config["MAX_CONTENT_LENGTH"] = 256 * 1024
app.config["CHAT_DB"] = PROJECT_DIR / "data" / "chats.sqlite3"


def store():
    return ChatStore(Path(app.config["CHAT_DB"]))


@app.errorhandler(ChatMissing)
def chat_missing(error):
    return jsonify(error=str(error)), 404


@app.errorhandler(ChatConflict)
def chat_conflict(error):
    return jsonify(error=str(error)), 409


@app.errorhandler(sqlite3.Error)
def storage_error(error):
    app.logger.exception("Conversation storage failed")
    return jsonify(error="Could not access saved chats. Check disk space and folder permissions."), 503


def valid_revision(data):
    return type(data.get("revision")) is int and data["revision"] >= 0


@app.get("/api/chats")
def list_chats():
    return jsonify(chats=store().list())


@app.post("/api/chats")
def create_chat():
    data = request.get_json(silent=True)
    if (not isinstance(data, dict) or not isinstance(data.get("personality"), str)
            or data["personality"] not in ASPECTS):
        return jsonify(error="Choose a supported personality."), 400
    return jsonify(store().create(data["personality"])), 201


@app.get("/api/chats/<chat_id>")
def get_chat(chat_id):
    return jsonify(store().get(chat_id))


@app.route("/api/chats/<chat_id>", methods=["PATCH", "DELETE"])
def change_chat(chat_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not valid_revision(data):
        return jsonify(error="A chat revision is required. Reopen this chat."), 400
    if request.method == "DELETE":
        store().mutate(chat_id, data["revision"], None)
        return jsonify(deleted=True)
    if set(data) - {"revision", "title", "personality", "clear"}:
        return jsonify(error="Unsupported chat change."), 400
    if "title" in data and (not isinstance(data["title"], str)
                           or not 1 <= len(data["title"].strip()) <= 100):
        return jsonify(error="Use a title between 1 and 100 characters."), 400
    if "personality" in data and (not isinstance(data["personality"], str)
                                 or data["personality"] not in ASPECTS):
        return jsonify(error="Choose a supported personality."), 400
    if "clear" in data and data["clear"] is not True:
        return jsonify(error="Invalid clear request."), 400

    def update(chat):
        if "title" in data:
            chat["title"] = data["title"].strip()
        if "personality" in data:
            chat["personality"] = data["personality"]
        if data.get("clear"):
            chat["messages"] = []
    return jsonify(store().mutate(chat_id, data["revision"], update))


@app.after_request
def private_api(response):
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response

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
    personality = data.get("personality", "core")

    if not isinstance(message, str) or not message.strip():
        return jsonify(error="Please enter a message."), 400

    message = message.strip()

    if len(message) > 4000 or text_size(message) > CONTEXT_BYTE_BUDGET:
        return jsonify(error="That message is too long. Please shorten it."), 400

    if not isinstance(personality, str) or personality not in ASPECTS:
        return jsonify(error="Choose a supported personality."), 400

    chat_id = data.get("chat_id")
    if not isinstance(chat_id, str) or not valid_revision(data):
        return jsonify(error="Reopen your chat, then send your message again."), 400
    saved = store().get(chat_id)
    revision = data["revision"]
    if saved["revision"] != revision:
        raise ChatConflict("This chat changed in another tab. Reopen it before continuing.")
    history = saved["messages"][-MAX_HISTORY_MESSAGES:]
    history = [{"role": item["role"], "content": item["content"]} for item in history]

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
        reply = ""

        try:
            for event in stream:
                if event["type"] == "chunk":
                    reply += event["text"]
                elif event["type"] == "done":
                    if not reply.strip():
                        raise ModelError("The model did not finish a usable reply.")
                    updated = store().append_exchange(
                        chat_id, revision, message, reply, personality,
                        event.get("truncated", False),
                    )
                    event = {**event, "revision": updated["revision"], "title": updated["title"]}
                yield json.dumps(event) + "\n"
        except (ModelError, ChatMissing, ChatConflict) as error:
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
