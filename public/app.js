const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messages = document.querySelector("#messages");
const personality = document.querySelector("#personality");
const clearButton = document.querySelector("#clear-chat");
const sendButton = form.querySelector('button[type="submit"]');

let isSending = false;

function addMessage(role, text, modeLabel = "") {
  const message = document.createElement("article");
  message.classList.add("message", role);

  const label = document.createElement("span");
  label.className = "message-label";

  if (role === "user") {
    label.textContent = "You";
  } else if (role === "system") {
    label.textContent = "Connection notice";
  } else {
    label.textContent = `Asterion · ${modeLabel} · Demo`;
  }

  const paragraph = document.createElement("p");
  paragraph.textContent = text;

  message.append(label, paragraph);
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
}

function showWelcome() {
  addMessage(
    "assistant",
    "Welcome to Asterion 🌙 Messages now go to your local Python " +
      "server for scripted replies. No AI service is connected, " +
      "and conversation history is not saved.",
    "Welcome"
  );
}

function setSending(sending) {
  isSending = sending;

  sendButton.disabled = sending;
  clearButton.disabled = sending;
  personality.disabled = sending;
  input.disabled = sending;

  sendButton.textContent = sending ? "Sending…" : "Send ↑";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSending) {
    return;
  }

  const text = input.value.trim();

  if (!text) {
    input.focus();
    return;
  }

  const selectedMode = personality.value;
  const modeLabel =
    personality.options[personality.selectedIndex].text;

  addMessage("user", text);
  input.value = "";
  setSending(true);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, 10000);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: text,
        personality: selectedMode
      }),
      signal: controller.signal
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "The server rejected the message.");
    }

    if (typeof data.reply !== "string" || data.mode !== "demo") {
      throw new Error("The server returned an unexpected response.");
    }

    addMessage("assistant", data.reply, modeLabel);
  } catch (error) {
    let notice;

    if (error.name === "AbortError") {
      notice = "The server took too long to respond. Try again.";
    } else if (error instanceof TypeError) {
      notice =
        "Could not reach the local server. Check that server.py is " +
        "running and open http://127.0.0.1:5000.";
    } else if (error instanceof SyntaxError) {
      notice =
        "The server did not return the expected JSON. " +
        "Check its terminal for errors.";
    } else {
      notice = error.message;
    }

    addMessage("system", notice);

    // Restore the message so you can retry without retyping.
    input.value = text;
  } finally {
    window.clearTimeout(timeoutId);
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
  if (isSending) {
    return;
  }

  messages.replaceChildren();
  showWelcome();
  input.focus();
});

showWelcome();