import json
import socket
from urllib.error import HTTPError, URLError
from urllib.request import Request, ProxyHandler, build_opener


MODEL_NAME = "qwen3:8b"
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"

# Keep local requests direct, even if a system proxy is configured.
LOCAL_HTTP = build_opener(ProxyHandler({}))


class ModelError(Exception):
    """An error that the chat interface can explain to the user."""


def generate_reply(messages):
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "think": False,
        "stream": False,
        "keep_alive": "5m",
        "options": {
            "num_ctx": 8192,
            "num_predict": 600,
        },
    }

    request = Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with LOCAL_HTTP.open(request, timeout=120) as response:
            data = json.load(response)
    except HTTPError as error:
        if error.code == 404:
            raise ModelError(
                f"Model unavailable. Run: ollama pull {MODEL_NAME}"
            ) from error
        raise ModelError(
            f"Ollama returned an error ({error.code}). "
            "Check that the model runs in the Ollama terminal."
        ) from error
    except (TimeoutError, socket.timeout) as error:
        raise ModelError(
            "The local model took too long. Try a shorter message."
        ) from error
    except (URLError, OSError) as error:
        raise ModelError(
            "Cannot reach Ollama. Open the Ollama app and try again."
        ) from error
    except (ValueError, UnicodeError) as error:
        raise ModelError(
            "Ollama returned an unreadable response."
        ) from error

    if not isinstance(data, dict):
        raise ModelError("Ollama returned an unexpected response.")

    if data.get("error"):
        raise ModelError("Ollama could not complete this request.")

    message = data.get("message")
    reply = message.get("content") if isinstance(message, dict) else None

    if not data.get("done") or not isinstance(reply, str) or not reply.strip():
        raise ModelError("The model did not return a complete, usable reply.")

    return {
        "reply": reply.strip(),
        "truncated": data.get("done_reason") == "length",
    }