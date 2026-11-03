package su.dnd.reader;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;

import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/** Dialog that exports the offline library as a single HTML file or a ZIP archive. */
public final class ExportUi {

    public static final int REQ_SAVE_FILE = 4401;
    private static File pendingFile;

    private ExportUi() {
    }

    public static void show(final Activity activity) {
        if (Archive.count(activity) == 0) {
            Ui.toast(activity, "Библиотека пуста — сначала сохраните страницы");
            return;
        }
        String[] items = {
                "Поделиться одним HTML-файлом",
                "Сохранить HTML-файл…",
                "Поделиться ZIP-архивом",
                "Сохранить ZIP-архив…"
        };
        new AlertDialog.Builder(activity, Prefs.isDark(activity)
                ? android.R.style.Theme_Material_Dialog_Alert
                : android.R.style.Theme_Material_Light_Dialog_Alert)
                .setTitle("Экспорт офлайн-библиотеки")
                .setItems(items, (d, which) -> {
                    final boolean zip = which >= 2;
                    final boolean share = which == 0 || which == 2;
                    build(activity, zip, share);
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private static void build(final Activity activity, final boolean zip, final boolean share) {
        final AlertDialog progress = Ui.progressDialog(activity, "Экспорт",
                "Собираем страницы…", true, null);
        progress.show();
        final Handler handler = new Handler(Looper.getMainLooper());
        final ViewGroup host = activity.findViewById(android.R.id.content);
        new Thread(() -> {
            File result = null;
            String error = null;
            try {
                List<Archive.Page> pages = new ArrayList<>(Archive.pages(activity));
                result = zip ? Export.zip(activity, pages) : Export.mergedHtml(activity, pages);
            } catch (Exception e) {
                error = e.getClass().getSimpleName();
            }
            final File file = result;
            final String message = error;
            handler.post(() -> {
                if (progress.isShowing()) progress.dismiss();
                if (file == null) {
                    Ui.toast(activity, "Не удалось создать файл" + (message == null ? "" : " (" + message + ")"));
                    return;
                }
                if (share) share(activity, file);
                else save(activity, file);
            });
        }, "library-export").start();
    }

    private static void share(Activity activity, File file) {
        try {
            Uri uri = FilesProvider.uriFor(file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(file.getName().endsWith(".zip") ? "application/zip" : "text/html");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, "Офлайн-библиотека D&D.su");
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(Intent.createChooser(send, "Отправить файл"));
        } catch (Exception e) {
            Ui.toast(activity, "Не удалось поделиться файлом");
        }
    }

    private static void save(Activity activity, File file) {
        try {
            pendingFile = file;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(file.getName().endsWith(".zip") ? "application/zip" : "text/html");
            intent.putExtra(Intent.EXTRA_TITLE, file.getName());
            activity.startActivityForResult(intent, REQ_SAVE_FILE);
        } catch (Exception e) {
            Ui.toast(activity, "На этом устройстве нет выбора файла");
        }
    }

    /** Copies the exported file into the location the user picked. */
    public static void handleResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_SAVE_FILE) return;
        File file = pendingFile;
        pendingFile = null;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null || file == null) return;
        Uri target = data.getData();
        try (InputStream in = new java.io.FileInputStream(file);
             OutputStream out = activity.getContentResolver().openOutputStream(target)) {
            if (out == null) throw new java.io.IOException("no stream");
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            out.flush();
            Ui.toast(activity, "Файл сохранён: " + file.getName());
        } catch (Exception e) {
            Ui.toast(activity, "Не удалось сохранить файл");
        }
    }
}
