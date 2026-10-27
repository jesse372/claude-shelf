package com.madlad.taplist;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Launches the tap list when the Fire Stick finishes booting, so the TV comes on
 * showing the board without anyone reaching for the remote.
 *
 * Caveat worth knowing: Android 10+ restricts starting an activity from the
 * background, and Fire OS versions differ in how strictly they enforce it. On
 * older Fire Sticks this works; on newer ones it may be ignored, in which case
 * the app still has to be opened once from the home row. Nothing breaks either
 * way — a blocked launch just does nothing.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) return;

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || "android.intent.action.LOCKED_BOOT_COMPLETED".equals(action)) {

            Intent launch = new Intent(context, MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                context.startActivity(launch);
            } catch (Exception ignored) {
                // Background-launch restrictions on newer Fire OS. Harmless.
            }
        }
    }
}
