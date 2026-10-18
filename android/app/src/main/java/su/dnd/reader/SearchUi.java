package su.dnd.reader;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * "Search in Yandex" dialog: the user types a query, the app reads the Yandex results for
 * site:dnd.su and shows page titles + links. A result can be opened or saved for offline reading.
 */
public final class SearchUi {

    private static String lastQuery = "";

    private SearchUi() {
    }

    public interface OpenUrl {
        void open(String url);
    }

    public static void show(final Activity activity, final ViewGroup host, final OpenUrl opener) {
        if (SyncUi.isRunning()) {
            Ui.toast(activity, "Дождитесь окончания скачивания раздела");
            return;
        }

        final int pad = Ui.dp(activity, 20);
        final LinearLayout box = Ui.vertical(activity);
        box.setPadding(pad, Ui.dp(activity, 2), pad, 0);

        final EditText input = new EditText(activity);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setTextSize(15);
        input.setTextColor(Ui.color(activity, R.attr.dndText));
        input.setHintTextColor(Ui.color(activity, R.attr.dndTextDim));
        input.setHint("Огненный шар, бард, дракон…");
        input.setBackgroundResource(R.drawable.bg_input);
        input.setPadding(Ui.dp(activity, 12), Ui.dp(activity, 9), Ui.dp(activity, 12), Ui.dp(activity, 9));
        input.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        input.setText(lastQuery);
        if (lastQuery.length() > 0) input.setSelection(lastQuery.length());

        final Button find = Ui.primaryButton(activity, "Найти", null);
        final LinearLayout inputRow = Ui.horizontal(activity);
        inputRow.addView(input, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams findParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        findParams.leftMargin = Ui.dp(activity, 8);
        inputRow.addView(find, findParams);
        box.addView(inputRow);

        final TextView status = Ui.secondary(activity,
                "Поиск по всем страницам домена dnd.su (включая next.dnd.su) через Яндекс.", 12);
        status.setPadding(0, Ui.dp(activity, 10), 0, Ui.dp(activity, 4));
        box.addView(status);

        final ProgressBar progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progress.setIndeterminate(true);
        progress.setVisibility(View.GONE);
        try {
            progress.getIndeterminateDrawable().setColorFilter(
                    Ui.color(activity, R.attr.dndAccent), android.graphics.PorterDuff.Mode.SRC_IN);
        } catch (Exception ignored) {
        }
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(activity, 3));
        progressParams.topMargin = Ui.dp(activity, 2);
        box.addView(progress, progressParams);

        float density = activity.getResources().getDisplayMetrics().density;
        int screenDp = (int) (activity.getResources().getDisplayMetrics().heightPixels / density);
        int listHeight = Ui.dp(activity, Math.max(150, Math.min(300, (int) (screenDp * 0.42f))));

        final ListView list = new ListView(activity);
        list.setDivider(null);
        list.setDividerHeight(0);
        list.setBackgroundResource(R.drawable.bg_card);
        list.setVisibility(View.GONE);
        LinearLayout.LayoutParams listParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, listHeight);
        listParams.topMargin = Ui.dp(activity, 8);
        box.addView(list, listParams);

        final AlertDialog[] dialogRef = new AlertDialog[1];
        final Adapter[] adapterRef = new Adapter[1];

        Adapter.Actions actions = new Adapter.Actions() {
            @Override
            public void open(YandexSearch.Result item) {
                if (dialogRef[0] != null) dialogRef[0].dismiss();
                opener.open(item.url);
            }

            @Override
            public void save(final YandexSearch.Result item) {
                if (adapterRef[0] != null && adapterRef[0].isArchived(item)) {
                    Ui.toast(activity, "Эта страница уже есть в офлайн-библиотеке");
                    return;
                }
                SyncUi.downloadPage(activity, host, item.url, new SyncUi.Done() {
                    @Override
                    public void onDone(boolean saved) {
                        if (saved && adapterRef[0] != null) adapterRef[0].markArchived(item.url);
                    }
                });
            }

            @Override
            public void more(final YandexSearch.Result item) {
                AlertDialog.Builder b = Ui.dialog(activity);
                b.setTitle(item.title);
                b.setItems(new String[]{"Открыть в приложении", "Сохранить для офлайна",
                        "Открыть в браузере", "Поделиться ссылкой"}, (d, which) -> {
                    if (which == 0) open(item);
                    else if (which == 1) save(item);
                    else if (which == 2) openExternal(activity, item.url);
                    else share(activity, item);
                });
                b.show();
            }
        };

