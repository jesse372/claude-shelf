package com.madlad.taplist;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Hands the downloaded APK to Android's package installer.
 *
 * Android 7+ forbids passing file:// URIs between apps, so the installer needs a
 * content:// URI. That normally means AndroidX's FileProvider — this is a minimal
 * stand-in so the build stays dependency-free (no Gradle, no AndroidX).
 */
public class ApkProvider extends ContentProvider {

    public static final String AUTHORITY = "com.madlad.taplist.apk";
    public static final String FILENAME = "update.apk";

    public static File file(android.content.Context ctx) {
        return new File(ctx.getCacheDir(), FILENAME);
    }

    public static Uri uri() {
        return Uri.parse("content://" + AUTHORITY + "/" + FILENAME);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = file(getContext());
        if (!f.exists()) throw new FileNotFoundException("no update staged");
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String sel, String[] args, String sort) {
        File f = file(getContext());
        MatrixCursor c = new MatrixCursor(
                new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        c.addRow(new Object[]{FILENAME, f.length()});
        return c;
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String sel, String[] args) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String sel, String[] args) { return 0; }
}
