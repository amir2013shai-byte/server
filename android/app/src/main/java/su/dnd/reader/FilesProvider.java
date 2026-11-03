package su.dnd.reader;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Minimal file provider used to share exported library files (no AndroidX on purpose).
 * Only files from the app cache exports folder are served.
 */
public class FilesProvider extends ContentProvider {

    public static final String AUTHORITY = "su.dnd.reader.files";
    private static final String PREFIX = "export";

    public FilesProvider() {
    }

    public static Uri uriFor(File file) {
        return Uri.parse("content://" + AUTHORITY + "/" + PREFIX + "/" + file.getName());
    }

    private File fileOf(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null || name.contains("/") || name.contains("..")) return null;
        Context context = getContext();
        if (context == null) return null;
        File dir = Export.dir(context);
        File file = new File(dir, name);
        // never serve anything outside the exports folder
        try {
            if (!file.getCanonicalPath().startsWith(dir.getCanonicalPath())) return null;
        } catch (Exception e) {
            return null;
        }
        return file;
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File file = fileOf(uri);
        if (file == null || !file.isFile()) return null;
        String[] columns = projection != null ? projection
                : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor cursor = new MatrixCursor(columns, 1);
        Object[] values = new Object[columns.length];
        for (int i = 0; i < columns.length; i++) {
            if (OpenableColumns.SIZE.equals(columns[i])) values[i] = file.length();
            else values[i] = file.getName();
        }
        cursor.addRow(values);
        return cursor;
    }

    @Override
    public String getType(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null) return "application/octet-stream";
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".zip")) return "application/zip";
        return "application/octet-stream";
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = fileOf(uri);
        if (file == null || !file.isFile()) throw new FileNotFoundException(String.valueOf(uri));
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