        final Adapter adapter = new Adapter(activity, actions);
        adapterRef[0] = adapter;
        list.setAdapter(adapter);

        AlertDialog.Builder b = Ui.dialog(activity);
        b.setTitle("Поиск по D&D.su через Яндекс");
        b.setView(box);
        b.setNegativeButton("Закрыть", null);
        final AlertDialog dialog = b.create();
        dialogRef[0] = dialog;

        final YandexSearch searcher = new YandexSearch(activity, host);

        final Runnable search = new Runnable() {
            @Override
            public void run() {
                final String query = input.getText().toString().trim();
                if (query.length() < 2) {
                    Ui.toast(activity, "Введите хотя бы два символа");
                    return;
                }
                if (!WebUtils.isOnline(activity)) {
                    status.setText("Нет подключения к интернету — поиск в Яндексе работает только онлайн.");
                    return;
                }
                lastQuery = query;
                hideKeyboard(activity, input);
                status.setTextColor(Ui.color(activity, R.attr.dndTextDim));
                status.setText("Ищем «" + Ui.ellipsize(query, 60) + "» в Яндексе…");
                progress.setVisibility(View.VISIBLE);
                find.setEnabled(false);
                find.setAlpha(0.6f);
                list.setVisibility(View.GONE);
                adapter.clear();
                searcher.search(query, new YandexSearch.Callback() {
                    @Override
                    public void onResults(List<YandexSearch.Result> results, boolean captcha, String searchUrl) {
                        progress.setVisibility(View.GONE);
                        find.setEnabled(true);
                        find.setAlpha(1f);
                        if (!results.isEmpty()) {
                            Set<String> archived = new HashSet<>();
                            for (YandexSearch.Result r : results) {
                                if (Archive.has(activity, r.url)) archived.add(Archive.normalize(r.url));
                            }
                            adapter.setItems(results, archived);
                            list.setVisibility(View.VISIBLE);
                            status.setText("«" + Ui.ellipsize(query, 40) + "» · найдено страниц: "
                                    + results.size() + " · нажмите, чтобы открыть, или сохраните значком загрузки");
                            if (captcha) {
                                Ui.toast(activity, "Яндекс показал проверку — выдача может быть неполной");
                            }
                        } else if (captcha) {
                            status.setText("Яндекс просит подтвердить, что вы не робот. Нажмите «Открыть поиск в Яндексе», "
                                    + "решите проверку — после этого поиск в приложении снова заработает.");
                        } else {
                            status.setText("Ничего не найдено. Попробуйте другие слова или откройте выдачу Яндекса.");
                        }
                    }

                    @Override
                    public void onError(String message, String searchUrl) {
                        progress.setVisibility(View.GONE);
                        find.setEnabled(true);
                        find.setAlpha(1f);
                        status.setText(message + " Можно открыть поиск в Яндексе.");
                    }
                });
            }
        };

