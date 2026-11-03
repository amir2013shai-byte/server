package su.dnd.reader;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.Spannable;
import android.text.SpannableString;
import android.text.TextWatcher;
import android.text.style.BackgroundColorSpan;
import android.text.style.StyleSpan;
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

/** Offline library: saved pages, full-text search inside them and section downloads. */
public class LibraryActivity extends Activity {

    private ListView list;
    private EditText search;
    private TextView stats;
    private View empty;
    private FrameLayout syncHost;

    private final List<Archive.Page> all = new ArrayList<>();
    private final List<Archive.Page> shown = new ArrayList<>();
    private final List<Archive.Hit> hits = new ArrayList<>();
    private Adapter adapter;
    private boolean darkTheme;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable pendingSearch;
    private String activeQuery = "";
    private boolean searching;
    private int searchGeneration;

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
        list.setOnItemClickListener((parent, view, position, id) -> {
            if (position < hits.size()) {
                Archive.Hit hit = hits.get(position);
                open(hit.page, activeQuery);
            } else {
                int pageIndex = position - hits.size();
                if (pageIndex >= 0 && pageIndex < shown.size()) open(shown.get(pageIndex), null);
            }
        });
        list.setOnItemLongClickListener((parent, view, position, id) -> {
            Archive.Page page = position < hits.size()
                    ? hits.get(position).page
                    : (position - hits.size() < shown.size() ? shown.get(position - hits.size()) : null);
            if (page != null) showItemMenu(page);
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
        if (pendingSearch != null) handler.removeCallbacks(pendingSearch);
        super.onDestroy();
    }

    private void reload() {
        int broken = Archive.pruneBroken(this);
        if (broken > 0) {
            Ui.toast(this, "Удалено повреждённых записей: " + broken);
        }
        all.clear();
        all.addAll(Archive.pages(this));
        filter(search.getText().toString());
        updateStats();
    }

    private void updateStats() {
        if (all.isEmpty()) {
            stats.setText("Библиотека пуста");
            return;
        }
        long bytes = Archive.totalBytes(this);
        String text = all.size() + " стр. · " + Ui.formatBytes(bytes) + " · доступно без интернета";
        if (searching) {
            text = "Ищем по тексту сохранённых страниц…";
        } else if (!hits.isEmpty()) {
            text = "Найдено в тексте: " + hits.size() + " · всего " + all.size() + " стр. · "
                    + Ui.formatBytes(bytes);
        } else if (!activeQuery.isEmpty() && shown.isEmpty()) {
            text = "Ничего не найдено · всего " + all.size() + " стр.";
        }
        stats.setText(text);
    }

    private void filter(String query) {
        String raw = query == null ? "" : query.trim();
        String q = raw.toLowerCase(Locale.ROOT).replace('ё', 'е');
        shown.clear();
        for (Archive.Page p : all) {
            if (q.isEmpty()
                    || (p.title != null && p.title.toLowerCase(Locale.ROOT).replace('ё', 'е').contains(q))
                    || (p.url != null && p.url.toLowerCase(Locale.ROOT).contains(q))
                    || Categories.titleOf(p.category).toLowerCase(Locale.ROOT).contains(q)) {
                shown.add(p);
            }
        }

        activeQuery = raw;
        hits.clear();
        if (pendingSearch != null) {
            handler.removeCallbacks(pendingSearch);
            pendingSearch = null;
        }
        searching = false;
        searchGeneration++;

        if (q.length() >= 2) {
            final String needle = raw;
            final int generation = searchGeneration;
            searching = false;
            pendingSearch = () -> startTextSearch(needle, generation);
            handler.postDelayed(pendingSearch, 320);
        }

        adapter.notifyDataSetChanged();
        empty.setVisibility(all.isEmpty() ? View.VISIBLE : View.GONE);
        list.setVisibility(all.isEmpty() ? View.GONE : View.VISIBLE);
        updateStats();
    }

    /** Full-text search over the saved pages runs off the UI thread. */
    private void startTextSearch(final String needle, final int generation) {
        searching = true;
        updateStats();
        new Thread(() -> {
            final List<Archive.Hit> found = Archive.search(this, needle, 40);
            handler.post(() -> {
                if (generation != searchGeneration) return;
                searching = false;
                hits.clear();
                hits.addAll(found);
                adapter.notifyDataSetChanged();
                updateStats();
            });
        }, "archive-search").start();
    }

    private void open(Archive.Page page, String query) {
        if (!Archive.fileExists(this, page)) {
            Ui.toast(this, "Копия не найдена — открываем страницу онлайн");
            Intent online = new Intent(this, MainActivity.class);
            online.putExtra(MainActivity.EXTRA_OPEN, page.url);
            online.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(online);
            return;
        }
        Intent i = new Intent(this, MainActivity.class);
        i.putExtra(MainActivity.EXTRA_ARCHIVE, page.localUrl());
        i.putExtra(MainActivity.EXTRA_SOURCE, page.url);
        if (query != null && query.trim().length() > 1) i.putExtra(MainActivity.EXTRA_QUERY, query.trim());
        i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(i);
    }

    private void showItemMenu(final Archive.Page page) {
        String[] items = {"Открыть", "Поделиться ссылкой", "Скачать заново (онлайн)", "Удалить"};
        Ui.dialog(this).setTitle(page.title).setItems(items, (d, which) -> {
            switch (which) {
                case 0:
                    open(page, null);
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
        String[] items = {"Скачать раздел…", "Кубики и броски", "Очистить библиотеку", "Настройки", "Открыть сайт dnd.su"};
        Ui.dialog(this).setItems(items, (d, which) -> {
            switch (which) {
                case 0:
                    SyncUi.show(this, syncHost, this::reload);
                    break;
                case 1:
                    startActivity(new Intent(this, DiceActivity.class));
                    break;
                case 2:
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
                case 3:
                    startActivity(new Intent(this, SettingsActivity.class));
                    break;
                case 4:
                    Intent i = new Intent(this, MainActivity.class);
                    i.putExtra(MainActivity.EXTRA_OPEN, "https://dnd.su/");
                    i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    startActivity(i);
                    break;
            }
        }).setNegativeButton("Закрыть", null).show();
    }

    /** Highlights the query inside a snippet so the match is visible in the list. */
    private static CharSequence highlightSnippet(String snippet, String query) {
        if (snippet == null || snippet.isEmpty()) return "";
        SpannableString sp = new SpannableString(snippet);
        if (query == null || query.trim().length() < 2) return sp;
        String haystack = snippet.toLowerCase(Locale.ROOT).replace('ё', 'е');
        String needle = query.trim().toLowerCase(Locale.ROOT).replace('ё', 'е');
        int from = 0;
        int guard = 0;
        while (guard++ < 40) {
            int pos = haystack.indexOf(needle, from);
            if (pos < 0 || pos + needle.length() > snippet.length()) break;
            sp.setSpan(new StyleSpan(Typeface.BOLD), pos, pos + needle.length(),
                    Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
            sp.setSpan(new BackgroundColorSpan(0x66F2C14E), pos, pos + needle.length(),
                    Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
            from = pos + needle.length();
        }
        return sp;
    }

    private class Adapter extends BaseAdapter {
        private final SimpleDateFormat dateFormat =
                new SimpleDateFormat("d MMM yyyy, HH:mm", new Locale("ru"));

        @Override
        public int getCount() {
            return hits.size() + shown.size();
        }

        @Override
        public Object getItem(int position) {
            if (position < hits.size()) return hits.get(position);
            return shown.get(position - hits.size());
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
            TextView title = view.findViewById(R.id.title);
            TextView meta = view.findViewById(R.id.meta);
            ImageView icon = view.findViewById(R.id.ic);
            ImageButton delete = view.findViewById(R.id.btnDelete);

            if (position < hits.size()) {
                final Archive.Hit hit = hits.get(position);
                title.setText(hit.page.title);
                meta.setText(highlightSnippet(hit.snippet, activeQuery));
                meta.setMaxLines(3);
                icon.setImageResource(R.drawable.ic_search);
                delete.setVisibility(View.GONE);
                return view;
            }

            final Archive.Page p = shown.get(position - hits.size());
            delete.setVisibility(View.VISIBLE);
            title.setText(p.title);
            meta.setMaxLines(1);
            String date = dateFormat.format(new Date(p.savedAt));
            meta.setText(Categories.titleOf(p.category) + " · " + Ui.formatBytes(p.bytes) + " · " + date);
            Categories.Cat cat = Categories.byKey(p.category);
            icon.setImageResource(cat != null ? cat.icon : R.drawable.ic_book);
            delete.setOnClickListener(v -> confirmDelete(p));
            return view;
        }
    }
}
