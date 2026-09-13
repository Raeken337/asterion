"""Local conversation storage. Every mutation checks the caller's revision."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import uuid4


class ChatMissing(Exception):
    pass


class ChatConflict(Exception):
    pass


class ChatStore:
    def __init__(self, path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY, title TEXT NOT NULL,
                personality TEXT NOT NULL, messages TEXT NOT NULL DEFAULT '[]',
                revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
            )""")

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def decode(row):
        if row is None:
            raise ChatMissing("This chat was deleted. Open another chat.")
        chat = dict(row)
        chat["messages"] = json.loads(chat["messages"])
        return chat

    def list(self):
        with self.connection() as db:
            return [dict(row) for row in db.execute(
                "SELECT id, title, personality, revision, updated_at "
                "FROM chats ORDER BY updated_at DESC, id"
            )]

    def get(self, chat_id):
        with self.connection() as db:
            return self.decode(db.execute(
                "SELECT * FROM chats WHERE id = ?", (chat_id,)
            ).fetchone())

    def create(self, personality):
        chat_id = str(uuid4())
        with self.connection() as db:
            db.execute(
                "INSERT INTO chats (id, title, personality, updated_at) VALUES (?, ?, ?, ?)",
                (chat_id, "New chat", personality, datetime.now(timezone.utc).isoformat()),
            )
        return self.get(chat_id)

    def mutate(self, chat_id, revision, update):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            chat = self.decode(db.execute(
                "SELECT * FROM chats WHERE id = ?", (chat_id,)
            ).fetchone())
            if chat["revision"] != revision:
                raise ChatConflict("This chat changed in another tab. Reopen it before continuing.")
            if update is None:
                db.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
                return None
            update(chat)
            chat["revision"] += 1
            chat["updated_at"] = datetime.now(timezone.utc).isoformat()
            db.execute(
                "UPDATE chats SET title=?, personality=?, messages=?, revision=?, "
                "updated_at=? WHERE id=?",
                (chat["title"], chat["personality"], json.dumps(chat["messages"]),
                 chat["revision"], chat["updated_at"], chat_id),
            )
            return chat

    def append_exchange(self, chat_id, revision, message, reply, personality, truncated):
        def append(chat):
            if not chat["messages"] and chat["title"] == "New chat":
                chat["title"] = " ".join(message.split())[:60]
            chat["personality"] = personality
            chat["messages"].extend([
                {"role": "user", "content": message},
                {"role": "assistant", "content": reply,
                 "personality": personality, "truncated": truncated},
            ])
        return self.mutate(chat_id, revision, append)
