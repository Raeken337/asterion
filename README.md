# Asterion

A local personal AI assistant with a celestial interface and five conversational
personalities: Playful, Brooding, Clinical, Boomer, and Celestial.

## Current features

- Local Qwen3 8B replies through Ollama, with thinking disabled.
- Streaming responses and sanitized Markdown rendering.
- Separate saved conversations: create, reopen, rename, and delete.
- Automatic titles from the first completed exchange; titles can be edited.
- Each chat retains its selected personality and the personality used for each reply.
- Clear chat removes its saved messages while keeping the conversation and title.
- Recent context comes from the selected chat only, with up to six exchanges and
  a byte budget. Older messages remain readable but are not all sent to the model.
- Revision checks prevent stale tabs and in-flight replies from overwriting a
  conversation that was changed, cleared, or deleted elsewhere.

## Run

From the project folder in PowerShell, with Ollama running and `qwen3:8b` installed:

```powershell
.\.venv\Scripts\Activate.ps1
python server.py
```

The server opens http://127.0.0.1:5000 in your default browser. After updating
server code, stop Python with Ctrl+C, run it again, and refresh the browser.

## Saved conversations

Chats live in `data/chats.sqlite3` on this computer, outside the public web folder.
The entire `data/` directory is ignored by Git. No new package is needed: SQLite
is included in Python. Chat text is stored locally without application encryption.

Messages are committed as a complete user/assistant exchange before the final
stream event. Interrupted model replies are not stored. If the network ends
 after a save but before confirmation reaches the browser, reopen the chat to
check the saved state before retrying. The UI requires this reload after errors.

Refreshing or closing the browser preserves completed exchanges. Unsent drafts
are not saved. Conversations from the earlier, temporary-chat version are not
automatically imported; copy anything you want to keep before refreshing it.

Delete removes a conversation; Clear chat removes its messages. Both ask for
confirmation and have no undo. Other conversations are unaffected. To back up
the database, stop the server first and copy `data/chats.sqlite3` somewhere safe.

Saved transcripts are not cross-chat memory. Web search, external actions,
calendar, reminders, and image input are not connected.

## Tests

```powershell
python -m unittest discover -s tests -v
```

The tests use temporary databases and simulated model streams. They cover
persistence, context isolation, clear/delete, concurrent changes, interrupted
replies, input validation, and bounded model context with full transcript storage.
