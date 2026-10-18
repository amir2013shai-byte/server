package su.dnd.reader;

import android.app.Activity;
import android.app.AlertDialog;
import android.view.WindowManager;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;

/** Dialog that lets the user pick a section and start downloading it for offline reading. */
public final class SyncUi {

    private static Downloader active;

    private SyncUi() {
    }

    /** Cancels a running download (used when the activity is destroyed). */
    public static void destroyActive() {
        if (active != null) {
            active.destroy();
            active = null;
        }
    }

    public interface Done {
        void onDone(boolean saved);
    }

    /** True while a section download or a single page save is running. */
    public static boolean isRunning() {
        return active != null;
    }

    /** Saves one page (e.g. a Yandex search result) into the offline archive. */
    public static void downloadPage(final Activity activity, final ViewGroup host,
                                    final String url, final Done done) {
        if (active != null) {
            Ui.toast(activity, "Дождитесь окончания скачивания раздела");
            return;
        }
        final AlertDialog progress = Ui.progressDialog(activity, "Сохранение страницы",
                "Открываем страницу…", true, null);
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        final Downloader downloader = new Downloader(activity, host);
        active = downloader;
        progress.show();
        progress.setOnCancelListener(d -> downloader.cancel());
        progress.setOnShowListener(d -> {
            android.widget.Button cancel = progress.getButton(AlertDialog.BUTTON_NEGATIVE);
            if (cancel != null) cancel.setOnClickListener(v -> {
                downloader.cancel();
                progress.dismiss();
            });
        });
        downloader.startSingle(url, new Downloader.Listener() {
            @Override
            public void onProgress(int done, int total, String message) {
                if (progress.isShowing()) Ui.setProgressMessage(progress, message);
            }

            @Override
            public void onFinished(int saved, int failed, String error) {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if (active == downloader) active = null;
                if (progress.isShowing()) progress.dismiss();
                String text;
                if (saved > 0) {
                    text = "Сохранено в офлайн-библиотеку";
                } else if (error != null) {
                    text = error;
                } else {
                    text = "Страница не сохранилась";
                }
                Ui.toast(activity, text);
                if (done != null) done.onDone(saved > 0);
            }
        });
    }

