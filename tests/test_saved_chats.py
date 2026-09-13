import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server
from chat_store import ChatStore
from local_model import ModelError


class SavedChatTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "chats.sqlite3"
        server.app.config.update(TESTING=True, CHAT_DB=self.path)
        self.client = server.app.test_client()

    def create(self, personality="playful"):
        response = self.client.post("/api/chats", json={"personality": personality})
        self.assertEqual(response.status_code, 201)
        return response.json

    def generate(self, chat, text="Hello", stream=None):
        if stream is None:
            def stream(messages):
                yield {"type": "chunk", "text": "Hello 🌙"}
                yield {"type": "done", "truncated": False}
        with patch.object(server, "stream_reply", stream):
            response = self.client.post("/api/chat", json={
                "chat_id": chat["id"], "revision": chat["revision"],
                "message": text, "personality": chat["personality"],
            })
            return response, [json.loads(line) for line in response.data.splitlines()]

    def test_create_rename_reopen_and_delete_persist(self):
        chat = self.create("celestial")
        response = self.client.patch(f'/api/chats/{chat["id"]}', json={
            "revision": 0, "title": "Moon 🌙 <script>",
        })
        self.assertEqual(response.status_code, 200)
        reopened = ChatStore(self.path).get(chat["id"])
        self.assertEqual(reopened["title"], "Moon 🌙 <script>")
        self.assertEqual(reopened["personality"], "celestial")
        self.assertEqual(self.client.get("/api/chats").json["chats"][0]["id"], chat["id"])
        response = self.client.delete(f'/api/chats/{chat["id"]}', json={"revision": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get(f'/api/chats/{chat["id"]}').status_code, 404)

    def test_done_means_exchange_is_durable(self):
        chat = self.create()
        response, events = self.generate(chat, "My painting is called Tides")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(events[-1]["type"], "done")
        self.assertEqual(events[-1]["revision"], 1)
        saved = ChatStore(self.path).get(chat["id"])
        self.assertEqual(len(saved["messages"]), 2)
        self.assertEqual(saved["title"], "My painting is called Tides")
        self.assertEqual(saved["messages"][1]["personality"], "playful")

    def test_history_is_isolated_and_comes_from_database(self):
        first = self.create()
        self.generate(first, "private first-chat detail")
        second = self.create("brooding")
        captured = []
        def stream(messages):
            captured.extend(messages)
            yield {"type": "chunk", "text": "Second chat"}
            yield {"type": "done"}
        self.generate(second, "Second question", stream)
        self.assertEqual([m["role"] for m in captured], ["system", "user"])
        self.assertNotIn("private first-chat detail", str(captured))
        captured.clear()
        first = ChatStore(self.path).get(first["id"])
        self.generate(first, "Follow-up", stream)
        self.assertEqual(captured[1]["content"], "private first-chat detail")

    def test_interrupted_reply_never_saves_partial_exchange(self):
        chat = self.create()
        def stream(messages):
            yield {"type": "chunk", "text": "unfinished"}
            raise ModelError("Disconnected")
        _, events = self.generate(chat, stream=stream)
        self.assertEqual(events[-1]["type"], "error")
        self.assertEqual(ChatStore(self.path).get(chat["id"])["messages"], [])

    def test_stale_tab_cannot_overwrite_or_generate(self):
        chat = self.create()
        self.client.patch(f'/api/chats/{chat["id"]}', json={"revision": 0, "title": "Renamed"})
        for method in [self.client.patch, self.client.delete]:
            response = method(f'/api/chats/{chat["id"]}', json={"revision": 0, "clear": True})
            self.assertEqual(response.status_code, 409)
        response = self.client.post("/api/chat", json={
            "chat_id": chat["id"], "revision": 0, "message": "Hi", "personality": "playful",
        })
        self.assertEqual(response.status_code, 409)

    def test_deleting_during_generation_does_not_resurrect_chat(self):
        chat = self.create()
        def stream(messages):
            yield {"type": "chunk", "text": "Partial"}
            ChatStore(self.path).mutate(chat["id"], 0, None)
            yield {"type": "done"}
        _, events = self.generate(chat, stream=stream)
        self.assertEqual(events[-1]["type"], "error")
        self.assertEqual(self.client.get("/api/chats").json["chats"], [])

    def test_clear_preserves_title_and_removes_context(self):
        chat = self.create()
        self.generate(chat)
        response = self.client.patch(f'/api/chats/{chat["id"]}', json={"revision": 1, "clear": True})
        self.assertEqual(response.json["messages"], [])
        self.assertEqual(response.json["title"], "Hello")
        _, events = self.generate(response.json)
        self.assertEqual(events[-1]["type"], "done")

    def test_long_archive_is_retained_but_context_is_bounded(self):
        chat = self.create()
        storage = ChatStore(self.path)
        for n in range(9):
            chat = storage.append_exchange(chat["id"], chat["revision"], f"Question {n}", "Answer", "playful", False)
        captured = []
        def stream(messages):
            captured.extend(messages)
            yield {"type": "chunk", "text": "More"}
            yield {"type": "done", "truncated": True}
        self.generate(chat, stream=stream)
        self.assertEqual(len(captured), 14)
        self.assertEqual(captured[1]["content"], "Question 3")
        saved = storage.get(chat["id"])
        self.assertEqual(len(saved["messages"]), 20)
        self.assertTrue(saved["messages"][-1]["truncated"])

    def test_invalid_requests_and_no_cache(self):
        for value in [None, [], {}, {"personality": []}]:
            self.assertEqual(self.client.post("/api/chats", json=value).status_code, 400)
        chat = self.create()
        for data in [{"revision": True}, {"revision": 0, "title": " "}, {"revision": 0, "personality": []}]:
            self.assertEqual(self.client.patch(f'/api/chats/{chat["id"]}', json=data).status_code, 400)
        self.assertEqual(self.client.get("/api/chats").headers["Cache-Control"], "no-store")


if __name__ == "__main__":
    unittest.main()
