# Connect YouTube once

No passwords or browser cookies are copied into this tool. Use a Google OAuth Desktop app
client, then grant the upload and read permissions on Google's own consent page.

1. Open [Google Cloud credentials](https://console.cloud.google.com/apis/credentials).
   Choose/create a project and enable **YouTube Data API v3** in the API Library.
2. Configure Google Auth Platform consent branding and audience. For an external app in
   Testing, add your Google account as a test user. External Testing refresh tokens normally
   expire after seven days. Use In production for a durable personal setup when appropriate;
   do not represent an unverified personal tool as Google-verified. Internal Workspace apps
   have organization-specific access limits; choose the audience that includes the channel owner.
3. Create an OAuth client of type **Desktop app**, download its JSON, and install it locally:

   ```bash
   youtube.sh install-client '/path/to/downloaded-client.json'
   youtube.sh auth --channel-id YOUR_CHANNEL_ID
   ```

   Find the channel ID in the `studio.youtube.com/channel/UC…` address. The tool opens Google's
   consent in the Mac's default browser and listens on `127.0.0.1:8766` for up to five minutes.
   Choose the exact YouTube channel, including the correct Brand Account if offered.
   Complete sign-in and consent yourself. Wrong-channel consent is rejected without saving it.
   For a remote Mac, use a local browser on that Mac or arrange loopback forwarding; do not
   paste authorization codes or token URLs into conversation. No OOB flow is implemented.
4. `youtube.sh health --live` must return `state: OK` and the expected channel. This verifies
   refresh and read access. Full upload verification requires a user-requested real video;
   never post a test video merely to finish setup.

`uv` installs binary Python dependencies on first live use. This machine also has an isolated
runtime at `/Volumes/LaCie/VideoEdits/cache/youtube-runtime`, which the wrapper prefers.
`YOUTUBE_PYTHON` can select another prepared interpreter. No automatic source builds run.
The wrapper places caches, Python downloads and temporary installation files on `/Volumes/LaCie`.
Without that drive it requires explicitly configured external `UV_CACHE_DIR`,
`UV_PYTHON_INSTALL_DIR` and `TMPDIR` locations instead of filling the internal disk.
The small credential/config/job files stay in `~/.youtube-upload/` (outside the repository).
The optional `YOUTUBE_HOME` environment variable relocates all of these small files.

## Current known limitations

- Channel features and Google project policy may limit thumbnails, uploads or public visibility.
  The API response and read-back decide the actual result. Current Google insertion docs and
  older Help/revision-history text conflict on unverified-project private-only restrictions.
- Refresh access can be revoked by the user, Google or organization policy. A six-hour health
  monitor can detect failure; it cannot grant new consent. Reconnect if needed.
- Source video must remain unchanged during upload. Avoid a file still being rendered.
- Only one upload operation runs at once. Hashing scans the source before transfer, but stores
  no media copy. Large uploads can take time; progress is printed to stderr.
- Uploads are on demand. There is no recurring publishing automation.

Official references:
- [Desktop OAuth with PKCE and loopback redirects](https://developers.google.com/identity/protocols/oauth2/native-app)
- [OAuth refresh-token expiry](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Video insertion](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert)
- [Resumable upload protocol](https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol)
- [Video status and scheduling](https://developers.google.com/youtube/data/reference/rest/v3/videos#status)
- [Thumbnail upload](https://developers.google.com/youtube/data/reference/rest/v3/thumbnails/set)
