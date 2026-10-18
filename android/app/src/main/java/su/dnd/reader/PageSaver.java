package su.dnd.reader;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

/** Saves the page currently rendered in a WebView into the offline archive. */
public final class PageSaver {

    public interface Result {
        void onSaved(long bytes);

        void onError(String message);
    }

    private PageSaver() {
    }

    public static void save(final Activity activity, final WebView webView, final SaveBridge bridge,
                            final String url, final String title, final String category,
                            final Result result) {
        final Handler handler = new Handler(Looper.getMainLooper());
        bridge.arm(url, title, category, bytes -> result.onSaved(bytes));
        try {
            webView.evaluateJavascript(Js.get(activity, "scroll"), null);
        } catch (Exception ignored) {
        }
        handler.postDelayed(() -> {
            if (activity.isFinishing()) {
                bridge.disarm();
                result.onError("Отменено");
                return;
            }
            try {
                webView.evaluateJavascript(Js.get(activity, "embed"), value -> waitForEmbed(activity, webView, bridge, result, handler, 0));
            } catch (Exception e) {
                bridge.disarm();
                result.onError("Не удалось обработать страницу");
            }
        }, 1100);
    }

    private static void waitForEmbed(final Activity activity, final WebView webView, final SaveBridge bridge,
                                     final Result result, final Handler handler, final int attempt) {
        if (!activity.isFinishing() && bridge.isArmed()) {
            if (attempt > 70) {
                bridge.disarm();
                result.onError("Страница слишком долго не отвечает");
                return;
            }
            webView.evaluateJavascript("(window.__dndEmbed && window.__dndEmbed.done) ? true : false",
                    value -> {
                        if ("true".equals(value)) {
                            try {
                                webView.evaluateJavascript(Js.get(activity, "save"), null);
                            } catch (Exception e) {
                                bridge.disarm();
                                result.onError("Не удалось сохранить страницу");
                                return;
                            }
                            handler.postDelayed(() -> {
                                if (bridge.isArmed()) {
                                    bridge.disarm();
                                    result.onError("Страница не передала данные");
                                }
                            }, 20000);
                        } else {
                            handler.postDelayed(() -> waitForEmbed(activity, webView, bridge, result, handler, attempt + 1), 450);
                        }
                    });
        }
    }

    /** Saves page metadata (title) using the WebView. */
    public static void readMeta(WebView webView, final MetaCallback cb) {
        try {
            webView.evaluateJavascript(Js.get(webView.getContext(), "meta"), value -> {
                String url = null;
                String title = null;
                try {
                    org.json.JSONObject o = new org.json.JSONObject(value);
                    url = o.optString("url", null);
                    title = o.optString("title", null);
                } catch (Exception ignored) {
                }
                cb.onMeta(url, title);
            });
        } catch (Exception e) {
            cb.onMeta(null, null);
        }
    }

    public interface MetaCallback {
        void onMeta(String url, String title);
    }
}
