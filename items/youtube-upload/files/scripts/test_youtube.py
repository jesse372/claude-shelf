"""Offline API simulations; no credentials and no network calls."""
import argparse
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import youtube as yt

CHANNEL = "UC" + "a" * 22
VIDEO = "abcdefghijk"
URI = "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=fixture"


class Response:
    def __init__(self, code, data=None, headers=None):
        self.status_code, self.data, self.headers = code, data or {}, headers or {}
    def json(self):
        return self.data


class FakeSession:
    def __init__(self, replies):
        self.replies, self.calls = list(replies), []
    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        if not self.replies:
            raise AssertionError("Unexpected network operation")
        value = self.replies.pop(0)
        if isinstance(value, Exception):
            raise value
        return value


class UploadTests(unittest.TestCase):
    def setUp(self):
        external = Path("/Volumes/LaCie/VideoEdits/tmp")
        self.temp = tempfile.TemporaryDirectory()
        self.media_temp = tempfile.TemporaryDirectory(dir=external if external.is_dir() else None)
        self.root = Path(self.temp.name)
        self.oldroot = yt.ROOT
        yt.ROOT = self.root / "state"
        self.video = Path(self.media_temp.name) / "final.mp4"
        self.video.write_bytes(b"offline mock media")
        self.quiet = contextlib.redirect_stdout(io.StringIO())
        self.quiet.__enter__()

    def tearDown(self):
        self.quiet.__exit__(None, None, None)
        yt.ROOT = self.oldroot
        self.temp.cleanup()
        self.media_temp.cleanup()

    def args(self, **changes):
        data = dict(file=str(self.video), thumbnail=None, title="A video", description="",
                    description_file=None, channel_id=CHANNEL, privacy="private", made_for_kids="no",
                    synthetic_media=None, publish_at=None, tag=None, category="22", notify_subscribers="no")
        data.update(changes)
        return argparse.Namespace(**data)

    def plan(self, **changes):
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured):
            yt.plan(self.args(**changes))
        job = json.loads(captured.getvalue())
        return yt.job_path(job["id"]), job

    def verified(self, privacy="private"):
        return Response(200, {"items": [{"id": VIDEO, "snippet": {"channelId": CHANNEL,
            "title": "A video", "description": "", "categoryId": "22", "tags": []},
            "status": {"privacyStatus": privacy, "uploadStatus": "processed", "selfDeclaredMadeForKids": False},
            "processingDetails": {"processingStatus": "succeeded"}}]})

    def upload(self, job, sess, confirm=True):
        with patch.object(yt, "session", return_value=sess), patch.object(yt, "channel", return_value={"id": CHANNEL}), patch.object(yt.time, "sleep"):
            yt.upload(argparse.Namespace(job=job["id"], confirm=confirm))

    def test_plan_is_local_idempotent_and_private(self):
        path, job = self.plan()
        self.plan()
        self.assertEqual(len(list(path.parent.glob("*.json"))), 1)
        self.assertEqual(job["body"]["status"]["privacyStatus"], "private")
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_invalid_metadata_and_schedule(self):
        for changes in ({"title": "x"*101}, {"description": "é"*2501}, {"tag": ["x"*501]},
                        {"publish_at": "2020-01-01T00:00:00Z"}, {"publish_at": "2099-01-01T00:00:00"},
                        {"publish_at": "2099-01-01T00:00:00Z", "privacy": "public"}):
            with self.subTest(changes=changes), self.assertRaises(yt.UploadError):
                yt.metadata(self.args(**changes))

    def test_preview_never_connects(self):
        _, job = self.plan()
        with patch.object(yt, "session", side_effect=AssertionError("must not connect")):
            with self.assertRaisesRegex(yt.UploadError, "Preview only"):
                yt.upload(argparse.Namespace(job=job["id"], confirm=False))

    def test_wrong_channel_and_changed_file_block_insertion(self):
        _, job = self.plan()
        sess = FakeSession([])
        with patch.object(yt, "session", return_value=sess), patch.object(yt, "channel", return_value={"id": "wrong"}):
            with self.assertRaisesRegex(yt.UploadError, "channel differs"):
                yt.upload(argparse.Namespace(job=job["id"], confirm=True))
        self.video.write_bytes(b"changed")
        with self.assertRaisesRegex(yt.UploadError, "changed since planning"):
            self.upload(job, sess)
        self.assertEqual(sess.calls, [])

    def test_lost_final_response_resumes_session_without_insert(self):
        path, job = self.plan()
        sess = FakeSession([Response(200, headers={"Location": URI}), Response(308), OSError("lost final reply")])
        with self.assertRaisesRegex(yt.UploadError, "Network request interrupted"):
            self.upload(job, sess)
        self.assertEqual(yt.read(path)["phase"], "uploading")
        retry = FakeSession([Response(200, {"id": VIDEO}), self.verified()])
        self.upload(job, retry)
        self.assertEqual([m for m, _, _ in retry.calls], ["PUT", "GET"])
        self.assertEqual(yt.read(path)["video_id"], VIDEO)
        self.assertNotIn("session_uri", yt.read(path))

    def test_uncertain_initiation_blocks_automatic_restart(self):
        path, job = self.plan()
        with self.assertRaises(yt.UploadError):
            self.upload(job, FakeSession([OSError("lost initiation")]))
        self.assertEqual(yt.read(path)["phase"], "initiating")
        retry = FakeSession([])
        with self.assertRaisesRegex(yt.UploadError, "outcome is uncertain"):
            self.upload(job, retry)
        self.assertEqual(retry.calls, [])

    def test_duplicate_file_new_metadata_is_blocked(self):
        path, original = self.plan()
        original.update(phase="uploaded", video_id=VIDEO)
        yt.save(path, original)
        _, second = self.plan(title="A different title")
        with self.assertRaisesRegex(yt.UploadError, "already attempted"):
            self.upload(second, FakeSession([]))

    def test_visibility_mismatch_saves_id_and_does_not_reinsert(self):
        path, job = self.plan(privacy="public")
        sess = FakeSession([Response(200, headers={"Location": URI}), Response(308),
                            Response(200, {"id": VIDEO}), self.verified("private")])
        with self.assertRaisesRegex(yt.UploadError, "visibility was not applied"):
            self.upload(job, sess)
        self.assertEqual(yt.read(path)["video_id"], VIDEO)
        retry = FakeSession([self.verified("public")])
        self.upload(job, retry)
        self.assertEqual([m for m, _, _ in retry.calls], ["GET"])

    def test_thumbnail_failure_only_retries_thumbnail(self):
        thumb = self.root / "thumb.jpg"; thumb.write_bytes(b"offline image fixture")
        path, job = self.plan(thumbnail=str(thumb))
        sess = FakeSession([Response(200, headers={"Location": URI}), Response(308),
                            Response(200, {"id": VIDEO}), Response(403)])
        with self.assertRaises(yt.UploadError):
            self.upload(job, sess)
        self.assertEqual(yt.read(path)["video_id"], VIDEO)
        retry = FakeSession([Response(200), self.verified()])
        self.upload(job, retry)
        self.assertTrue(yt.read(path)["thumbnail_done"])
        self.assertTrue(retry.calls[0][1].endswith("thumbnails/set"))
        self.assertEqual(len(retry.calls), 2)

    def test_resume_honors_server_acknowledged_bytes(self):
        path, job = self.plan()
        job.update(phase="uploading", session_uri=URI); yt.save(path, job)
        sess = FakeSession([Response(308, headers={"Range": "bytes=0-4"}), Response(200, {"id": VIDEO}), self.verified()])
        self.upload(job, sess)
        self.assertTrue(sess.calls[1][2]["headers"]["Content-Range"].startswith("bytes 5-"))
        self.assertEqual(sess.calls[1][2]["data"], self.video.read_bytes()[5:])

    def test_finished_session_recovers_without_source_file(self):
        path, job = self.plan()
        job.update(phase="uploading", session_uri=URI); yt.save(path, job)
        self.video.unlink()
        sess = FakeSession([Response(200, {"id": VIDEO}), self.verified()])
        self.upload(job, sess)
        self.assertEqual(yt.read(path)["video_id"], VIDEO)
        self.assertEqual([m for m, _, _ in sess.calls], ["PUT", "GET"])

    def test_server_long_retry_delay_is_persisted_and_respected(self):
        path, job = self.plan()
        job.update(phase="uploading", session_uri=URI); yt.save(path, job)
        for code in (308, 503):
            with self.subTest(code=code):
                job.pop("retry_not_before", None); yt.save(path, job)
                sess = FakeSession([Response(code, headers={"Retry-After": "120"})])
                with self.assertRaisesRegex(yt.UploadError, "requested a pause"):
                    self.upload(job, sess)
                self.assertGreater(yt.read(path)["retry_not_before"], yt.time.time()+100)
                retry = FakeSession([])
                with self.assertRaisesRegex(yt.UploadError, "not elapsed"):
                    self.upload(job, retry)
                self.assertEqual(retry.calls, [])

    def test_session_credentials_never_printed_or_sent_elsewhere(self):
        with self.assertRaises(yt.UploadError):
            yt.session_url("https://attacker.invalid/upload/youtube/v3/videos")
        with self.assertRaises(yt.UploadError):
            yt.session_url("https://www.googleapis.com:444/upload/youtube/v3/videos")
        self.assertNotIn("session_uri", yt.safe_job({"id": "x", "session_uri": URI}))

    def test_processing_and_failed_states_are_not_success(self):
        path, job = self.plan()
        job.update(video_id=VIDEO)
        for processing, expected in (("processing", "processing"), ("failed", "needs_attention")):
            response = self.verified()
            response.data["items"][0]["status"]["uploadStatus"] = "uploaded"
            response.data["items"][0]["processingDetails"]["processingStatus"] = processing
            if processing == "failed":
                with self.assertRaises(yt.UploadError):
                    yt.verify(FakeSession([response]), job, path)
            else:
                yt.verify(FakeSession([response]), job, path)
            self.assertEqual(yt.read(path)["phase"], expected)

    def test_metadata_readback_mismatch_is_not_success(self):
        path, job = self.plan()
        job.update(video_id=VIDEO)
        response = self.verified()
        response.data["items"][0]["snippet"]["title"] = "Unexpected title"
        response.data["items"][0]["status"]["selfDeclaredMadeForKids"] = True
        with self.assertRaisesRegex(yt.UploadError, "title differs"):
            yt.verify(FakeSession([response]), job, path)
        self.assertEqual(yt.read(path)["phase"], "needs_attention")


if __name__ == "__main__":
    unittest.main()
