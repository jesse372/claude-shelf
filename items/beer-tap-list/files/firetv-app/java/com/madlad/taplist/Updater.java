package com.madlad.taplist;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Checks for a newer build and offers to install it.
 *
 * Android never allows a sideloaded app to install silently, so the most we can
 * do is fetch it in the background and reduce the update to a single press.
 *
 * Everything here fails silently: a broken or unreachable update must never stop
 * the tap list from showing.
 */
class Updater {

    private static final String VERSION_URL =
            "https://jesse372.github.io/beer-tap-list/version.json";
    private static final int CONNECT_TIMEOUT = 12000;
    private static final int READ_TIMEOUT = 60000;
    /** Auto-dismiss, so an unattended TV isn't left sitting behind a dialog. */
    private static final int PROMPT_TIMEOUT_MS = 60000;

    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());

    Updater(Activity activity) {
        this.activity = activity;
    }

    void checkInBackground() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    check();
                } catch (Throwable ignored) {
                    // Never let updating break the board.
                }
            }
        }, "ontap-updater").start();
    }

    private int currentVersionCode() {
        try {
            PackageInfo pi = activity.getPackageManager()
                    .getPackageInfo(activity.getPackageName(), 0);
            return pi.versionCode;
        } catch (Throwable t) {
            return Integer.MAX_VALUE;   // unknown -> never prompt
        }
    }

    private void check() throws Exception {
        String body = fetch(VERSION_URL + "?t=" + System.currentTimeMillis());
        if (body == null) return;

        JSONObject j = new JSONObject(body);
        final int latest = j.optInt("versionCode", 0);
        final String name = j.optString("versionName", "");
        String apkUrl = j.optString("url", "");

        if (latest <= currentVersionCode() || apkUrl.length() == 0) return;

        File out = ApkProvider.file(activity);
        if (!download(apkUrl, out)) return;

        main.post(new Runnable() {
            @Override
            public void run() {
                prompt(name);
            }
        });
    }

    private String fetch(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(CONNECT_TIMEOUT);
        c.setReadTimeout(READ_TIMEOUT);
        c.setInstanceFollowRedirects(true);
        try {
            if (c.getResponseCode() != 200) return null;
            InputStream in = c.getInputStream();
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            in.close();
            return bos.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    private boolean download(String url, File out) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url + "?t=" + System.currentTimeMillis()).openConnection();
            c.setConnectTimeout(CONNECT_TIMEOUT);
            c.setReadTimeout(READ_TIMEOUT);
            c.setInstanceFollowRedirects(true);
            if (c.getResponseCode() != 200) return false;

            File tmp = new File(out.getParentFile(), out.getName() + ".part");
            InputStream in = c.getInputStream();
            FileOutputStream fos = new FileOutputStream(tmp);
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) fos.write(buf, 0, n);
            fos.flush();
            fos.close();
            in.close();

            if (tmp.length() < 1000) { tmp.delete(); return false; }   // clearly not an APK
            if (out.exists()) out.delete();
            return tmp.renameTo(out);
        } catch (Throwable t) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private void prompt(String versionName) {
        if (activity.isFinishing()) return;

        String msg = "A new version of On Tap"
                + (versionName.length() > 0 ? " (" + versionName + ")" : "")
                + " is ready to install.";

        final AlertDialog dlg = new AlertDialog.Builder(activity)
                .setTitle("Update available")
                .setMessage(msg)
                .setPositiveButton("Update now", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) { install(); }
                })
                .setNegativeButton("Not now", null)
                .setCancelable(true)
                .create();

        dlg.show();

        // Don't leave a TV stuck behind a dialog nobody is there to answer.
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                try { if (dlg.isShowing()) dlg.dismiss(); } catch (Throwable ignored) {}
            }
        }, PROMPT_TIMEOUT_MS);
    }

    private void install() {
        try {
            // Android 8+ requires per-app permission to install packages.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !activity.getPackageManager().canRequestPackageInstalls()) {
                new AlertDialog.Builder(activity)
                        .setTitle("One-off permission")
                        .setMessage("Fire TV needs permission to let On Tap install its own "
                                + "updates. Turn On Tap ON on the next screen, then press "
                                + "Update again.")
                        .setPositiveButton("Open settings", new DialogInterface.OnClickListener() {
                            @Override public void onClick(DialogInterface d, int w) {
                                try {
                                    Intent s = new Intent(
                                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                            Uri.parse("package:" + activity.getPackageName()));
                                    s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                    activity.startActivity(s);
                                } catch (Throwable ignored) {}
                            }
                        })
                        .setNegativeButton("Cancel", null)
                        .show();
                return;
            }

            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(ApkProvider.uri(), "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
        } catch (Throwable ignored) {
            // Nothing sensible to do — the board keeps running.
        }
    }
}
