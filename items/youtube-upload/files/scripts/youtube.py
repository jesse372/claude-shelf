#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["google-auth>=2.35,<3", "google-auth-oauthlib>=1.2,<2", "requests>=2.32,<3"]
# ///
"""On-demand YouTube uploads. Credentials and jobs stay outside this source tree."""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

BASE_ROOT = Path(os.environ.get("YOUTUBE_HOME", Path.home() / ".youtube-upload"))
ROOT = BASE_ROOT
SCOPES = ["https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.readonly"]
API = "https://www.googleapis.com/youtube/v3/"
UPLOAD = "https://www.googleapis.com/upload/youtube/v3/"
CHUNK = 8 * 1024 * 1024
RETRY = {429, 500, 502, 503, 504}


class UploadError(Exception):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def output(data):
    print(json.dumps(data, indent=2, ensure_ascii=False))


def read(path):
    return json.loads(path.read_text())


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temp = tempfile.mkstemp(prefix=".write-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as handle:
            json.dump(data, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


@contextlib.contextmanager
def lock(name):
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(ROOT / (name + ".lock"), os.O_CREAT | os.O_RDWR, 0o600)
    with os.fdopen(fd, "w") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise UploadError("Another operation is running; retry when it finishes.")
        yield


def file_info(value, thumbnail=False):
    path = Path(value).expanduser().resolve(strict=True)
    if not path.is_file():
        raise UploadError("Input must be a regular file.")
    before = path.stat()
    limit = 50 * 1024**2 if thumbnail else 256 * 1024**3
    if not 0 < before.st_size <= limit:
        raise UploadError("File is empty or exceeds YouTube's upload size limit.")
    mime = mimetypes.guess_type(path.name)[0]
    if thumbnail and mime not in {"image/jpeg", "image/png"}:
        raise UploadError("Thumbnail must be a JPEG or PNG.")
    if not thumbnail and not (mime and mime.startswith("video/")):
        raise UploadError("Use a recognized video file extension (for example .mp4 or .mov).")
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(CHUNK), b""):
            digest.update(block)
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise UploadError("File changed while being checked. Wait for its render to finish.")
    return {"path": str(path), "size": before.st_size, "sha256": digest.hexdigest(),
            "mime": mime, "mtime_ns": before.st_mtime_ns}


def schedule_time(value):
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None or dt <= datetime.now(timezone.utc):
            raise ValueError()
    except ValueError:
        raise UploadError("Publish time must be in the future with a timezone, e.g. 2030-01-02T18:00:00+08:00.")
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def metadata(args):
    title = args.title.strip()
    desc = Path(args.description_file).expanduser().read_text() if args.description_file else args.description
    if not title or len(title) > 100 or any(c in title for c in "<>"):
        raise UploadError("Title must have 1–100 characters and no angle brackets.")
    if len(desc.encode("utf-8")) > 5000 or any(c in desc for c in "<>"):
        raise UploadError("Description must fit 5000 UTF-8 bytes and contain no angle brackets.")
    tags = args.tag or []
    if any(not t.strip() for t in tags) or sum(len(t) + (2 if " " in t else 0) for t in tags) + max(0, len(tags)-1) > 500:
        raise UploadError("Tags are empty or exceed YouTube's 500-character combined limit.")
    status = {"privacyStatus": args.privacy, "selfDeclaredMadeForKids": args.made_for_kids == "yes"}
    if args.synthetic_media:
        status["containsSyntheticMedia"] = args.synthetic_media == "yes"
    if args.publish_at:
        if args.privacy != "private":
            raise UploadError("Scheduled uploads must start private.")
        status["publishAt"] = schedule_time(args.publish_at)
    return {"snippet": {"title": title, "description": desc,
                        "categoryId": args.category, "tags": tags}, "status": status}


def job_path(job_id):
    if not re.fullmatch(r"[0-9a-f]{24}", job_id):
        raise UploadError("Invalid job ID.")
    return ROOT / "jobs" / (job_id + ".json")


def safe_job(job):
    # Resumable session URLs are bearer credentials; never print them.
    return {k: v for k, v in job.items() if k != "session_uri"}


def plan(args):
    media = file_info(args.file)
    thumb = file_info(args.thumbnail, True) if args.thumbnail else None
    body = metadata(args)
    if not re.fullmatch(r"UC[\w-]{22}", args.channel_id):
        raise UploadError("Supply the channel's UC… ID from YouTube Studio.")
    identity = {"sha256": media["sha256"], "channel_id": args.channel_id,
                "body": body, "thumbnail_sha256": thumb["sha256"] if thumb else None,
                "notify_subscribers": args.notify_subscribers == "yes"}
    job_id = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:24]
    path = job_path(job_id)
    with lock("uploads"):
        if path.exists():
            output(safe_job(read(path)))
            return
        job = {"id": job_id, "created_at": now(), "phase": "planned", "media": media,
               "thumbnail": thumb, "channel_id": args.channel_id, "body": body,
               "notify_subscribers": identity["notify_subscribers"]}
        save(path, job)
    output(safe_job(job))


