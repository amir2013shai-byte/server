package su.dnd.reader;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.FileInputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/** Main screen: the D&amp;D.su site in a WebView plus offline tools. */
public class MainActivity extends android.app.Activity {

    public static final String EXTRA_ARCHIVE = "archive_url";
    public static final String EXTRA_SOURCE = "source_url";
    public static final String EXTRA_OPEN = "open_url";

    private static final String HOME = "https://dnd.su/";

    private WebView web;
    private TextView tvTitle;
    private TextView tvSub;
    private TextView tvOffline;
    private ProgressBar progress;
    private android.widget.ImageButton btnSave;
    private View offlineBar;
    private LinearLayout bottomNav;
    private FrameLayout syncHost;

    private SaveBridge saveBridge;
    private Downloader downloader;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private String currentUrl = HOME;
    private String pageTitle = "";
    private boolean showingOffline;
    private boolean offlineHtmlLoaded;
    private boolean darkTheme;
    private boolean localPage;
    private String originalUrl;
    private long lastBackPress;
    private String darkAppliedFor;
    private String readerAppliedFor;
    private android.webkit.ValueCallback<Uri[]> fileCallback;
    private static final int REQ_FILE = 4311;

    private final int[] navIcons = {R.drawable.ic_home, R.drawable.ic_bestiary, R.drawable.ic_spell,
            R.drawable.ic_items, R.drawable.ic_library};
    private final String[] navLabels = {"Главная", "Бестиарий", "Заклинания", "Предметы", "Офлайн"};
    private final String[] navUrls = {HOME, "https://dnd.su/bestiary/", "https://dnd.su/spells/",
            "https://dnd.su/items/", null};
    private final ImageView[] navIconViews = new ImageView[5];
    private final TextView[] navTextViews = new TextView[5];

    @Override
    protected void onCreate(Bundle state) {
        Prefs.applyTheme(this);
        darkTheme = Prefs.isDark(this);
        super.onCreate(state);
        setContentView(R.layout.activity_main);

        tvTitle = findViewById(R.id.tvTitle);
        tvSub = findViewById(R.id.tvSub);
        tvOffline = findViewById(R.id.tvOffline);
        progress = findViewById(R.id.progress);
        offlineBar = findViewById(R.id.offlineBar);
        bottomNav = findViewById(R.id.bottomNav);
        syncHost = findViewById(R.id.syncHost);

        findViewById(R.id.btnBack).setOnClickListener(v -> goBack());
        findViewById(R.id.btnRefresh).setOnClickListener(v -> {
            if (WebUtils.isOnline(this)) {
                showingOffline = false;
                web.reload();
            } else {
                Ui.toast(this, "Нет подключения к интернету");
                updateOfflineBar();
            }
        });
        btnSave = findViewById(R.id.btnSave);
        btnSave.setOnClickListener(v -> saveCurrentPage());
        findViewById(R.id.btnMenu).setOnClickListener(v -> showMenu());

        buildBottomNav();
        setupWebView(state);

        boolean handled = handleIntent(getIntent());
        if (state == null && !handled) {
            load(HOME);
        }
        updateOfflineBar();
        if (Prefs.firstRun(this)) {
            Prefs.setFirstRunDone(this);
            Ui.dialog(this)
                    .setTitle("Добро пожаловать в D&D.su")
                    .setMessage("Это неофициальное приложение-клиент справочника dnd.su.\n\n"
                            + "• Кнопка-закладка вверху сохраняет открытую страницу вместе с изображениями — её можно читать без интернета.\n\n"
                            + "• Меню → «Поиск в Яндексе» ищет по всему домену dnd.su и показывает найденные страницы ссылками с заголовками.\n\n"
                            + "• Меню → «Скачать раздел» загружает весь раздел (например, «Заклинания») в офлайн-библиотеку.\n\n"
                            + "• Сохранённые страницы доступны на вкладке «Офлайн».\n\n"
                            + "Контент принадлежит авторам сайта dnd.su.")
                    .setPositiveButton("Понятно", null)
                    .show();
        }
    }

