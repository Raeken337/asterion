const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messages = document.querySelector("#messages");
const personality = document.querySelector("#personality");
const clearButton = document.querySelector("#clear-chat");
const sendButton = form.querySelector('button[type="submit"]');

let isSending = false;
let conversation = [];
let activeChat = null;
let chatList = [];
let busy = false;
let needsReload = false;
const chatListElement = document.querySelector("#chat-list");
const statusElement = document.querySelector("#chat-status");
const newButton = document.querySelector("#new-chat");
const reloadButton = document.querySelector("#reload-chats");
const renameButton = document.querySelector("#rename-chat");
const deleteButton = document.querySelector("#delete-chat");

function ask(title, description, initialValue = null, confirmLabel = "Confirm") {
  const dialog = document.querySelector("#chat-dialog");
  const field = document.querySelector("#dialog-input");
  document.querySelector("#dialog-title").textContent = title;
  document.querySelector("#dialog-description").textContent = description;
  document.querySelector("#dialog-confirm").textContent = confirmLabel;
  document.querySelector("#dialog-label").hidden = initialValue === null;
  field.hidden = initialValue === null;
  field.required = initialValue !== null;
  field.value = initialValue || "";
  dialog.returnValue = "cancel";
  return new Promise(resolve => {
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue === "confirm" ? (initialValue === null ? true : field.value) : null);
    }, { once: true });
    dialog.showModal();
    if (initialValue !== null) { field.focus(); field.select(); }
  });
}

async function api(path, method = "GET", data) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not update saved chats.");
  return result;
}

function controls() {
  const locked = busy || isSending;
  for (const button of [newButton, reloadButton, ...chatListElement.querySelectorAll("button")]) {
    button.disabled = locked;
  }
  for (const element of [sendButton, clearButton, renameButton, deleteButton, personality, input]) {
    element.disabled = locked || !activeChat || needsReload;
  }
}

function renderList() {
  chatListElement.replaceChildren();
  for (const chat of chatList) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-link";
    button.textContent = chat.title;
    if (chat.id === activeChat?.id) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => run(() => openChat(chat.id)));
    chatListElement.append(button);
  }
  controls();
}

function displayChat(chat) {
  activeChat = chat;
  needsReload = false;
  conversation = chat.messages.slice(-12).map(({ role, content }) => ({ role, content }));
  personality.value = chat.personality;
  document.querySelector("#chat-title").textContent = chat.title;
  messages.replaceChildren();
  showWelcome();
  for (const item of chat.messages) {
    const label = [...personality.options].find(option => option.value === item.personality)?.text || "Assistant";
    addMessage(item.role, item.content, label);
    if (item.truncated) addMessage("system", "This reply reached its length limit. Ask Asterion to continue.");
  }
  input.value = "";
  try { localStorage.setItem("asterion.activeChat", chat.id); } catch { /* Optional selection hint. */ }
  renderList();
  window.dispatchEvent(new Event("asterion:chat-opened"));
}

async function refreshList() {
  chatList = (await api("/api/chats")).chats;
  renderList();
}

async function openChat(id) {
  if (input.value.trim() && !await ask("Switch chats?", "Your unsent draft will be discarded.")) return;
  displayChat(await api(`/api/chats/${id}`));
  statusElement.textContent = "Saved locally on this computer.";
}

async function run(action) {
  if (busy || isSending) return;
  busy = true;
  controls();
  try {
    await action();
  } catch (error) {
    statusElement.textContent = `${error.message} Use Reload chats to try again.`;
  } finally {
    busy = false;
    controls();
  }
}

async function loadChats() {
  await refreshList();
  let remembered;
  try { remembered = localStorage.getItem("asterion.activeChat"); } catch { /* Optional. */ }
  const id = chatList.find(chat => chat.id === (activeChat?.id || remembered))?.id || chatList[0]?.id;
  if (id) await openChat(id);
  else {
    displayChat(await api("/api/chats", "POST", { personality: "core" }));
    await refreshList();
  }
  statusElement.textContent = "Saved locally on this computer.";
}

