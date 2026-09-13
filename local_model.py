import json
import socket
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.request import Request, ProxyHandler, build_opener


MODEL_NAME = "qwen3:8b"
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"

LOCAL_HTTP = build_opener(ProxyHandler({}))


class ModelError(Exception):
    """An error that the chat interface can explain to the user."""


def stream_reply(messages):
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "think": False,
        "stream": True,
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

    has_text = False

    try:
        with LOCAL_HTTP.open(request, timeout=120) as response:
            for line in response:
                if not line.strip():
                    continue

                data = json.loads(line)

                if not isinstance(data, dict):
                    raise ModelError("Ollama returned an unexpected response.")

                if data.get("error"):
                    raise ModelError("Ollama could not complete this reply.")

                message = data.get("message", {})

                if not isinstance(message, dict):
                    raise ModelError("Ollama returned invalid message data.")

                chunk = message.get("content", "")

                if not isinstance(chunk, str):
                    raise ModelError("Ollama returned invalid reply text.")

                if chunk:
                    has_text = has_text or bool(chunk.strip())
                    yield {"type": "chunk", "text": chunk}

                if data.get("done") is True:
                    if not has_text:
                        raise ModelError("The model returned an empty reply.")

                    yield {
                        "type": "done",
                        "truncated": data.get("done_reason") == "length",
                    }
                    return

        # A closed connection is not proof that generation finished.
        raise ModelError("Ollama disconnected before finishing the reply.")

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
            "The model stopped responding. Please try again."
        ) from error

    except (URLError, OSError, HTTPException) as error:
        raise ModelError(
            "The Ollama connection failed. Check that Ollama is running."
        ) from error

    except (ValueError, UnicodeError) as error:
        raise ModelError(
            "Ollama returned an unreadable response."
        ) from error