    private void setupWebView(Bundle state) {
        web = findViewById(R.id.webView);
        WebUtils.configure(web, false);
        saveBridge = new SaveBridge(this, web);
        saveBridge.register();
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url != null && WebUtils.isDnd(url)) {
                openExternal(url);
            }
        });
        if (state != null) {
            web.restoreState(state);
        }
    }

    private void buildBottomNav() {
        bottomNav.removeAllViews();
        for (int i = 0; i < navLabels.length; i++) {
            final int idx = i;
            LinearLayout item = new LinearLayout(this);
            item.setOrientation(LinearLayout.VERTICAL);
            item.setGravity(Gravity.CENTER);
            item.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));
            item.setBackgroundResource(Ui.selectableBackground(this));
            ImageView icon = new ImageView(this);
            int size = Ui.dp(this, 23);
            icon.setLayoutParams(new LinearLayout.LayoutParams(size, size));
            icon.setImageResource(navIcons[i]);
            item.addView(icon);
            TextView label = new TextView(this);
            label.setText(navLabels[i]);
            label.setTextSize(10);
            label.setPadding(0, Ui.dp(this, 3), 0, 0);
            item.addView(label);
            item.setOnClickListener(v -> onNavClick(idx));
            bottomNav.addView(item);
            navIconViews[i] = icon;
            navTextViews[i] = label;
        }
        updateNav();
    }

    private void onNavClick(int idx) {
        if (idx == 4) {
            startActivity(new Intent(this, LibraryActivity.class));
            return;
        }
        load(navUrls[idx]);
    }

    private void updateNav() {
        int active = -1;
        String key = Categories.categoryKey(currentUrl);
        if (!localPage && Archive.normalize(Categories.HOME.url).equals(currentUrl)) active = 0;
        else if ("bestiary".equals(key)) active = 1;
        else if ("spells".equals(key)) active = 2;
        else if ("items".equals(key)) active = 3;
        int accent = Ui.color(this, R.attr.dndAccent);
        int dim = Ui.color(this, R.attr.dndTextDim);
        for (int i = 0; i < navIconViews.length; i++) {
            if (navIconViews[i] == null) continue;
            navIconViews[i].setColorFilter(i == active ? accent : dim);
            navTextViews[i].setTextColor(i == active ? accent : dim);
        }
    }

    private void load(String url) {
        showingOffline = false;
        localPage = false;
        if (web != null) web.loadUrl(url);
    }

    private boolean handleIntent(Intent intent) {
        if (intent == null) return false;
        String archive = intent.getStringExtra(EXTRA_ARCHIVE);
        String source = intent.getStringExtra(EXTRA_SOURCE);
        if (archive != null) {
            localPage = true;
            originalUrl = source;
            if (source != null) currentUrl = Archive.normalize(source);
            showingOffline = false;
            if (web != null) web.loadUrl(archive);
            return true;
        }
        String open = intent.getStringExtra(EXTRA_OPEN);
        if (open != null) {
            load(open);
            return true;
        }
        Uri data = intent.getData();
        if (data != null) {
            String url = data.toString();
            if (WebUtils.isDnd(url)) {
                load(url);
                return true;
            }
        }
        return false;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    // ---------------------------------------------------------------- clients

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleUrl(request.getUrl().toString());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleUrl(url);
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            progress.setVisibility(View.VISIBLE);
            progress.setIndeterminate(true);
            if (url != null) {
                currentUrl = Archive.normalize(url);
                localPage = url.contains(Archive.LOCAL_HOST);
                if (!localPage) originalUrl = url;
            }
            updateNav();
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progress.setVisibility(View.GONE);
            if (offlineHtmlLoaded) {
                offlineHtmlLoaded = false;
                showingOffline = true;
                updateOfflineBar();
                return;
            }
            showingOffline = false;
            if (url != null) {
                currentUrl = Archive.normalize(url);
                localPage = url.contains(Archive.LOCAL_HOST);
                if (!localPage) {
                    originalUrl = url;
                    if (!WebUtils.isYandex(url)) Prefs.setLastUrl(MainActivity.this, url);
                }
            }
            if (localPage) {
                web.evaluateJavascript(Js.localize(MainActivity.this), null);
                String source = extractSource();
                if (source != null) originalUrl = source;
            } else if (!url.startsWith("data:") && !WebUtils.isYandex(url)) {
                applyPagePreferences(url);
            }
            updateMeta();
            updateNav();
            updateOfflineBar();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                showOffline(request.getUrl().toString());
            }
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            if (failingUrl != null && web != null && failingUrl.equals(web.getUrl())) {
                showOffline(failingUrl);
            }
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return serve(request.getUrl().toString());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return serve(url);
        }
    }

    private String extractSource() {
        String url = originalUrl;
        return url;
    }

    private void applyPagePreferences(String url) {
        if (Prefs.darkPages(this) && !url.equals(darkAppliedFor)) {
            darkAppliedFor = url;
            web.evaluateJavascript(Js.get(this, "dark"), null);
        }
        boolean article = url.matches(".*/\\d+-.*") || url.contains("/articles/");
        if (Prefs.readerMode(this) && article && !url.equals(readerAppliedFor)) {
            readerAppliedFor = url;
            web.evaluateJavascript(Js.reader(this), null);
        }
    }

    private WebResourceResponse serve(String url) {
        if (url == null) return null;
        Uri uri = Uri.parse(url);
        if (!Archive.LOCAL_HOST.equals(uri.getHost())) return null;
        String path = uri.getPath();
        java.io.File file = Archive.fileForPath(this, path);
        if (file == null) {
            return new WebResourceResponse("text/html", "UTF-8",
                    new java.io.ByteArrayInputStream(("<html><body style=\"font-family:sans-serif;padding:24px\">"
                            + "<h3>Страница не найдена в офлайн-архиве</h3>"
                            + "<p><a href=\"dndapp://library\">Открыть библиотеку</a></p></body></html>")
                            .getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        }
        try {
            InputStream in = new FileInputStream(file);
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-cache");
            WebResourceResponse response = new WebResourceResponse("text/html", "UTF-8", in);
            response.setResponseHeaders(headers);
            return response;
        } catch (Exception e) {
            return null;
        }
    }

    private boolean handleUrl(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        if (scheme.equals("dndapp")) {
            String what = uri.getHost() == null ? "" : uri.getHost();
            if (what.equals("retry")) {
                load(originalUrl != null ? originalUrl : HOME);
            } else if (what.equals("library")) {
                startActivity(new Intent(this, LibraryActivity.class));
            } else if (what.equals("save")) {
                saveCurrentPage();
            } else if (what.equals("home")) {
                load(HOME);
            }
            return true;
        }
        if (scheme.equals("javascript") || scheme.equals("about") || scheme.equals("blob")
                || scheme.equals("data")) {
            return false;
        }
        if (!scheme.equals("http") && !scheme.equals("https")) {
            openExternal(url);
            return true;
        }
        if (Archive.LOCAL_HOST.equals(uri.getHost())) return false;
        if (WebUtils.isDnd(url) || WebUtils.isYandex(url)) return false;
        openExternal(url);
        return true;
    }

    private void openExternal(String url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Ui.toast(this, "Не удалось открыть ссылку");
        } catch (Exception e) {
            Ui.toast(this, "Не удалось открыть ссылку");
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            if (newProgress < 100) {
                progress.setVisibility(View.VISIBLE);
                progress.setIndeterminate(false);
                progress.setMax(100);
                progress.setProgress(newProgress);
            } else {
                progress.setVisibility(View.GONE);
            }
        }

        @Override
        public void onReceivedTitle(WebView view, String title) {
            if (title != null && !title.trim().isEmpty()) {
                pageTitle = title;
                tvTitle.setText(title);
            }
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
            return true;
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, final android.webkit.JsResult result) {
            Ui.dialog(MainActivity.this).setTitle(pageTitle).setMessage(message)
                    .setPositiveButton("ОК", (d, w) -> result.confirm()).setOnCancelListener(d -> result.cancel())
                    .show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, final android.webkit.JsResult result) {
            Ui.dialog(MainActivity.this).setTitle(pageTitle).setMessage(message)
                    .setPositiveButton("ОК", (d, w) -> result.confirm())
                    .setNegativeButton("Отмена", (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel())
                    .show();
            return true;
        }

        @Override
        public boolean onShowFileChooser(WebView view, android.webkit.ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(null);
            }
            fileCallback = callback;
            try {
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                startActivityForResult(Intent.createChooser(intent, "Выберите файл"), REQ_FILE);
                return true;
            } catch (Exception e) {
                fileCallback = null;
                return false;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                Uri uri = (resultCode == RESULT_OK && data != null) ? data.getData() : null;
                fileCallback.onReceiveValue(uri == null ? null : new Uri[]{uri});
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ---------------------------------------------------------------- UI state

    private void updateMeta() {
        if (localPage) {
            tvSub.setText("Сохранённая копия · офлайн-библиотека");
        } else {
            Categories.Cat cat = Categories.forUrl(currentUrl);
            String section = cat == null ? "" : cat.title;
            tvSub.setText(section.isEmpty() ? WebUtils.shortHost(currentUrl) : section);
        }
        if (!pageTitle.isEmpty()) tvTitle.setText(pageTitle);
        if (btnSave != null) {
            boolean saved = !localPage && originalUrl != null && Archive.has(this, originalUrl);
            btnSave.setColorFilter(saved ? Ui.color(this, R.attr.dndAccent)
                    : Ui.color(this, R.attr.dndTopbarText));
        }
    }

    private void updateOfflineBar() {
        boolean online = WebUtils.isOnline(this);
        if (offlineBar != null) offlineBar.setVisibility(online ? View.GONE : View.VISIBLE);
        if (tvOffline != null && !online) tvOffline.setText(localPage ? "Офлайн-режим · сохранённая копия" : "Нет подключения к сети");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        if (Prefs.isDark(this) != darkTheme) {
            recreate();
            return;
        }
        updateOfflineBar();
        if (web != null && Prefs.textZoom(this) != web.getSettings().getTextZoom()) {
            web.getSettings().setTextZoom(Prefs.textZoom(this));
        }
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        SyncUi.destroyActive();
        YandexSearch.destroyActive();
        if (saveBridge != null) saveBridge.disarm();
        if (downloader != null) downloader.destroy();
        if (web != null) {
            try {
                web.stopLoading();
                web.destroy();
            } catch (Exception ignored) {
            }
        }
        super.onDestroy();
    }

    public void setTextZoom(int zoom) {
        if (web != null) web.getSettings().setTextZoom(zoom);
    }

    // ---------------------------------------------------------------- actions

    private void goBack() {
        if (web.canGoBack()) {
            web.goBack();
        } else if (!showingOffline) {
            long now = System.currentTimeMillis();
            if (now - lastBackPress < 2200) {
                finish();
            } else {
                lastBackPress = now;
                Ui.toast(this, "Нажмите «Назад» ещё раз, чтобы выйти");
            }
        }
    }

    @Override
    public void onBackPressed() {
        goBack();
    }

    private void saveCurrentPage() {
        if (web == null) return;
        if (localPage) {
            Ui.toast(this, "Это сохранённая копия. Откройте страницу онлайн, чтобы обновить её");
            return;
        }
        String url = web.getUrl();
        if (url == null || !WebUtils.isDnd(url)) {
            Ui.toast(this, "Эту страницу нельзя сохранить");
            return;
        }
        final AlertDialog dialog = Ui.progressDialog(this, "Сохранение страницы",
                "Подготавливаем страницу и изображения…", true, () -> saveBridge.disarm());
        dialog.show();
        restoreReaderDom();
        PageSaver.readMeta(web, (metaUrl, title) -> {
            final String finalUrl = metaUrl != null && WebUtils.isDnd(metaUrl) ? metaUrl : url;
            final String finalTitle = (title == null || title.trim().isEmpty()) ? pageTitle : title.trim();
            PageSaver.save(this, web, saveBridge, finalUrl, finalTitle,
                    Categories.categoryKey(finalUrl), new PageSaver.Result() {
                        @Override
                        public void onSaved(long bytes) {
                            if (dialog.isShowing()) dialog.dismiss();
                            Ui.toast(MainActivity.this, "Сохранено в офлайн-библиотеку · " + Ui.formatBytes(bytes));
                        }

                        @Override
                        public void onError(String message) {
                            if (dialog.isShowing()) dialog.dismiss();
                            Ui.toast(MainActivity.this, "Не удалось сохранить: " + message);
                        }
                    });
        });
    }

    private void restoreReaderDom() {
        try {
            web.evaluateJavascript("(function(){try{if(window.__dndReaderOriginal){"
                    + "document.body.innerHTML=window.__dndReaderOriginal;window.__dndReaderOriginal=null;"
                    + "var s=document.getElementById('dnd-reader-style');"
                    + "if(s&&s.parentNode)s.parentNode.removeChild(s);return 'ok';}return 'none';}"
                    + "catch(e){return 'err';}})()", null);
        } catch (Exception ignored) {
        }
    }

    private void toggleReader() {
        web.evaluateJavascript(Js.reader(this), value -> {
            boolean on = "\"on\"".equals(value) || "on".equals(value);
            Ui.toast(this, on ? "Режим чтения включён" : "Режим чтения выключен");
        });
    }

    private void shareLink() {
        String url = localPage ? originalUrl : currentUrl;
        if (url == null) url = HOME;
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, url);
        i.putExtra(Intent.EXTRA_SUBJECT, pageTitle);
        startActivity(Intent.createChooser(i, "Поделиться ссылкой"));
    }

    private void showMenu() {
        final AlertDialog[] holder = new AlertDialog[1];
        LinearLayout box = Ui.vertical(this);
        box.setPadding(0, Ui.dp(this, 4), 0, Ui.dp(this, 8));

        box.addView(Ui.menuRow(this, R.drawable.ic_library, "Офлайн-библиотека",
                Archive.count(this) + " стр. · " + Ui.formatBytes(Archive.totalBytes(this)),
                v -> {
                    dismiss(holder);
                    startActivity(new Intent(this, LibraryActivity.class));
                }));
        box.addView(Ui.menuRow(this, R.drawable.ic_search, "Поиск в Яндексе",
                "Заголовки и ссылки со всего домена dnd.su", v -> {
                    dismiss(holder);
                    SearchUi.show(this, syncHost, url -> load(url));
                }));
        box.addView(Ui.menuRow(this, R.drawable.ic_download, "Скачать раздел…",
                "Сохранить страницы для чтения без интернета", v -> {
                    dismiss(holder);
                    SyncUi.show(this, syncHost, () -> Ui.toast(this, "Библиотека обновлена"));
                }));
        box.addView(Ui.menuRow(this, R.drawable.ic_spell, "Режим чтения",
                "Оставить только текст статьи", v -> {
                    dismiss(holder);
                    toggleReader();
                }));
        final boolean darkPages = Prefs.darkPages(this);
        box.addView(Ui.menuRow(this, R.drawable.ic_moon, "Ночной режим страниц",
                darkPages ? "Включён" : "Выключен", v -> {
                    dismiss(holder);
                    Prefs.setDarkPages(this, !darkPages);
                    web.evaluateJavascript(Js.get(this, "dark"), null);
                    Ui.toast(this, !darkPages ? "Ночной режим включён" : "Ночной режим выключен");
                }));
        box.addView(Ui.menuRow(this, R.drawable.ic_settings, "Настройки",
                "Тема, размер текста, офлайн", v -> {
                    dismiss(holder);
                    startActivity(new Intent(this, SettingsActivity.class));
                }));
        box.addView(Ui.menuRow(this, R.drawable.ic_open, "Открыть в браузере", null, v -> {
            dismiss(holder);
            openExternal(localPage && originalUrl != null ? originalUrl : currentUrl);
        }));
        box.addView(Ui.menuRow(this, R.drawable.ic_share, "Поделиться ссылкой", null, v -> {
            dismiss(holder);
            shareLink();
        }));

        box.addView(Ui.sectionHeader(this, "Разделы сайта"));
        for (final Categories.Cat cat : new Categories.Cat[]{Categories.CLASSES, Categories.RACES,
                Categories.FEATS, Categories.BACKGROUNDS, Categories.ARTICLES}) {
            box.addView(Ui.menuRow(this, cat.icon, cat.title, null, v -> {
                dismiss(holder);
                load(cat.url);
            }));
        }
        box.addView(Ui.menuRow(this, R.drawable.ic_globe, "D&D 2024 · next.dnd.su",
                "Новая редакция правил", v -> {
                    dismiss(holder);
                    showNextMenu();
                }));

        ScrollView scroll = new ScrollView(this);
        scroll.addView(box);
        AlertDialog.Builder b = Ui.dialog(this);
        b.setTitle("D&D.su");
        b.setView(scroll);
        b.setNegativeButton("Закрыть", null);
        holder[0] = b.create();
        holder[0].show();
    }

    private void showNextMenu() {
        final String[] titles = new String[Categories.extraSections().size()];
        final String[] urls = new String[titles.length];
        for (int i = 0; i < titles.length; i++) {
            String[] item = Categories.extraSections().get(i);
            titles[i] = item[0];
            urls[i] = item[1];
        }
        Ui.dialog(this).setTitle("D&D 2024 (next.dnd.su)")
                .setItems(titles, (d, which) -> load(urls[which]))
                .setNegativeButton("Закрыть", null)
                .show();
    }

    private void dismiss(AlertDialog[] holder) {
        if (holder[0] != null && holder[0].isShowing()) holder[0].dismiss();
    }

    private void showOffline(String url) {
        if (url == null) url = currentUrl;
        showingOffline = true;
        offlineHtmlLoaded = true;
        boolean saved = Archive.has(this, url);
        String localLink = saved ? Archive.localUrl(url) : null;
        web.loadDataWithBaseURL("https://dnd.su/", offlineHtml(url, localLink),
                "text/html", "UTF-8", null);
        if (progress != null) progress.setVisibility(View.GONE);
        tvTitle.setText("Нет подключения");
        tvSub.setText("Офлайн-режим");
        updateOfflineBar();
    }

    private String offlineHtml(String url, String localLink) {
        String safeUrl = url == null ? "" : url.replace("&", "&amp;").replace("<", "&lt;");
        String savedBlock = localLink == null ? "" :
                "<a class=\"btn primary\" href=\"" + localLink + "\">Открыть сохранённую копию</a>";
        return "<!DOCTYPE html><html lang=\"ru\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<style>"
                + "body{margin:0;background:#15120e;color:#e8dcc8;font-family:-apple-system,Roboto,sans-serif;"
                + "display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}"
                + ".box{max-width:420px;width:100%;text-align:center}"
                + ".die{width:88px;height:88px;margin:0 auto 18px;border-radius:22px;background:#7E1A15;"
                + "display:flex;align-items:center;justify-content:center;font-size:40px;color:#f0c96a;font-weight:700;"
                + "box-shadow:0 10px 30px rgba(0,0,0,.45)}"
                + "h1{font-size:20px;margin:0 0 8px}"
                + "p{font-size:14px;line-height:1.5;color:#b9ab93;margin:0 0 8px}"
                + "code{font-size:11px;color:#8d8069;word-break:break-all}"
                + ".btn{display:block;margin:12px 0;padding:13px 16px;border-radius:12px;text-decoration:none;"
                + "font-size:15px;font-weight:600;background:#241d16;color:#e8dcc8;border:1px solid #3a3125}"
                + ".btn.primary{background:#8C1D18;color:#fff;border-color:#8C1D18}"
                + "</style></head><body><div class=\"box\">"
                + "<div class=\"die\">d20</div>"
                + "<h1>Нет подключения</h1>"
                + "<p>Не удалось загрузить страницу. Проверьте интернет или откройте сохранённую копию.</p>"
                + savedBlock
                + "<a class=\"btn\" href=\"dndapp://library\">Офлайн-библиотека</a>"
                + "<a class=\"btn\" href=\"dndapp://retry\">Повторить попытку</a>"
                + "<p style=\"margin-top:18px\"><code>" + safeUrl + "</code></p>"
                + "</div></body></html>";
    }
}
