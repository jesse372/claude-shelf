# Wedding Jobs Bot — setup (≈5 min, easiest on a computer browser)

1. Go to https://script.google.com signed in as you@example.com → **New project**.
   Name it "Wedding Jobs Bot".
2. Delete the sample code, paste in all of `Code.gs`.
3. Fill in `CONFIG.PACKAGES` (price + photographer/videographer hours per package).
   You can skip this and fill the sheet in by hand per job, but the pay maths will be partial.
4. Top toolbar: choose the function **setup** → **Run** → approve the permissions
   ("Google hasn't verified this app" → Advanced → Go to Wedding Jobs Bot). It's your own script.
5. You'll get an email "✅ Wedding Jobs Bot is running" with the sheet link.

What it then does by itself:
- Every 10 min: new Studio Ninja booking on your calendar → row in the sheet + email with a
  one-tap "Send to team WhatsApp" link.
- Studio Ninja payment email → row in Payments + email "move $X to team account".
- 8am daily: reminder if any team money isn't ticked "Moved?"; warns if the bot has stalled.

Tests for the parsing/money logic: `node test.js`