def install_client(args):
    data = read(Path(args.file).expanduser())
    item = data.get("installed", {})
    if not item.get("client_id") or not item.get("client_secret"):
        raise UploadError("A Google Desktop app OAuth client JSON is required.")
    if item.get("auth_uri") != "https://accounts.google.com/o/oauth2/auth" or item.get("token_uri") != "https://oauth2.googleapis.com/token":
        raise UploadError("Unexpected OAuth endpoints. Download a fresh client JSON from Google Cloud.")
    save(ROOT / "oauth.client", data)
    output({"client_installed": True, "next": "youtube.sh auth --channel-id YOUR_CHANNEL_ID"})


def credentials(force_refresh=False):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    path = ROOT / "oauth.token"
    with lock("auth"):
        if not path.exists():
            raise UploadError("YouTube is not connected. Install a Desktop OAuth client, then run youtube.sh auth.")
        blob = read(path)
        if not set(SCOPES).issubset(set(blob.get("scopes", []))) or blob.get("token_uri") != "https://oauth2.googleapis.com/token":
            raise UploadError("Saved credentials do not have the required scopes/endpoints. Reconnect YouTube.")
        creds = Credentials.from_authorized_user_info(blob, SCOPES)
        if force_refresh or not creds.valid:
            if not creds.refresh_token:
                raise UploadError("No refresh token. Reconnect using youtube.sh auth.")
            try:
                creds.refresh(Request())
            except Exception:
                raise UploadError("Google could not refresh YouTube access. Check connectivity or reconnect with youtube.sh auth.") from None
            save(path, json.loads(creds.to_json()))
        return creds


def session(force_refresh=False):
    from google.auth.transport.requests import AuthorizedSession
    return AuthorizedSession(credentials(force_refresh))


def error_response(response):
    reason = ""
    try:
        err = response.json().get("error", {})
        reason = ", ".join(e.get("reason", "") for e in err.get("errors", []))
    except (ValueError, AttributeError):
        pass
    raise UploadError(f"YouTube request failed (HTTP {response.status_code}{': ' + reason if reason else ''}). No new upload will be started automatically.")


def request(sess, method, url, **kwargs):
    # No automatic mutation retries: the resumable caller queries acknowledged bytes.
    try:
        return sess.request(method, url, timeout=(15, 120), allow_redirects=False, **kwargs)
    except Exception:
        raise UploadError("Network request interrupted. Rerun the SAME job to inspect/resume it; do not create another upload.") from None


def channel(sess):
    response = request(sess, "GET", API + "channels", params={"part": "snippet", "mine": "true"})
    if response.status_code != 200:
        error_response(response)
    channels = response.json().get("items", [])
    if len(channels) != 1:
        raise UploadError("Google did not identify exactly one YouTube channel. Reconnect and choose the intended channel.")
    return {"id": channels[0]["id"], "title": channels[0]["snippet"]["title"]}


