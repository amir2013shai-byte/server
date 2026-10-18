package su.dnd.reader;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Downloads a whole section (index page + individual article pages) into the offline archive.
 * Uses a hidden WebView so that images and styles are embedded exactly like the user sees them.
 */
public class Downloader {

    public interface Listener {
        void onProgress(int done, int total, String message);

        void onFinished(int saved, int failed, String error);
    }

    private interface LoadCb {
        void onLoad(boolean ok);
    }

    private final Activity activity;
    private final ViewGroup host;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView web;
    private SaveBridge bridge;
    private WebViewClient client;

    private Categories.Cat cat;
    private Listener listener;
    private int limit;
    private boolean details;
    private int total;
    private int done;
    private int failed;
    private int index;
    private List<String> queue = new ArrayList<>();
    private boolean cancelled;
    private boolean finished;
    private boolean loading;
    private boolean destroyed;
    private LoadCb loadCb;
    private String expectedUrl;

    private final Runnable loadTimeout = () -> onLoadResult(false);

    public Downloader(Activity activity, ViewGroup host) {
        this.activity = activity;
        this.host = host;
        createWebView();
    }

    private void createWebView() {
        web = new WebView(activity);
        web.setAlpha(0.02f);
        web.setTranslationX(-30000f);
        web.setTranslationY(-30000f);
        web.setLayoutParams(new ViewGroup.LayoutParams(480, 800));
        WebUtils.configure(web, true);
        host.addView(web);
        bridge = new SaveBridge(activity, web);
        bridge.register();
        client = new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                view.clearHistory();
                if (!loading) return;
                handler.removeCallbacks(loadTimeout);
                handler.postDelayed(() -> onLoadResult(true), 1100);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (loading && request.isForMainFrame()) {
                    handler.removeCallbacks(loadTimeout);
                    handler.postDelayed(() -> onLoadResult(false), 250);
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (loading && expectedUrl != null && expectedUrl.equals(failingUrl)) {
                    handler.removeCallbacks(loadTimeout);
                    handler.postDelayed(() -> onLoadResult(false), 250);
                }
            }
        };
        web.setWebViewClient(client);
    }

    public void start(Categories.Cat category, int limit, boolean includeDetails, Listener listener) {
        if (destroyed) return;
        this.cat = category;
        this.limit = Math.max(0, limit);
        this.details = includeDetails;
        this.listener = listener;
        this.total = 1;
        this.done = 0;
        this.failed = 0;
        this.index = 0;
        this.queue = new ArrayList<>();
        this.cancelled = false;
        this.finished = false;
        progress("Открываем раздел «" + category.title + "»…");
        load(category.url, ok -> {
            if (!ok) {
                finish("Нет соединения с dnd.su. Проверьте подключение к интернету.");
                return;
            }
            saveIndex();
        });
    }

    private void saveIndex() {
        progress("Сохраняем страницу раздела…");
        PageSaver.readMeta(web, (url, title) -> {
            final String finalTitle = (title == null || title.trim().isEmpty()) ? cat.title : title.trim();
            PageSaver.save(activity, web, bridge, cat.url, finalTitle, cat.key, new PageSaver.Result() {
                @Override
                public void onSaved(long bytes) {
                    done = 1;
                    progress("Раздел сохранён");
                    if (details && limit > 0) {
                        expandAndCollect();
                    } else {
                        finish(null);
                    }
                }

                @Override
                public void onError(String message) {
                    failed++;
                    if (details && limit > 0) {
                        expandAndCollect();
                    } else {
                        finish(null);
                    }
                }
            });
        });
    }

    /** Scrolls the list page and clicks "load more" so more links become available. */
    private void expandAndCollect() {
        progress("Ищем страницы раздела…");
        try {
            web.evaluateJavascript(Js.get(activity, "scroll"), null);
        } catch (Exception ignored) {
        }
        handler.postDelayed(() -> {
            try {
                web.evaluateJavascript(Js.get(activity, "expand"), null);
            } catch (Exception ignored) {
            }
        }, 1200);
        handler.postDelayed(() -> {
            try {
                web.evaluateJavascript(Js.get(activity, "scroll"), null);
            } catch (Exception ignored) {
            }
        }, 2600);
        handler.postDelayed(this::collectLinks, 4200);
    }

    private void collectLinks() {
        if (finished) return;
        try {
            web.evaluateJavascript(Js.get(activity, "collect"), value -> {
                if (finished) return;
                List<String> found = new ArrayList<>();
                Set<String> seen = new HashSet<>();
                try {
                    JSONArray arr = new JSONArray(value == null ? "[]" : value);
                    for (int i = 0; i < arr.length() && found.size() < limit; i++) {
                        JSONArray pair = arr.optJSONArray(i);
                        if (pair == null) continue;
                        String u = pair.optString(0, "");
                        if (u.isEmpty()) continue;
                        String norm = Archive.normalize(u);
                        if (!WebUtils.isDnd(norm)) continue;
                        if (norm.equals(Archive.normalize(cat.url))) continue;
                        if (!cat.isDetail(norm)) continue;
                        if (seen.contains(norm)) continue;
                        if (Archive.has(activity, norm)) continue;
                        seen.add(norm);
                        found.add(norm);
                    }
                } catch (Exception ignored) {
                }
                queue = found;
                total = 1 + queue.size();
                index = 0;
                if (queue.isEmpty()) {
                    finish(null);
                } else {
                    progress("Найдено страниц: " + queue.size());
                    next();
                }
            });
        } catch (Exception e) {
            finish("Не удалось получить список страниц");
        }
    }

    private void next() {
        if (finished) return;
        if (cancelled) {
            finish("Скачивание отменено");
            return;
        }
        if (index >= queue.size()) {
            finish(null);
            return;
        }
        final String url = queue.get(index);
        progress("Открываем " + (done + failed + 1) + " из " + total + "…");
        load(url, ok -> {
            if (!ok) {
                failed++;
                index++;
                next();
                return;
            }
            saveDetail(url);
        });
    }

    private void saveDetail(final String url) {
        PageSaver.readMeta(web, (metaUrl, title) -> {
            final String finalTitle = (title == null || title.trim().isEmpty())
                    ? titleFromUrl(url) : title.trim();
            progress("Сохраняем: " + Ui.ellipsize(finalTitle, 40));
            PageSaver.save(activity, web, bridge, url, finalTitle, cat.key, new PageSaver.Result() {
                @Override
                public void onSaved(long bytes) {
                    done++;
                    index++;
                    next();
                }

                @Override
                public void onError(String message) {
                    failed++;
                    index++;
                    next();
                }
            });
        });
    }

    private void load(String url, LoadCb cb) {
        if (finished || destroyed) return;
        loading = true;
        loadCb = cb;
        expectedUrl = url;
        handler.removeCallbacks(loadTimeout);
        handler.postDelayed(loadTimeout, 35000);
        try {
            web.loadUrl(url);
        } catch (Exception e) {
            onLoadResult(false);
        }
    }

    private void onLoadResult(boolean ok) {
        if (!loading) return;
        loading = false;
        LoadCb cb = loadCb;
        loadCb = null;
        if (cb != null) cb.onLoad(ok);
    }

    private void progress(String message) {
        if (listener != null && !finished) {
            listener.onProgress(done, total, message);
        }
    }

    public void cancel() {
        if (finished) return;
        cancelled = true;
        finish("Скачивание отменено");
    }

    private void finish(String error) {
        if (finished) return;
        finished = true;
        loading = false;
        handler.removeCallbacksAndMessages(null);
        try {
            bridge.disarm();
            web.stopLoading();
        } catch (Exception ignored) {
        }
        if (listener != null) listener.onFinished(done, failed, error);
        handler.postDelayed(this::destroy, 600);
    }

    /** Immediately destroys the hidden WebView. */
    public void destroy() {
        if (destroyed) return;
        destroyed = true;
        finished = true;
        handler.removeCallbacksAndMessages(null);
        try {
            if (bridge != null) bridge.disarm();
            if (web != null) {
                ViewGroup parent = (ViewGroup) web.getParent();
                if (parent != null) parent.removeView(web);
                web.loadUrl("about:blank");
                web.destroy();
                web = null;
            }
        } catch (Exception ignored) {
        }
    }

    private static String titleFromUrl(String url) {
        try {
            String path = new java.net.URI(url).getPath();
            if (path == null) return url;
            String[] parts = path.split("/");
            String slug = parts[parts.length - 1];
            slug = slug.replaceFirst("^\\d+-", "").replace('-', ' ');
            if (slug.isEmpty()) return url;
            return Character.toUpperCase(slug.charAt(0)) + slug.substring(1);
        } catch (Exception e) {
            return url;
        }
    }
}
