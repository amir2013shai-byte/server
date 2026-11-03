package su.dnd.reader;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.ListView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Bookmarks and personal notes: one list of saved pages with their annotations. */
public class FavoritesActivity extends Activity {

    private final List<String> urls = new ArrayList<>();
    private final List<String> shown = new ArrayList<>();
    private ListView list;
    private EditText search;
    private TextView stats;
    private View empty;
    private Adapter adapter;

    @Override
    protected void onCreate(Bundle state) {
        Prefs.applyTheme(this);
        super.onCreate(state);
        setContentView(R.layout.activity_favorites);

        list = findViewById(R.id.list);
        search = findViewById(R.id.search);
        stats = findViewById(R.id.tvStats);
        empty = findViewById(R.id.empty);

        findViewById(R.id.btnBack).setOnClickListener(v -> finish());
        findViewById(R.id.btnShare).setOnClickListener(v -> ExportUi.show(this));
        findViewById(R.id.btnAddNote).setOnClickListener(v -> addNote());

        adapter = new Adapter();
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, view, position, id) -> open(shown.get(position)));
        list.setOnItemLongClickListener((parent, view, position, id) -> {
            itemMenu(shown.get(position));
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
        reload();
    }

    private void reload() {
        urls.clear();
        Set<String> unique = new LinkedHashSet<>();
        unique.addAll(Favorites.urls(this));
        unique.addAll(Favorites.notedUrls(this));
        urls.addAll(unique);
        filter(search.getText().toString());
    }

    private void filter(String query) {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT).replace('ё', 'е');
        shown.clear();
        for (String url : urls) {
            String title = titleOf(url);
            String note = Favorites.note(this, url);
            if (q.isEmpty()
                    || title.toLowerCase(Locale.ROOT).replace('ё', 'е').contains(q)
                    || note.toLowerCase(Locale.ROOT).replace('ё', 'е').contains(q)
                    || url.toLowerCase(Locale.ROOT).contains(q)) {
                shown.add(url);
            }
        }
        adapter.notifyDataSetChanged();
        boolean nothing = urls.isEmpty();
        empty.setVisibility(nothing ? View.VISIBLE : View.GONE);
        list.setVisibility(nothing ? View.GONE : View.VISIBLE);
        stats.setText("Избранное: " + Favorites.count(this)
                + " · с заметками: " + Favorites.noteCount(this)
                + (q.isEmpty() ? "" : " · найдено: " + shown.size()));
    }

    /** Title from the archive when the page is saved, otherwise the prettified link. */
    private String titleOf(String url) {
        Archive.Page page = Archive.get(this, url);
        if (page != null && page.title != null && !page.title.isEmpty()) return page.title;
        String value = url.replaceFirst("^https?://", "");
        if (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    private void open(String url) {
        Intent i = new Intent(this, MainActivity.class);
        if (Archive.has(this, url) && Archive.fileExists(this, Archive.get(this, url))) {
            i.putExtra(MainActivity.EXTRA_ARCHIVE, Archive.localUrl(url));
            i.putExtra(MainActivity.EXTRA_SOURCE, url);
        } else {
            i.putExtra(MainActivity.EXTRA_OPEN, url);
        }
        i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(i);
    }

    private void itemMenu(final String url) {
        boolean favorite = Favorites.isFavorite(this, url);
        String[] items = {
                "Открыть",
                "Заметка…",
                favorite ? "Убрать из избранного" : "В избранное",
                "Поделиться ссылкой"
        };
        Ui.dialog(this).setTitle(titleOf(url)).setItems(items, (d, which) -> {
            switch (which) {
                case 0:
                    open(url);
                    break;
                case 1:
                    editNote(url);
                    break;
                case 2:
                    Favorites.toggle(this, url);
                    reload();
                    break;
                case 3:
                    Intent share = new Intent(Intent.ACTION_SEND);
                    share.setType("text/plain");
                    share.putExtra(Intent.EXTRA_TEXT, url);
                    share.putExtra(Intent.EXTRA_SUBJECT, titleOf(url));
                    startActivity(Intent.createChooser(share, "Поделиться ссылкой"));
                    break;
            }
        }).setNegativeButton("Закрыть", null).show();
    }

    private void addNote() {
        final EditText url = new EditText(this);
        url.setHint("https://dnd.su/spells/…");
        url.setSingleLine(true);
        url.setTextSize(14);
        url.setTextColor(Ui.color(this, R.attr.dndText));
        url.setHintTextColor(Ui.color(this, R.attr.dndTextDim));
        url.setBackgroundResource(R.drawable.bg_input);
        url.setPadding(Ui.dp(this, 12), Ui.dp(this, 9), Ui.dp(this, 12), Ui.dp(this, 9));

        final EditText text = new EditText(this);
        text.setHint("Заметка");
        text.setTextSize(14);
        text.setMinLines(3);
        text.setTextColor(Ui.color(this, R.attr.dndText));
        text.setHintTextColor(Ui.color(this, R.attr.dndTextDim));
        text.setBackgroundResource(R.drawable.bg_input);
        text.setPadding(Ui.dp(this, 12), Ui.dp(this, 9), Ui.dp(this, 12), Ui.dp(this, 9));

        android.widget.LinearLayout box = Ui.vertical(this);
        int pad = Ui.dp(this, 20);
        box.setPadding(pad, Ui.dp(this, 6), pad, 0);
        box.addView(url);
        android.widget.LinearLayout.LayoutParams lp = new android.widget.LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = Ui.dp(this, 10);
        text.setLayoutParams(lp);
        box.addView(text);

        final AlertDialog dialog = Ui.dialog(this)
                .setTitle("Новая заметка")
                .setView(box)
                .setPositiveButton("Сохранить", null)
                .setNegativeButton("Отмена", null)
                .create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String link = url.getText().toString().trim();
            if (!link.startsWith("http")) link = "https://" + link;
            if (!WebUtils.isDnd(link)) {
                Ui.toast(this, "Ссылка должна вести на dnd.su");
                return;
            }
            if (text.getText().toString().trim().isEmpty()) {
                Ui.toast(this, "Введите текст заметки");
                return;
            }
            Favorites.setNote(this, link, text.getText().toString());
            if (!Favorites.isFavorite(this, link)) Favorites.toggle(this, link);
            dialog.dismiss();
            reload();
        }));
        dialog.show();
    }

    private void editNote(final String url) {
        final EditText text = new EditText(this);
        text.setText(Favorites.note(this, url));
        text.setTextSize(14);
        text.setMinLines(3);
        text.setTextColor(Ui.color(this, R.attr.dndText));
        text.setBackgroundResource(R.drawable.bg_input);
        text.setPadding(Ui.dp(this, 12), Ui.dp(this, 9), Ui.dp(this, 12), Ui.dp(this, 9));

        android.widget.LinearLayout box = Ui.vertical(this);
        int pad = Ui.dp(this, 20);
        box.setPadding(pad, Ui.dp(this, 6), pad, 0);
        box.addView(text);

        final AlertDialog dialog = Ui.dialog(this)
                .setTitle(titleOf(url))
                .setView(box)
                .setPositiveButton("Сохранить", null)
                .setNeutralButton("Удалить заметку", null)
                .setNegativeButton("Отмена", null)
                .create();
        dialog.setOnShowListener(d -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                Favorites.setNote(this, url, text.getText().toString());
                dialog.dismiss();
                reload();
            });
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> {
                Favorites.setNote(this, url, "");
                dialog.dismiss();
                reload();
            });
        });
        dialog.show();
    }

    private class Adapter extends BaseAdapter {
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
            View row = convertView;
            if (row == null) row = getLayoutInflater().inflate(R.layout.row_favorite, parent, false);
            final String url = shown.get(position);
            String note = Favorites.note(FavoritesActivity.this, url);

            TextView title = row.findViewById(R.id.title);
            TextView noteView = row.findViewById(R.id.note);
            TextView meta = row.findViewById(R.id.meta);
            ImageView icon = row.findViewById(R.id.ic);
            ImageButton more = row.findViewById(R.id.btnMore);

            title.setText(titleOf(url));
            if (note.isEmpty()) {
                noteView.setVisibility(View.GONE);
            } else {
                noteView.setVisibility(View.VISIBLE);
                noteView.setText(note);
            }
            String kind = Archive.has(FavoritesActivity.this, url) ? "сохранено офлайн" : "только онлайн";
            meta.setText(url.replaceFirst("^https?://", "") + " · " + kind);
            icon.setImageResource(Favorites.isFavorite(FavoritesActivity.this, url)
                    ? R.drawable.ic_star : R.drawable.ic_note);
            more.setOnClickListener(v -> itemMenu(url));
            return row;
        }
    }
}
