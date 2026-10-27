package com.madlad.taplist;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Full-screen kiosk shell around the live tap list.
 *
 * The board itself stays on GitHub Pages, so publishing an edit updates this app
 * with no rebuild and no reinstall. The app only supplies the things a browser
 * can't: a home-screen icon, no address bar, and a real KEEP_SCREEN_ON flag.
 */
public class MainActivity extends Activity {

    private static final String URL = "https://jesse372.github.io/beer-tap-list/?app=1";
    private static final int RETRY_MS = 10000;

    private WebView web;
    private final Handler handler = new Handler();
    private boolean loadFailed = false;
    private boolean retryQueued = false;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        // The proper OS-level way to stop the screen sleeping.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0e0c0a"));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        // The board autoplays a silent clip as a belt-and-braces wake helper.
        s.setMediaPlaybackRequiresUserGesture(false);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView v, int code, String desc, String failingUrl) {
                // Usually just means the WiFi isn't up yet after a cold boot.
                loadFailed = true;
                scheduleRetry();
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                loadFailed = false;
            }
        });

        setContentView(web);
        web.loadUrl(URL);
        hideSystemUi();

        // Check for a new build shortly after startup, once the board is up.
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                new Updater(MainActivity.this).checkInBackground();
            }
        }, 8000);
    }

    /** Keep retrying until the network shows up, rather than sitting on an error page. */
    private void scheduleRetry() {
        if (retryQueued) return;
        retryQueued = true;
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                retryQueued = false;
                if (loadFailed) {
                    web.loadUrl(URL);
                    scheduleRetry();
                }
            }
        }, RETRY_MS);
    }

    private void hideSystemUi() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Back leaves the app instead of walking WebView history.
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finish();
            return true;
        }
        // Menu / OK forces a refresh, handy if someone wants it instantly.
        if (keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
            web.loadUrl(URL);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