newButton.addEventListener("click", () => run(async () => {
  if (input.value.trim() && !await ask("Start a new chat?", "Your unsent draft will be discarded.")) return;
  displayChat(await api("/api/chats", "POST", { personality: "core" }));
  await refreshList();
  statusElement.textContent = "New chat saved.";
}));
reloadButton.addEventListener("click", () => run(loadChats));
renameButton.addEventListener("click", () => run(async () => {
  const title = await ask("Rename conversation", "Choose a name up to 100 characters.", activeChat.title, "Save name");
  if (title === null) return;
  const updated = await api(`/api/chats/${activeChat.id}`, "PATCH", { revision: activeChat.revision, title });
  activeChat = updated;
  document.querySelector("#chat-title").textContent = updated.title;
  await refreshList();
  statusElement.textContent = "Chat renamed.";
}));
deleteButton.addEventListener("click", () => run(async () => {
  if (!await ask("Delete conversation?", `Delete “${activeChat.title}” and all its messages? This cannot be undone.`, null, "Delete chat")) return;
  await api(`/api/chats/${activeChat.id}`, "DELETE", { revision: activeChat.revision });
  activeChat = null;
  conversation = [];
  messages.replaceChildren();
  input.value = "";
  document.querySelector("#chat-title").textContent = "New chat";
  await loadChats();
}));
personality.addEventListener("change", () => run(async () => {
  try {
    activeChat = await api(`/api/chats/${activeChat.id}`, "PATCH", {
      revision: activeChat.revision, personality: personality.value
    });
    await refreshList();
  } finally {
    personality.value = activeChat.personality;
  }
}));

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
  label.textContent =
    modeLabel === "Asterion" || modeLabel === "Asterion · Core"
      ? "Asterion"
      : `Asterion · ${modeLabel}`;
  }

  const body = document.createElement("div");
  body.className = "message-body";

  renderMessageBody(body, text, role === "assistant");

  message.append(label, body);
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;

  return message;
}

function updateReply(bubble, text) {
  const nearBottom =
    messages.scrollHeight -
    messages.scrollTop -
    messages.clientHeight < 100;

  renderMessageBody(
    bubble.querySelector(".message-body"),
    text,
    true
  );

  if (nearBottom) {
    messages.scrollTop = messages.scrollHeight;
  }
}

function showWelcome() {
  // The UI shell provides the empty-chat welcome screen.
}

function setSending(sending) {
  isSending = sending;
  controls();
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

  if (isSending || busy || !activeChat || needsReload) return;

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
        chat_id: activeChat.id,
        revision: activeChat.revision
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
          activeChat.revision = event.revision;
          activeChat.title = event.title;
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
    activeChat.messages.push(
      { role: "user", content: text },
      { role: "assistant", content: reply, personality: selectedMode, truncated }
    );
    document.querySelector("#chat-title").textContent = activeChat.title;
    statusElement.textContent = "Conversation saved.";
    // Sidebar refresh failures must not discard a successfully saved exchange.
    try { await refreshList(); } catch { statusElement.textContent = "Reply saved. Reload chats to refresh the list."; }

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
      notice + " Reopen this chat to check its saved state before retrying."
    );

    input.value = text;
    needsReload = true;
    statusElement.textContent = "Reload chats before retrying; the reply may have saved before the connection ended.";
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

clearButton.addEventListener("click", () => run(async () => {
  if (!await ask("Clear conversation?", "Permanently clear all saved messages in this chat? The conversation itself will remain.", null, "Clear messages")) return;
  displayChat(await api(`/api/chats/${activeChat.id}`, "PATCH", {
    revision: activeChat.revision, clear: true
  }));
  await refreshList();
  statusElement.textContent = "Chat cleared.";
}));

run(loadChats);
