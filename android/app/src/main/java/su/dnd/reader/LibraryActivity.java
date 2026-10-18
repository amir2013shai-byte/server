package su.dnd.reader;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.ListView;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Offline library: saved pages and section downloads. */
public class LibraryActivity extends Activity {

    private ListView list;
    private EditText search;
    private TextView stats;
    private View empty;
    private FrameLayout syncHost;

    private final List<Archive.Page> all = new ArrayList<>();
    private final List<Archive.Page> shown = new ArrayList<>();
    private Adapter adapter;
    private boolean darkTheme;

    @Override
    protected void onCreate(Bundle state) {
        Prefs.applyTheme(this);
        darkTheme = Prefs.isDark(this);
        super.onCreate(state);
        setContentView(R.layout.activity_library);
        list = findViewById(R.id.list);
        search = findViewById(R.id.search);
        stats = findViewById(R.id.tvStats);
        empty = findViewById(R.id.empty);
        syncHost = findViewById(R.id.syncHost);

        findViewById(R.id.btnBack).setOnClickListener(v -> finish());
        findViewById(R.id.btnSync).setOnClickListener(v -> SyncUi.show(this, syncHost, this::reload));
        findViewById(R.id.btnEmptySync).setOnClickListener(v -> SyncUi.show(this, syncHost, this::reload));
        findViewById(R.id.btnMore).setOnClickListener(v -> showMore());

        adapter = new Adapter();
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, view, position, id) -> open(shown.get(position)));
        list.setOnItemLongClickListener((parent, view, position, id) -> {
            showItemMenu(shown.get(position));
            return true;
        });
        search.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                filter(s.toString());
            }

            @Override
            public void afterTextChanged(Editable s) {
            }
        });
        reload();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (Prefs.isDark(this) != darkTheme) {
            recreate();
            return;
        }
        reload();
    }

    @Override
    protected void onDestroy() {
        SyncUi.destroyActive();
        super.onDestroy();
    }

    private void reload() {
        all.clear();
        all.addAll(Archive.pages(this));
        filter(search.getText().toString());
        long bytes = Archive.totalBytes(this);
        stats.setText(all.size() + " страниц · " + Ui.formatBytes(bytes)
                + " · доступно без интернета");
    }

    private void filter(String query) {
        shown.clear();
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        for (Archive.Page p : all) {
            if (q.isEmpty()
                    || (p.title != null && p.title.toLowerCase(Locale.ROOT).contains(q))
                    || (p.url != null && p.url.toLowerCase(Locale.ROOT).contains(q))
                    || Categories.titleOf(p.category).toLowerCase(Locale.ROOT).contains(q)) {
                shown.add(p);
            }
        }
        adapter.notifyDataSetChanged();
        empty.setVisibility(all.isEmpty() ? View.VISIBLE : View.GONE);
        list.setVisibility(all.isEmpty() ? View.GONE : View.VISIBLE);
        if (all.isEmpty()) {
            stats.setText("Библиотека пуста");
        }
    }

    private void open(Archive.Page page) {
        Intent i = new Intent(this, MainActivity.class);
        i.putExtra(MainActivity.EXTRA_ARCHIVE, page.localUrl());
        i.putExtra(MainActivity.EXTRA_SOURCE, page.url);
        i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(i);
    }

    private void showItemMenu(final Archive.Page page) {
        String[] items = {"Открыть", "Поделиться ссылкой", "Скачать заново (онлайн)", "Удалить"};
        Ui.dialog(this).setTitle(page.title).setItems(items, (d, which) -> {
            switch (which) {
                case 0:
                    open(page);
                    break;
                case 1:
                    Intent share = new Intent(Intent.ACTION_SEND);
                    share.setType("text/plain");
                    share.putExtra(Intent.EXTRA_TEXT, page.url);
                    startActivity(Intent.createChooser(share, "Поделиться ссылкой"));
                    break;
                case 2:
                    Archive.delete(this, page.url);
                    Intent i = new Intent(this, MainActivity.class);
                    i.putExtra(MainActivity.EXTRA_OPEN, page.url);
                    i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    startActivity(i);
                    break;
                case 3:
                    confirmDelete(page);
                    break;
            }
        }).setNegativeButton("Отмена", null).show();
    }

    private void confirmDelete(final Archive.Page page) {
        Ui.dialog(this).setTitle("Удалить страницу?")
                .setMessage(page.title + "\n\nСтраница будет удалена только из офлайн-библиотеки.")
                .setPositiveButton("Удалить", (d, w) -> {
                    Archive.delete(this, page.url);
                    reload();
                    Ui.toast(this, "Удалено");
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void showMore() {
        String[] items = {"Скачать раздел…", "Очистить библиотеку", "Настройки", "Открыть сайт dnd.su"};
        Ui.dialog(this).setItems(items, (d, which) -> {
            switch (which) {
                case 0:
                    SyncUi.show(this, syncHost, this::reload);
                    break;
                case 1:
                    Ui.dialog(this).setTitle("Очистить библиотеку?")
                            .setMessage("Будут удалены все сохранённые страницы (" + all.size() + ").")
                            .setPositiveButton("Очистить", (dd, w) -> {
                                Archive.clear(this);
                                reload();
                                Ui.toast(this, "Библиотека очищена");
                            })
                            .setNegativeButton("Отмена", null)
                            .show();
                    break;
                case 2:
                    startActivity(new Intent(this, SettingsActivity.class));
                    break;
                case 3:
                    Intent i = new Intent(this, MainActivity.class);
                    i.putExtra(MainActivity.EXTRA_OPEN, "https://dnd.su/");
                    i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    startActivity(i);
                    break;
            }
        }).setNegativeButton("Закрыть", null).show();
    }

    private class Adapter extends BaseAdapter {
        private final SimpleDateFormat dateFormat =
                new SimpleDateFormat("d MMM yyyy, HH:mm", new Locale("ru"));

        @Override
        public int getCount() {
            return shown.size();
        }

        @Override
        public Object getItem(int position) {
            return shown.get(position);
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            View view = convertView;
            if (view == null) {
                view = getLayoutInflater().inflate(R.layout.row_archive, parent, false);
            }
            final Archive.Page p = shown.get(position);
            TextView title = view.findViewById(R.id.title);
            TextView meta = view.findViewById(R.id.meta);
            ImageView icon = view.findViewById(R.id.ic);
            ImageButton delete = view.findViewById(R.id.btnDelete);
            title.setText(p.title);
            String date = dateFormat.format(new Date(p.savedAt));
            meta.setText(Categories.titleOf(p.category) + " · " + Ui.formatBytes(p.bytes) + " · " + date);
            Categories.Cat cat = Categories.byKey(p.category);
            icon.setImageResource(cat != null ? cat.icon : R.drawable.ic_book);
            delete.setOnClickListener(v -> confirmDelete(p));
            return view;
        }
    }
}