def auth(args):
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import AuthorizedSession
    client = ROOT / "oauth.client"
    if not client.exists() and ROOT != BASE_ROOT:
        client = BASE_ROOT / "oauth.client"
    if not client.exists():
        raise UploadError("Missing Desktop OAuth client. See references/setup.md.")
    with lock("auth"):
        flow = InstalledAppFlow.from_client_secrets_file(str(client), SCOPES, autogenerate_code_verifier=True)
        # Library handles state, PKCE and the loopback callback. Never print the login URL.
        creds = flow.run_local_server(host="127.0.0.1", port=args.port, open_browser=True,
            authorization_prompt_message="Finish Google consent in the browser on this Mac.",
            success_message="YouTube authorization received. You may close this tab.",
            timeout_seconds=300, access_type="offline", prompt="consent")
        if not creds.refresh_token or not creds.has_scopes(SCOPES):
            raise UploadError("Google did not grant persistent upload/read access; reconnect and grant both requested permissions.")
        actual = channel(AuthorizedSession(creds))
        if args.channel_id and actual["id"] != args.channel_id:
            raise UploadError(f"Google connected channel {actual['id']}, not {args.channel_id}. Credentials were not saved. Reconnect and choose the intended channel.")
        if args.channel_title and actual["title"] != args.channel_title:
            raise UploadError("Google connected a different channel title. Credentials were not saved. Reconnect and choose the intended channel.")
        save(ROOT / "oauth.token", json.loads(creds.to_json()))
        save(ROOT / "channel.json", {**actual, "connected_at": now()})
    output({"connected": True, "channel": actual})


def health(args):
    global ROOT
    if getattr(args, "all", False):
        original_root = ROOT
        roots = ([BASE_ROOT] if (BASE_ROOT / "channel.json").exists() else [])
        roots += sorted(p.parent for p in (BASE_ROOT / "profiles").glob("*/channel.json"))
        results = []
        try:
            for location in roots:
                ROOT = location
                result = {"profile": "default" if location == BASE_ROOT else location.name}
                try:
                    if not args.live:
                        data = read(ROOT / "oauth.token")
                        result.update(state="UNVERIFIED", has_refresh_token=bool(data.get("refresh_token")))
                    else:
                        actual = channel(session(force_refresh=True))
                        if actual["id"] != read(ROOT / "channel.json")["id"]:
                            raise UploadError("Channel binding differs.")
                        result.update(state="OK", channel=actual)
                except (UploadError, OSError, ValueError, KeyError):
                    result["state"] = "FAIL"
                results.append(result)
        finally:
            ROOT = original_root
        failed = any(r["state"] == "FAIL" for r in results)
        state = "NOT_CONNECTED" if not results else "FAIL" if failed else "OK" if args.live else "UNVERIFIED"
        output({"state": state, "profiles": results,
                "has_refresh_token": bool(results) and all(r.get("has_refresh_token", False) for r in results)})
        return 1 if failed else 2 if not results else 0
    if not (ROOT / "oauth.token").exists():
        output({"state": "NOT_CONNECTED", "client_installed": (ROOT / "oauth.client").exists()})
        return 2
    if not args.live:
        data = read(ROOT / "oauth.token")
        output({"state": "UNVERIFIED", "has_refresh_token": bool(data.get("refresh_token")),
                "expiry": data.get("expiry"), "detail": "Local metadata only; use --live to verify access."})
        return 0
    actual = channel(session(force_refresh=True))
    expected = read(ROOT / "channel.json")
    if actual["id"] != expected["id"]:
        raise UploadError("Connected channel differs from the saved channel binding.")
    output({"state": "OK", "channel": actual, "checked_at": now()})
    return 0


def session_url(value):
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.hostname != "www.googleapis.com" or parsed.username or parsed.password or parsed.port not in (None, 443) or not parsed.path.startswith("/upload/youtube/"):
        raise UploadError("Unexpected resumable upload endpoint. Refusing to send credentials or media.")
    return value


