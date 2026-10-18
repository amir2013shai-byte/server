package su.dnd.reader;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;

/**
 * Searches the whole dnd.su domain through Yandex.
 * The search page is loaded in a hidden WebView, the result links and titles are read from the DOM
 * by assets/js/yandex.js, so the user gets a clean list of pages instead of the search engine UI.
 */
public class YandexSearch {

    public static final class Result {
        public final String url;
        public final String title;

        Result(String url, String title) {
            this.url = url;
            this.title = title;
        }
    }

    public interface Callback {
        /** Empty list + captcha=true means Yandex asked to confirm that the user is not a robot. */
        void onResults(List<Result> results, boolean captcha, String searchUrl);

        void onError(String message, String searchUrl);
    }

    private static final int MAX_PARSE_STEPS = 7;
    private static final long PARSE_DELAY_MS = 900;
    private static final long FIRST_PARSE_DELAY_MS = 1300;
    private static final long TIMEOUT_MS = 30000;

    private final Activity activity;
    private final ViewGroup host;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private static YandexSearch active;

    private WebView web;
    private Callback callback;
    private String searchUrl = "";
    private boolean loading;
    private boolean finished;
    private int step;

    public YandexSearch(Activity activity, ViewGroup host) {
        this.activity = activity;
        this.host = host;
    }

    /** Yandex query that is limited to the dnd.su domain (subdomains such as next.dnd.su included). */
    public static String buildUrl(String query) {
        String text = "site:dnd.su " + (query == null ? "" : query.trim());
        try {
            text = URLEncoder.encode(text, "UTF-8");
        } catch (Exception e) {
            text = text.replace(" ", "+");
        }
        return "https://yandex.ru/search/?text=" + text;
    }

    public void search(String query, Callback cb) {
        cancel();
        active = this;
        this.callback = cb;
        this.searchUrl = buildUrl(query);
        this.loading = true;
        this.finished = false;
        this.step = 0;
        createWebView();
        handler.postDelayed(timeout, TIMEOUT_MS);
        try {
            web.loadUrl(searchUrl);
        } catch (Exception e) {
            fail("Не удалось открыть Яндекс. Проверьте подключение к интернету.");
        }
    }

    private void createWebView() {
        web = new WebView(activity);
        web.setAlpha(0.02f);
        web.setTranslationX(-30000f);
        web.setTranslationY(-30000f);
        web.setLayoutParams(new ViewGroup.LayoutParams(480, 800));
        WebUtils.configure(web, true);
        try {
            String ua = WebSettings.getDefaultUserAgent(activity);
            ua = ua.replace("; wv", "").replaceAll("Version/\\d+(\\.\\d+)* ", "");
            web.getSettings().setUserAgentString(ua);
        } catch (Exception ignored) {
        }
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (finished || !loading) return;
                handler.removeCallbacks(parse);
                handler.postDelayed(parse, FIRST_PARSE_DELAY_MS);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    fail("Нет соединения с Яндексом. Проверьте подключение к интернету.");
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (loading && searchUrl.equals(failingUrl)) {
                    fail("Нет соединения с Яндексом. Проверьте подключение к интернету.");
                }
            }
        });
        host.addView(web);
    }

    private final Runnable timeout = () -> fail("Яндекс не ответил за 30 секунд. Попробуйте ещё раз.");

    private final Runnable parse = this::parseStep;

    private void parseStep() {
        if (finished || web == null) return;
        try {
            web.evaluateJavascript(Js.get(activity, "yandex"), value -> {
                if (finished) return;
                JSONObject page = toJson(value);
                if (page != null) {
                    List<Result> items = new ArrayList<>();
                    JSONArray arr = page.optJSONArray("items");
                    if (arr != null) {
                        for (int i = 0; i < arr.length(); i++) {
                            JSONObject it = arr.optJSONObject(i);
                            if (it == null) continue;
                            String url = it.optString("url", "");
                            String title = it.optString("title", "");
                            if (url.isEmpty() || title.isEmpty()) continue;
                            if (!WebUtils.isDnd(url)) continue;
                            items.add(new Result(url, title));
                        }
                    }
                    if (!items.isEmpty()) {
                        finish(items, false);
                        return;
                    }
                    if (page.optBoolean("captcha", false)) {
                        finish(new ArrayList<>(), true);
                        return;
                    }
                }
                step++;
                if (step < MAX_PARSE_STEPS) {
                    handler.postDelayed(parse, PARSE_DELAY_MS);
                } else {
                    String url = web == null ? "" : web.getUrl();
                    finish(new ArrayList<>(), url != null && url.toLowerCase().contains("captcha"));
                }
            });
        } catch (Exception e) {
            fail("Не удалось прочитать результаты поиска.");
        }
    }

    /** evaluateJavascript returns a JSON encoded string; the script therefore returns a string. */
    private static JSONObject toJson(String value) {
        if (value == null) return null;
        String raw = value;
        try {
            JSONArray wrapper = new JSONArray("[" + value + "]");
            Object first = wrapper.opt(0);
            if (first instanceof JSONObject) return (JSONObject) first;
            if (first != null && first != JSONObject.NULL) raw = String.valueOf(first);
        } catch (Exception ignored) {
        }
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    private void finish(List<Result> items, boolean captcha) {
        if (finished) return;
        finished = true;
        loading = false;
        if (active == this) active = null;
        handler.removeCallbacksAndMessages(null);
        Callback cb = callback;
        callback = null;
        stop();
        if (cb != null) cb.onResults(items, captcha, searchUrl);
    }

    private void fail(String message) {
        if (finished) return;
        finished = true;
        loading = false;
        if (active == this) active = null;
        handler.removeCallbacksAndMessages(null);
        Callback cb = callback;
        callback = null;
        stop();
        if (cb != null) cb.onError(message, searchUrl);
    }

    /** Stops the running search and releases the hidden WebView. */
    public void cancel() {
        finished = true;
        loading = false;
        callback = null;
        if (active == this) active = null;
        handler.removeCallbacksAndMessages(null);
        stop();
    }

    /** Stops the search that is currently running (used when the activity is destroyed). */
    public static void destroyActive() {
        YandexSearch search = active;
        active = null;
        if (search != null) search.cancel();
    }

    private void stop() {
        try {
            if (web != null) {
                ViewGroup parent = (ViewGroup) web.getParent();
                if (parent != null) parent.removeView(web);
                web.stopLoading();
                web.loadUrl("about:blank");
                web.destroy();
                web = null;
            }
        } catch (Exception ignored) {
        }
    }
}
