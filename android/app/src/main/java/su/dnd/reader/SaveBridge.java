package su.dnd.reader;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

/** JS bridge that receives the serialized HTML of a page from the WebView. */
public final class SaveBridge {

    public interface Callback {
        void onSaved(long bytes);
    }

    private final Activity activity;
    private final WebView webView;
    private volatile String pendingUrl;
    private volatile String pendingTitle;
    private volatile String pendingCategory;
    private volatile boolean armed;
    private volatile boolean delivered;
    private volatile Callback callback;

    public SaveBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    public void register() {
        webView.addJavascriptInterface(this, "DndBridge");
    }

    public void arm(String url, String title, String category, Callback cb) {
        pendingUrl = Archive.normalize(url);
        pendingTitle = title;
        pendingCategory = category;
        callback = cb;
        delivered = false;
        armed = true;
    }

    public void disarm() {
        armed = false;
        delivered = true;
        pendingUrl = null;
        callback = null;
    }

    public boolean isArmed() {
        return armed && !delivered;
    }

    @JavascriptInterface
    public void save(String html) {
        if (!armed || delivered) return;
        if (html == null || html.length() < 100) return;
        delivered = true;
        final String url = pendingUrl;
        final String title = pendingTitle;
        final String category = pendingCategory;
        final Callback cb = callback;
        Archive.put(activity, url, title, category, html);
        long bytes = 0;
        Archive.Page p = Archive.get(activity, url);
        if (p != null) bytes = p.bytes;
        final long size = bytes;
        if (cb != null) {
            activity.runOnUiThread(() -> {
                armed = false;
                cb.onSaved(size);
            });
        }
    }

    @JavascriptInterface
    public void log(String message) {
        // used only for debugging; intentionally ignored
    }
}