        find.setOnClickListener(v -> search.run());
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH || actionId == EditorInfo.IME_ACTION_DONE) {
                search.run();
                return true;
            }
            return false;
        });

        Button openYandex = Ui.flatButton(activity, "Открыть поиск в Яндексе", v -> {
            String query = input.getText().toString().trim();
            if (query.length() < 2) {
                Ui.toast(activity, "Введите хотя бы два символа");
                return;
            }
            lastQuery = query;
            dialog.dismiss();
            opener.open(YandexSearch.buildUrl(query));
        });
        openYandex.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams yandexParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        yandexParams.topMargin = Ui.dp(activity, 6);
        yandexParams.bottomMargin = Ui.dp(activity, 4);
        box.addView(openYandex, yandexParams);

        dialog.setOnDismissListener(d -> searcher.cancel());
        dialog.setOnShowListener(d -> {
            Window window = dialog.getWindow();
            if (window != null) {
                int screenWidth = activity.getResources().getDisplayMetrics().widthPixels;
                int width = Math.min(screenWidth - Ui.dp(activity, 24), Ui.dp(activity, 600));
                window.setLayout(width, ViewGroup.LayoutParams.WRAP_CONTENT);
                window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
            }
            input.requestFocus();
        });
        dialog.show();

        input.postDelayed(() -> {
            try {
                InputMethodManager imm = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
                if (imm != null) imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT);
            } catch (Exception ignored) {
            }
        }, 250);
    }

    private static void hideKeyboard(Activity activity, View view) {
        try {
            InputMethodManager imm = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.hideSoftInputFromWindow(view.getWindowToken(), 0);
        } catch (Exception ignored) {
        }
    }

    private static void openExternal(Activity activity, String url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            activity.startActivity(i);
        } catch (ActivityNotFoundException e) {
            Ui.toast(activity, "Не удалось открыть ссылку");
        } catch (Exception e) {
            Ui.toast(activity, "Не удалось открыть ссылку");
        }
    }

    private static void share(Activity activity, YandexSearch.Result item) {
        try {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, item.url);
            i.putExtra(Intent.EXTRA_SUBJECT, item.title);
            activity.startActivity(Intent.createChooser(i, "Поделиться ссылкой"));
        } catch (Exception e) {
            Ui.toast(activity, "Не удалось поделиться ссылкой");
        }
    }

    private static String pretty(String url) {
        String value = url == null ? "" : url.replaceFirst("^https?://", "");
        if (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    /** List of Yandex results: page title, link and a button that saves the page for offline use. */
    private static final class Adapter extends BaseAdapter {

        interface Actions {
            void open(YandexSearch.Result item);

            void save(YandexSearch.Result item);

            void more(YandexSearch.Result item);
        }

        private final Activity activity;
        private final Actions actions;
        private final List<YandexSearch.Result> items = new ArrayList<>();
        private final Set<String> archived = new HashSet<>();

        Adapter(Activity activity, Actions actions) {
            this.activity = activity;
            this.actions = actions;
        }

        void setItems(List<YandexSearch.Result> data, Set<String> saved) {
            items.clear();
            items.addAll(data);
            archived.clear();
            archived.addAll(saved);
            notifyDataSetChanged();
        }

        void clear() {
            items.clear();
            archived.clear();
            notifyDataSetChanged();
        }

        boolean isArchived(YandexSearch.Result item) {
            return item != null && archived.contains(Archive.normalize(item.url));
        }

        void markArchived(String url) {
            archived.add(Archive.normalize(url));
            notifyDataSetChanged();
        }

        @Override
        public int getCount() {
            return items.size();
        }

        @Override
        public Object getItem(int position) {
            return items.get(position);
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            final YandexSearch.Result item = items.get(position);
            boolean saved = isArchived(item);

            LinearLayout row = Ui.horizontal(activity);
            row.setPadding(Ui.dp(activity, 14), Ui.dp(activity, 10), Ui.dp(activity, 4), Ui.dp(activity, 10));
            row.setBackgroundResource(Ui.selectableBackground(activity));

            LinearLayout texts = Ui.vertical(activity);
            row.addView(texts, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

            TextView title = Ui.text(activity, item.title, 15, false);
            title.setMaxLines(2);
            title.setEllipsize(TextUtils.TruncateAt.END);
            texts.addView(title);

            TextView url = Ui.secondary(activity, pretty(item.url), 11);
            url.setSingleLine(true);
            url.setEllipsize(TextUtils.TruncateAt.MIDDLE);
            url.setPadding(0, Ui.dp(activity, 2), 0, 0);
            texts.addView(url);

            if (saved) {
                TextView badge = new TextView(activity);
                badge.setText("Уже в офлайн-библиотеке");
                badge.setTextSize(10);
                badge.setTextColor(Ui.color(activity, R.attr.dndAccent));
                badge.setPadding(0, Ui.dp(activity, 3), 0, 0);
                texts.addView(badge);
            }

            ImageButton save = new ImageButton(activity);
            int size = Ui.dp(activity, 40);
            save.setLayoutParams(new LinearLayout.LayoutParams(size, size));
            save.setPadding(Ui.dp(activity, 10), Ui.dp(activity, 10), Ui.dp(activity, 10), Ui.dp(activity, 10));
            save.setImageResource(saved ? R.drawable.ic_check : R.drawable.ic_download);
            save.setColorFilter(Ui.color(activity, R.attr.dndAccent));
            save.setBackgroundResource(Ui.selectableBackground(activity));
            save.setContentDescription("Сохранить страницу");
            save.setOnClickListener(v -> actions.save(item));
            row.addView(save);

            row.setOnClickListener(v -> actions.open(item));
            row.setOnLongClickListener(v -> {
                actions.more(item);
                return true;
            });
            return row;
        }
    }
}
