package su.dnd.reader;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CompoundButton;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;


/** App settings. */
public class SettingsActivity extends Activity {

    private LinearLayout container;
    private FrameLayout syncHost;
    private boolean darkTheme;

    @Override
    protected void onCreate(Bundle state) {
        Prefs.applyTheme(this);
        darkTheme = Prefs.isDark(this);
        super.onCreate(state);
        setContentView(R.layout.activity_settings);
        container = findViewById(R.id.container);
        syncHost = findViewById(R.id.syncHost);
        findViewById(R.id.btnBack).setOnClickListener(v -> finish());
        build();
    }

    private void build() {
        container.removeAllViews();

        container.addView(Ui.sectionHeader(this, "Оформление"));
        addValueRow(R.drawable.ic_moon, "Тема", "Системная, светлая или тёмная", themeName(), v -> chooseTheme());
        addFontSizeRow();
        addSwitchRow(R.drawable.ic_moon, "Ночной режим страниц",
                "Затемнять текст сайта (экспериментально)", Prefs.darkPages(this),
                (b, checked) -> Prefs.setDarkPages(this, checked));
        addSwitchRow(R.drawable.ic_book, "Режим чтения по умолчанию",
                "Открывать статьи в очищенном виде", Prefs.readerMode(this),
                (b, checked) -> Prefs.setReaderMode(this, checked));

        container.addView(Ui.sectionHeader(this, "Офлайн-библиотека"));
        addValueRow(R.drawable.ic_library, "Сохранено", Ui.formatBytes(Archive.totalBytes(this)),
                "Страниц: " + Archive.count(this), v -> {
                    startActivity(new Intent(this, LibraryActivity.class));
                });
        addSwitchRow(R.drawable.ic_download, "Встраивать изображения",
                "Сохранённые страницы будут тяжелее, но полностью автономны", Prefs.embedImages(this),
                (b, checked) -> Prefs.setEmbedImages(this, checked));
        addValueRow(R.drawable.ic_spell, "Страниц за одно скачивание",
                "Сколько страниц раздела сохранять", String.valueOf(Prefs.syncLimit(this)), v -> chooseLimit());
        addValueRow(R.drawable.ic_download, "Скачать раздел сейчас", "Заклинания, бестиарий, предметы и другие",
                "", v -> SyncUi.show(this, syncHost, null));
        addValueRow(R.drawable.ic_delete, "Очистить библиотеку", "Удалить все сохранённые страницы",
                "", v -> clearLibrary());

        container.addView(Ui.sectionHeader(this, "О приложении"));
        TextView about = Ui.text(this, "D&D.su · версия " + versionName(), 14, true);
        TextView aboutText = Ui.secondary(this,
                "Неофициальный клиент справочника D&D 5 на русском языке. Приложение открывает сайт dnd.su, "
                        + "а также умеет сохранять страницы для чтения без интернета.\n\n"
                        + "Весь контент принадлежит авторам сайта dnd.su. Приложение не связано с Wizards of the Coast. "
                        + "Пожалуйста, поддерживайте проект на сайте.", 13);
        aboutText.setLineSpacing(0, 1.15f);
        LinearLayout aboutCard = Ui.card(this);
        aboutCard.addView(about);
        aboutText.setPadding(0, Ui.dp(this, 8), 0, 0);
        aboutCard.addView(aboutText);
        container.addView(aboutCard);

        addValueRow(R.drawable.ic_globe, "Открыть dnd.su", "В браузере", "", v -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://dnd.su/")));
            } catch (Exception e) {
                Ui.toast(this, "Не удалось открыть ссылку");
            }
        });
        addValueRow(R.drawable.ic_spell, "Версия правил 2024", "next.dnd.su", "", v -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://next.dnd.su/")));
            } catch (Exception e) {
                Ui.toast(this, "Не удалось открыть ссылку");
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (Prefs.isDark(this) != darkTheme) {
            recreate();
        }
    }

    @Override
    protected void onDestroy() {
        SyncUi.destroyActive();
        super.onDestroy();
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "1.0";
        }
    }

    private String themeName() {
        switch (Prefs.themeMode(this)) {
            case Prefs.THEME_LIGHT:
                return "Светлая";
            case Prefs.THEME_DARK:
                return "Тёмная";
            default:
                return "Системная";
        }
    }

    private void chooseTheme() {
        final String[] items = {"Как в системе", "Светлая", "Тёмная"};
        int current = Prefs.themeMode(this);
        Ui.dialog(this).setTitle("Тема оформления")
                .setSingleChoiceItems(items, current, (d, which) -> {
                    Prefs.setThemeMode(this, which);
                    d.dismiss();
                    recreate();
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void chooseLimit() {
        final int[] values = {10, 20, 30, 50, 100};
        String[] items = new String[values.length];
        int checked = 2;
        for (int i = 0; i < values.length; i++) {
            items[i] = values[i] + " страниц";
            if (values[i] == Prefs.syncLimit(this)) checked = i;
        }
        Ui.dialog(this).setTitle("Сколько страниц скачивать за раз")
                .setSingleChoiceItems(items, checked, (d, which) -> {
                    Prefs.setSyncLimit(this, values[which]);
                    d.dismiss();
                    build();
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void clearLibrary() {
        Ui.dialog(this).setTitle("Очистить библиотеку?")
                .setMessage("Будут удалены все сохранённые страницы (" + Archive.count(this) + ").")
                .setPositiveButton("Очистить", (d, w) -> {
                    Archive.clear(this);
                    build();
                    Ui.toast(this, "Библиотека очищена");
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    // ------------------------------------------------------------- row builders

    private void addValueRow(int icon, String title, String subtitle, String value, View.OnClickListener click) {
        LinearLayout card = Ui.card(this);
        LinearLayout row = Ui.horizontal(this);
        row.setBackgroundResource(Ui.selectableBackground(this));
        row.setPadding(Ui.dp(this, 8), Ui.dp(this, 10), Ui.dp(this, 8), Ui.dp(this, 10));
        row.addView(Ui.icon(this, icon, R.attr.dndAccent, 22));
        LinearLayout texts = Ui.vertical(this);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lp.leftMargin = Ui.dp(this, 14);
        texts.setLayoutParams(lp);
        texts.addView(Ui.text(this, title, 15, false));
        if (subtitle != null && !subtitle.isEmpty()) {
            TextView sub = Ui.secondary(this, subtitle, 12);
            sub.setPadding(0, Ui.dp(this, 2), 0, 0);
            texts.addView(sub);
        }
        row.addView(texts);
        if (value != null && !value.isEmpty()) {
            TextView v = Ui.text(this, value, 13, true);
            v.setTextColor(Ui.color(this, R.attr.dndAccent));
            v.setPadding(Ui.dp(this, 8), 0, Ui.dp(this, 4), 0);
            row.addView(v);
        }
        row.setOnClickListener(click);
        card.addView(row);
        container.addView(card);
    }

    private void addSwitchRow(int icon, String title, String subtitle, boolean checked,
                              CompoundButton.OnCheckedChangeListener listener) {
        LinearLayout card = Ui.card(this);
        LinearLayout row = Ui.horizontal(this);
        row.setPadding(Ui.dp(this, 8), Ui.dp(this, 6), Ui.dp(this, 8), Ui.dp(this, 6));
        row.addView(Ui.icon(this, icon, R.attr.dndAccent, 22));
        LinearLayout texts = Ui.vertical(this);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lp.leftMargin = Ui.dp(this, 14);
        texts.setLayoutParams(lp);
        texts.addView(Ui.text(this, title, 15, false));
        if (subtitle != null && !subtitle.isEmpty()) {
            TextView sub = Ui.secondary(this, subtitle, 12);
            sub.setPadding(0, Ui.dp(this, 2), 0, 0);
            texts.addView(sub);
        }
        row.addView(texts);
        Switch sw = new Switch(this);
        sw.setChecked(checked);
        sw.setOnCheckedChangeListener(listener);
        row.addView(sw);
        card.addView(row);
        container.addView(card);
    }

    private void addFontSizeRow() {
        final LinearLayout card = Ui.card(this);
        LinearLayout header = Ui.horizontal(this);
        header.addView(Ui.icon(this, R.drawable.ic_text, R.attr.dndAccent, 22));
        TextView title = Ui.text(this, "Размер текста", 15, false);
        title.setPadding(Ui.dp(this, 14), 0, 0, 0);
        header.addView(title);
        TextView value = Ui.text(this, Prefs.textZoom(this) + "%", 13, true);
        value.setTextColor(Ui.color(this, R.attr.dndAccent));
        LinearLayout.LayoutParams vp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        vp.rightMargin = Ui.dp(this, 10);
        value.setGravity(android.view.Gravity.END);
        header.addView(value, vp);
        card.addView(header);

        final TextView preview = Ui.text(this, "Быстрый бурый лис прыгает через ленивую собаку", 15, false);
        preview.setPadding(0, Ui.dp(this, 10), 0, Ui.dp(this, 4));
        card.addView(preview);

        SeekBar seek = new SeekBar(this);
        seek.setMax(8);
        seek.setProgress(Math.max(0, Math.min(8, (Prefs.textZoom(this) - 80) / 10)));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                int zoom = 80 + progress * 10;
                value.setText(zoom + "%");
                preview.setTextSize(15f * zoom / 100f);
                Prefs.setTextZoom(SettingsActivity.this, zoom);
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {
            }

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {
            }
        });
        card.addView(seek);
        container.addView(card);
    }
}
