# Thumbnail preparation

Read the selected channel's `thumbnail_style` in the private routing file. If the user has
delegated thumbnails, make the creative choices without asking them to design it. Resolve
the final video first; inspect representative frames and the important moment or outcome.
Choose a sharp, expressive frame that accurately represents this video.

Use the available image-generation/editing tool for a designed thumbnail, preserving the
identity and appearance of people from reference frames. In Codex, use the built-in imagegen
skill/tool. Claude should use an actually available image tool; if none exists, prepare the
selected frames and a precise design brief for Codex and explain that the image is still
pending. Do not silently buy credits or introduce a paid API fallback.

Aim for one strong focal point, clear contrast at phone size, and a short headline (typically
two to five words) that adds something to the title. Keep text away from faces and the bottom
right duration badge. Preserve real people, catches and events: do not invent a huge fish,
danger, a reaction, or a story outcome absent from the footage. Let the video's own mood
decide whether text or extra graphics improve it.

For standard videos request a 16:9 landscape image and deliver JPEG or PNG; request 3840×2160
when the image tool supports it without sacrificing quality. The current API accepts thumbnails
up to 50 MB; an optional copy under 2 MB also works with mobile uploads. For Shorts, check the
current feature/API support before promising a custom thumbnail; the Studio guidance uses 9:16.
See [YouTube's current thumbnail guidance](https://support.google.com/youtube/answer/72431).
Save reference frames, the final
thumbnail and the design prompt beside the video's project on the external media drive.
Use a versioned filename. Inspect the finished image at full size and phone size for legibility,
spelling, faces, hands and any misleading additions before using it in the plan.

Pass the final file with `plan --thumbnail '/path/to/thumbnail.jpg'`. After transfer, the
uploader records the video ID before setting the thumbnail, so thumbnail failures can be
retried with the **same job** without posting another video. If the channel cannot accept
custom thumbnails, report that partial result; never claim the custom thumbnail was applied.

Creating a thumbnail does not authorize publishing the video. Follow the upload authorization
in the main skill. A future explicit upload request can authorize the whole package when
the destination, visibility and intended video are clear.
