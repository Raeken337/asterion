const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messages = document.querySelector("#messages");
const personality = document.querySelector("#personality");
const clearButton = document.querySelector("#clear-chat");
const sendButton = form.querySelector('button[type="submit"]');

let isSending = false;
let conversation = [];

function addMessage(role, text, modeLabel = "") {
  const message = document.createElement("article");
  message.classList.add("message", role);

  const label = document.createElement("span");
  label.className = "message-label";

  if (role === "user") {
    label.textContent = "You";
  } else if (role === "system") {
    label.textContent = "Asterion notice";
  } else {
    label.textContent = `Asterion · ${modeLabel}`;
  }

  const paragraph = document.createElement("p");
  paragraph.textContent = text;

  message.append(label, paragraph);
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;

  return message;
}

function updateReply(bubble, text) {
  const nearBottom =
    messages.scrollHeight -
    messages.scrollTop -
    messages.clientHeight < 100;

  bubble.querySelector("p").textContent = text;

  // Let the user read older messages without pulling them downward.
  if (nearBottom) {
    messages.scrollTop = messages.scrollHeight;
  }
}

function showWelcome() {
  addMessage(
    "system",
    "Welcome to Asterion 🌙 Replies appear as your local model " +
      "generates them. Recent exchanges provide context; clear chat " +
      "or refresh resets it. Web access and lasting memory are not connected."
  );
}

function setSending(sending) {
  isSending = sending;
  sendButton.disabled = sending;
  clearButton.disabled = sending;
  personality.disabled = sending;
  input.disabled = sending;
  sendButton.textContent = sending ? "Replying…" : "Send ↑";
}

async function readEvents(response, onEvent, onActivity) {
  if (!response.body) {
    throw new Error("Your browser did not provide a response stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function processLine(line) {
    if (!line.trim()) return false;

    const event = JSON.parse(line);

    if (!event || typeof event !== "object") {
      throw new Error("The server sent an invalid event.");
    }

    onEvent(event);
    return event.type === "done";
  }

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        buffer += decoder.decode();

        if (buffer.trim() && processLine(buffer)) {
          return;
        }

        throw new Error("The connection ended before the reply finished.");
      }

      onActivity();
      buffer += decoder.decode(value, { stream: true });

      // A network packet can contain part of a line or several lines.
      let newlineIndex;

      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (processLine(line)) {
          return;
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The connection may already be closed.
    }

    reader.releaseLock();
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSending) return;

  const text = input.value.trim();

  if (!text) {
    input.focus();
    return;
  }

  const selectedMode = personality.value;
  const modeLabel =
    personality.options[personality.selectedIndex].text;

  const userBubble = addMessage("user", text);
  const assistantBubble = addMessage(
    "assistant",
    "Waiting for the local model…",
    modeLabel
  );

  assistantBubble.setAttribute("aria-busy", "true");

  input.value = "";
  setSending(true);

  const controller = new AbortController();
  let timeoutId;
  let reply = "";
  let completed = false;
  let truncated = false;

  function resetTimeout() {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 135000);
  }

  resetTimeout();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        personality: selectedMode,
        history: conversation
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "The server rejected the message.");
    }

    const contentType = response.headers.get("Content-Type") || "";

    if (!contentType.includes("application/x-ndjson")) {
      throw new Error(
        "The server is not streaming yet. Restart Python and refresh the page."
      );
    }

    await readEvents(
      response,
      (event) => {
        if (event.type === "chunk" && typeof event.text === "string") {
          reply += event.text;
          updateReply(assistantBubble, reply);
        } else if (event.type === "done") {
          completed = true;
          truncated = event.truncated === true;
        } else if (event.type === "error") {
          throw new Error(event.message || "The model could not finish.");
        } else {
          throw new Error("The server sent an unexpected event.");
        }
      },
      resetTimeout
    );

    if (!completed || !reply.trim()) {
      throw new Error("The model did not finish a usable reply.");
    }

    conversation.push(
      { role: "user", content: text },
      { role: "assistant", content: reply }
    );

    conversation = conversation.slice(-12);

    if (truncated) {
      addMessage(
        "system",
        "This reply reached its length limit. Ask Asterion to continue."
      );
    }
  } catch (error) {
    controller.abort();

    let notice;

    if (error.name === "AbortError") {
      notice = "The reply stopped responding for too long. Please retry.";
    } else if (error instanceof TypeError) {
      notice =
        "The server connection failed. Check that Python is running.";
    } else if (error instanceof SyntaxError) {
      notice =
        "The server sent unreadable data. Check its terminal for errors.";
    } else {
      notice = error.message;
    }

    // Failed exchanges must not become context or duplicate on retry.
    userBubble.remove();
    assistantBubble.remove();

    addMessage(
      "system",
      notice + " This attempt was discarded; your message is ready to retry."
    );

    input.value = text;
  } finally {
    window.clearTimeout(timeoutId);
    assistantBubble.removeAttribute("aria-busy");
    setSending(false);
    input.focus();
  }
});

input.addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing
  ) {
    event.preventDefault();
    form.requestSubmit();
  }
});

clearButton.addEventListener("click", () => {
  if (isSending) return;

  conversation = [];
  messages.replaceChildren();
  showWelcome();
  input.focus();
});

showWelcome();