def offset(response, total):
    header = response.headers.get("Range", "")
    if not header:
        return 0
    match = re.fullmatch(r"bytes=0-(\d+)", header)
    if not match or not 0 <= int(match[1]) < total:
        raise UploadError("Unexpected acknowledged byte range; upload stopped.")
    return int(match[1]) + 1


def completed(job, response, path):
    value = response.json()
    video_id = value.get("id", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise UploadError("Upload response did not include a valid video ID. Resume this job to reconcile it.")
    job.update(video_id=video_id, url="https://youtu.be/" + video_id, phase="uploaded", uploaded_at=now())
    job.pop("session_uri", None)
    save(path, job)  # Durable ID before thumbnail or verification: never re-insert.


def backoff(response, failures, job, path):
    value = response.headers.get("Retry-After", "")
    seconds = min(30, 2**failures) if failures else 0
    if value:
        try:
            seconds = int(value) if value.isdigit() else max(0, (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds())
        except (ValueError, TypeError):
            pass
    if seconds > 30:
        job["retry_not_before"] = time.time() + seconds
        save(path, job)
        raise UploadError(f"Google requested a pause of {seconds:.0f} seconds. Retry the same job after that; its session is saved.")
    if seconds:
        time.sleep(seconds)


def transfer(sess, job, path, validated=False):
    total = job["media"]["size"]
    uri = session_url(job["session_uri"])
    failures = 0
    # Query before opening local media: a lost success response is recoverable even
    # after the original file has been moved. Only unfinished uploads need its bytes.
    with contextlib.ExitStack() as stack:
        media = None
        while True:
            response = request(sess, "PUT", uri, headers={"Content-Length": "0", "Content-Range": f"bytes */{total}"}, data=b"")
            if response.status_code in (200, 201):
                completed(job, response, path)
                return
            if response.status_code == 404:
                raise UploadError("Upload session expired. Check Studio for the video before planning any replacement; this job will not restart automatically.")
            if response.status_code in RETRY:
                failures += 1
                if failures > 5:
                    error_response(response)
                backoff(response, failures, job, path)
                continue
            if response.status_code != 308:
                error_response(response)
            start = offset(response, total)
            if start >= total:
                raise UploadError("All bytes received but final video ID is pending. Rerun this job to reconcile.")
            backoff(response, 0, job, path)
            if media is None:
                if not validated:
                    current = file_info(job["media"]["path"])
                    if (current["size"], current["sha256"]) != (total, job["media"]["sha256"]):
                        raise UploadError("Video changed since planning. Remaining bytes were not sent.")
                media = stack.enter_context(open(job["media"]["path"], "rb"))
            media.seek(start)
            block = media.read(min(CHUNK, total-start))
            if len(block) != min(CHUNK, total-start):
                raise UploadError("Video file changed during upload.")
            response = request(sess, "PUT", uri, data=block, headers={
                "Content-Type": job["media"]["mime"], "Content-Length": str(len(block)),
                "Content-Range": f"bytes {start}-{start+len(block)-1}/{total}"})
            if response.status_code in (200, 201):
                completed(job, response, path)
                return
            if response.status_code not in RETRY and response.status_code != 308:
                error_response(response)
            if response.status_code in RETRY:
                failures += 1
                if failures > 5:
                    error_response(response)
                backoff(response, failures, job, path)
            else:
                acknowledged = offset(response, total)
                if acknowledged <= start:
                    failures += 1
                    if failures > 5:
                        raise UploadError("Upload made no progress after five attempts. Retry the same job later.")
                else:
                    failures = 0
                print(f"Uploaded {acknowledged}/{total} bytes", file=sys.stderr)
                backoff(response, failures, job, path)


def verify(sess, job, path):
    response = request(sess, "GET", API + "videos", params={
        "part": "snippet,status,processingDetails", "id": job["video_id"]})
    if response.status_code != 200:
        error_response(response)
    items = response.json().get("items", [])
    if len(items) != 1:
        raise UploadError("Video ID saved, but read-back is not available yet. Retry status for this job.")
    video = items[0]
    actual = video.get("status", {})
    requested = job["body"]["status"]
    issues = []
    snippet = video["snippet"]
    if snippet.get("channelId") != job["channel_id"]:
        issues.append("channel mismatch")
    for key in ("title", "description", "categoryId"):
        if snippet.get(key) != job["body"]["snippet"].get(key):
            issues.append(f"{key} differs from the upload plan")
    if sorted(snippet.get("tags", [])) != sorted(job["body"]["snippet"].get("tags", [])):
        issues.append("tags differ from the upload plan")
    for key in ("selfDeclaredMadeForKids", "containsSyntheticMedia"):
        if key in requested and actual.get(key) != requested[key]:
            issues.append(f"{key} differs from the upload plan")
    expected_privacy = requested["privacyStatus"]
    if requested.get("publishAt") and datetime.fromisoformat(requested["publishAt"].replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        expected_privacy = "public"
    if actual.get("privacyStatus") != expected_privacy:
        issues.append("requested visibility was not applied (Google project/account restrictions may apply)")
    if requested.get("publishAt") and expected_privacy == "private":
        returned_time = actual.get("publishAt", "")
        if not returned_time or datetime.fromisoformat(returned_time.replace("Z", "+00:00")) != datetime.fromisoformat(requested["publishAt"].replace("Z", "+00:00")):
            issues.append("scheduled publication time differs")
    processing = video.get("processingDetails", {})
    if actual.get("uploadStatus") in {"failed", "rejected", "deleted"} or processing.get("processingStatus") in {"failed", "terminated"}:
        issues.append("YouTube processing failed/rejected/deleted the upload")
    job["verification"] = {"checked_at": now(), "status": actual,
                           "processing": processing, "issues": issues}
    ready = actual.get("uploadStatus") == "processed" or processing.get("processingStatus") == "succeeded"
    job["phase"] = "needs_attention" if issues else ("verified" if ready else "processing")
    save(path, job)
    if issues:
        output(safe_job(job))
        raise UploadError("Video already exists; " + "; ".join(issues) + ". Do not re-upload.")


def upload(args):
    path = job_path(args.job)
    with lock("uploads"):
        job = read(path)
        if not args.confirm:
            output(safe_job(job))
            raise UploadError("Preview only. --confirm requires the user's upload request for this file/channel/visibility.")
        if job.get("retry_not_before", 0) > time.time():
            raise UploadError("Google's retry delay has not elapsed. Retry this job later.")
        sess = session()
        actual = channel(sess)
        if actual["id"] != job["channel_id"]:
            raise UploadError("Connected channel differs from the upload plan. Nothing was uploaded.")
        if not job.get("video_id"):
            validated = False
            for other_path in (ROOT / "jobs").glob("*.json"):
                other = read(other_path)
                if other["id"] != job["id"] and other.get("channel_id") == job["channel_id"] and other.get("media", {}).get("sha256") == job["media"]["sha256"] and other.get("phase") != "planned":
                    raise UploadError(f"Same video already attempted in job {other['id']}. Reconcile that job before any duplicate upload.")
            if not job.get("session_uri"):
                if job["phase"] != "planned":
                    raise UploadError("Previous initiation outcome is uncertain. Check Studio; automatic restart is blocked.")
                current = file_info(job["media"]["path"])
                if (current["size"], current["sha256"]) != (job["media"]["size"], job["media"]["sha256"]):
                    raise UploadError("Video changed since planning. Create and review a new plan.")
                validated = True
                if job["thumbnail"]:
                    thumb = file_info(job["thumbnail"]["path"], True)
                    if thumb["sha256"] != job["thumbnail"]["sha256"]:
                        raise UploadError("Thumbnail changed since planning.")
                if job["body"]["status"].get("publishAt"):
                    schedule_time(job["body"]["status"]["publishAt"])
                job["phase"] = "initiating"
                save(path, job)
                response = request(sess, "POST", UPLOAD + "videos", params={
                    "uploadType": "resumable", "part": "snippet,status",
                    "notifySubscribers": str(job["notify_subscribers"]).lower()},
                    json=job["body"], headers={"X-Upload-Content-Length": str(current["size"]),
                                             "X-Upload-Content-Type": current["mime"]})
                if response.status_code not in (200, 201):
                    # A definite client rejection did not create a video; same plan can retry.
                    if 400 <= response.status_code < 500:
                        job["phase"] = "planned"
                        save(path, job)
                    error_response(response)
                job["session_uri"] = session_url(response.headers.get("Location", ""))
                job["phase"] = "uploading"
                save(path, job)
            transfer(sess, job, path, validated=validated)
        if job["thumbnail"] and not job.get("thumbnail_done"):
            thumb = file_info(job["thumbnail"]["path"], True)
            if thumb["sha256"] != job["thumbnail"]["sha256"]:
                raise UploadError("Video uploaded, but thumbnail changed. Do not re-upload the video.")
            with open(thumb["path"], "rb") as handle:
                response = request(sess, "POST", UPLOAD + "thumbnails/set",
                    params={"videoId": job["video_id"], "uploadType": "media"},
                    headers={"Content-Type": thumb["mime"]}, data=handle)
            if response.status_code != 200:
                error_response(response)
            job["thumbnail_done"] = True
            save(path, job)
        verify(sess, job, path)
        output(safe_job(job))


def status(args):
    path = job_path(args.job)
    with lock("uploads"):
        job = read(path)
        if args.live:
            if not job.get("video_id"):
                raise UploadError("No completed video ID yet. Use the SAME upload job to resume.")
            verify(session(), job, path)
        output(safe_job(job))


def main():
    global ROOT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", help="Separate channel connection, for example family or fishing")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("install-client"); p.add_argument("file"); p.set_defaults(func=install_client)
    p = sub.add_parser("auth")
    channel_group = p.add_mutually_exclusive_group(required=True)
    channel_group.add_argument("--channel-id"); channel_group.add_argument("--channel-title")
    p.add_argument("--port", type=int, default=8766); p.set_defaults(func=auth)
    p = sub.add_parser("health"); p.add_argument("--live", action="store_true"); p.add_argument("--all", action="store_true"); p.set_defaults(func=health)
    p = sub.add_parser("whoami"); p.set_defaults(func=lambda a: output(channel(session())))
    p = sub.add_parser("plan"); p.add_argument("file"); p.add_argument("--channel-id", required=True)
    p.add_argument("--title", required=True); p.add_argument("--description", default=""); p.add_argument("--description-file")
    p.add_argument("--privacy", choices=["private", "unlisted", "public"], default="private")
    p.add_argument("--made-for-kids", required=True, choices=["yes", "no"])
    p.add_argument("--synthetic-media", choices=["yes", "no"]); p.add_argument("--publish-at")
    p.add_argument("--thumbnail"); p.add_argument("--category", default="22"); p.add_argument("--tag", action="append")
    p.add_argument("--notify-subscribers", choices=["yes", "no"], default="no"); p.set_defaults(func=plan)
    p = sub.add_parser("upload"); p.add_argument("job"); p.add_argument("--confirm", action="store_true"); p.set_defaults(func=upload)
    p = sub.add_parser("status"); p.add_argument("job"); p.add_argument("--live", action="store_true"); p.set_defaults(func=status)
    args = parser.parse_args()
    if args.profile:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", args.profile):
            parser.error("Profile must use lowercase letters, numbers and hyphens (max 64 characters).")
        ROOT = BASE_ROOT / "profiles" / args.profile
    try:
        return args.func(args) or 0
    except UploadError as exc:
        print("youtube: " + str(exc), file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError):
        print("youtube: Cannot read the required file/state. Check paths and permissions; raw credentials are never printed.", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("youtube: Interrupted. Resume the same job; do not create a duplicate.", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"youtube: {type(exc).__name__}; operation stopped. No automatic new upload. Check setup or retry the same job.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
