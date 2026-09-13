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

function showWelcome() {
  addMessage(
    "system",
    "Welcome to Asterion 🌙 Send a message to your local model. " +
      "Recent exchanges provide context; clear chat or refresh resets it. " +
      "Web access and lasting memory are not connected."
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

  input.value = "";
  setSending(true);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 135000);

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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "The server rejected the message.");
    }

    if (
      typeof data.reply !== "string" ||
      !data.reply.trim() ||
      data.mode !== "local"
    ) {
      throw new Error("The server returned an unexpected response.");
    }

    addMessage("assistant", data.reply, modeLabel);

    // Only successful exchanges become conversation context.
    conversation.push(
      { role: "user", content: text },
      { role: "assistant", content: data.reply }
    );

    conversation = conversation.slice(-12);

    if (data.truncated) {
      addMessage(
        "system",
        "This reply reached its length limit. Ask Asterion to continue."
      );
    }
  } catch (error) {
    let notice;

    if (error.name === "AbortError") {
      notice =
        "The request timed out. The model may still be finishing it. " +
        "Wait a moment before retrying.";
    } else if (error instanceof TypeError) {
      notice =
        "Cannot reach the Python server. Check that server.py is running.";
    } else if (error instanceof SyntaxError) {
      notice =
        "The server returned an unreadable response. Check its terminal.";
    } else {
      notice = error.message;
    }

    // Remove the failed attempt to avoid duplicate bubbles on retry.
    userBubble.remove();
    addMessage("system", notice);
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
  if (isSending) return;

  conversation = [];
  messages.replaceChildren();
  showWelcome();
  input.focus();
});

showWelcome();