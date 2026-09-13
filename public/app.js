const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messages = document.querySelector("#messages");
const personality = document.querySelector("#personality");
const clearButton = document.querySelector("#clear-chat");

const demoReplies = {
  playful:
    "The chat window is alive. Celestial admin department: operational 🌙 " +
    "This is a scripted reply for now—my AI connection comes later.",

  brooding:
    "A quiet beginning. The interface is ready; the intelligence comes next. " +
    "For now, this is a scripted reply.",

  clinical:
    "Message displayed. Interface functional. Intelligence pending. " +
    "Excellent aesthetics; currently zero reasoning. This reply is scripted.",

  boomer:
    "Well, would you look at that—it works. " +
    "No need to hit the monitor. This is a scripted reply " +
    "while we get the AI plumbing sorted.",

  creative:
    "The observatory has its first light. " +
    "Soon, we’ll give it a voice that can answer yours. " +
    "Until then, this reply is a scripted transmission."
};

function addMessage(role, text, modeLabel = "") {
  const message = document.createElement("article");
  message.classList.add("message", role);

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent =
    role === "user"
      ? "You"
      : `Asterion · ${modeLabel} · Demo`;

  const paragraph = document.createElement("p");
  paragraph.textContent = text;

  message.append(label, paragraph);
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
}

function showWelcome() {
  addMessage(
    "assistant",
    "Welcome to Asterion 🌙 Choose a personality and send a message " +
      "to try the interface. Replies are scripted: no AI is connected, " +
      "and this demo does not send or save your messages.",
    "Welcome"
  );
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

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

  addMessage("assistant", demoReplies[selectedMode], modeLabel);
  input.focus();
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
  messages.replaceChildren();
  showWelcome();
  input.focus();
});

showWelcome();