    public static void show(final Activity activity, final ViewGroup host, final Runnable onDone) {
        final int pad = Ui.dp(activity, 20);
        final LinearLayout box = Ui.vertical(activity);
        box.setPadding(pad, Ui.dp(activity, 4), pad, 0);

        TextView label = Ui.text(activity, "Раздел", 12, true);
        label.setTextColor(Ui.color(activity, R.attr.dndTextDim));
        box.addView(label);

        final RadioGroup groups = new RadioGroup(activity);
        groups.setOrientation(RadioGroup.VERTICAL);
        int checkedId = -1;
        for (int i = 0; i < Categories.DOWNLOADABLE.length; i++) {
            Categories.Cat c = Categories.DOWNLOADABLE[i];
            RadioButton rb = new RadioButton(activity);
            rb.setId(1000 + i);
            rb.setText(c.title);
            rb.setTextSize(14);
            rb.setTextColor(Ui.color(activity, R.attr.dndText));
            rb.setTag(c);
            groups.addView(rb);
            if (checkedId == -1 && c == Categories.SPELLS) checkedId = rb.getId();
        }
        if (checkedId != -1) groups.check(checkedId);
        box.addView(groups);

        TextView limitLabel = Ui.text(activity, "Сколько страниц скачать", 12, true);
        limitLabel.setTextColor(Ui.color(activity, R.attr.dndTextDim));
        LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        llp.topMargin = Ui.dp(activity, 14);
        limitLabel.setLayoutParams(llp);
        box.addView(limitLabel);

        final int[] limits = {10, 20, 30, 50, 100};
        final int[] selectedLimit = {Prefs.syncLimit(activity)};
        LinearLayout limitRow = Ui.horizontal(activity);
        limitRow.setPadding(0, Ui.dp(activity, 6), 0, 0);
        for (int value : limits) {
            final int v = value;
            final TextView chip = new TextView(activity);
            chip.setText(String.valueOf(value));
            chip.setTextSize(14);
            chip.setGravity(Gravity.CENTER);
            chip.setPadding(Ui.dp(activity, 14), Ui.dp(activity, 8), Ui.dp(activity, 14), Ui.dp(activity, 8));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.rightMargin = Ui.dp(activity, 8);
            chip.setLayoutParams(lp);
            chip.setBackgroundResource(R.drawable.bg_chip);
            chip.setOnClickListener(view -> {
                selectedLimit[0] = v;
                for (int k = 0; k < limitRow.getChildCount(); k++) {
                    TextView child = (TextView) limitRow.getChildAt(k);
                    boolean on = String.valueOf(v).contentEquals(child.getText());
                    child.setTextColor(Ui.color(activity, on ? R.attr.dndBrand : R.attr.dndText));
                    child.setTypeface(null, on ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
                }
            });
            limitRow.addView(chip);
        }
        box.addView(limitRow);
        // trigger the initial selection style
        limitRow.post(() -> {
            if (limitRow.getChildCount() > 0) {
                int best = 0;
                for (int i = 0; i < limits.length; i++) if (limits[i] == selectedLimit[0]) best = i;
                limitRow.getChildAt(best).performClick();
            }
        });

        final CheckBox details = new CheckBox(activity);
        details.setText("Скачивать сами страницы раздела");
        details.setTextSize(13);
        details.setTextColor(Ui.color(activity, R.attr.dndText));
        details.setChecked(Prefs.syncDetails(activity));
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dlp.topMargin = Ui.dp(activity, 12);
        details.setLayoutParams(dlp);
        box.addView(details);

        TextView hint = Ui.secondary(activity,
                "Страницы сохраняются вместе с изображениями и оформлением. Уже сохранённые страницы повторно не скачиваются, поэтому при следующей синхронизации добавятся новые. Не закрывайте приложение во время скачивания.",
                12);
        hint.setPadding(0, Ui.dp(activity, 10), 0, Ui.dp(activity, 6));
        box.addView(hint);

        ScrollView scroll = new ScrollView(activity);
        scroll.addView(box);

        AlertDialog.Builder b = Ui.dialog(activity);
        b.setTitle("Скачать раздел для офлайна");
        b.setView(scroll);
        b.setPositiveButton("Скачать", null);
        b.setNegativeButton("Отмена", null);
        final AlertDialog dialog = b.create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            int id = groups.getCheckedRadioButtonId();
            if (id == -1) {
                Ui.toast(activity, "Выберите раздел");
                return;
            }
            Categories.Cat cat = (Categories.Cat) groups.findViewById(id).getTag();
            final int limit = details.isChecked() ? selectedLimit[0] : 0;
            Prefs.setSyncLimit(activity, selectedLimit[0]);
            Prefs.setSyncDetails(activity, details.isChecked());
            dialog.dismiss();
            start(activity, host, cat, limit, details.isChecked(), onDone);
        }));
        dialog.show();
    }

    private static void start(final Activity activity, final ViewGroup host, Categories.Cat cat,
                              int limit, boolean details, final Runnable onDone) {
        final AlertDialog progress = Ui.progressDialog(activity, cat.title,
                "Подготовка…", true, null);
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        final Downloader downloader = new Downloader(activity, host);
        active = downloader;
        progress.show();
        progress.setOnCancelListener(d -> downloader.cancel());
        progress.setOnShowListener(d -> {
            android.widget.Button cancel = progress.getButton(AlertDialog.BUTTON_NEGATIVE);
            if (cancel != null) cancel.setOnClickListener(v -> {
                downloader.cancel();
                progress.dismiss();
            });
        });
        downloader.start(cat, limit, details, new Downloader.Listener() {
            @Override
            public void onProgress(int done, int total, String message) {
                if (!progress.isShowing()) return;
                Ui.setProgressMessage(progress, message);
                if (total > 1) Ui.setProgress(progress, done, total);
            }

            @Override
            public void onFinished(int saved, int failed, String error) {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if (active == downloader) active = null;
                if (progress.isShowing()) progress.dismiss();
                String text;
                if (error != null && error.startsWith("Скачивание отменено")) {
                    text = "Скачивание отменено. Сохранено страниц: " + saved;
                } else if (error != null) {
                    text = error + (saved > 0 ? ". Сохранено страниц: " + saved : "");
                } else if (saved == 0) {
                    text = "Новых страниц не найдено — раздел уже сохранён";
                } else {
                    text = "Готово: сохранено страниц — " + saved + (failed > 0 ? ", ошибок — " + failed : "");
                }
                Ui.toast(activity, text);
                if (onDone != null) onDone.run();
            }
        });
    }
}
