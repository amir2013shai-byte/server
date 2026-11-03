package su.dnd.reader;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.os.Build;
import android.webkit.WebSettings;
import android.webkit.WebView;

import java.net.URI;

/** WebView and network helpers. */
public final class WebUtils {

    private WebUtils() {
    }

    public static void configure(WebView web, boolean forDownloads) {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (!forDownloads) {
            s.setTextZoom(Prefs.textZoom(web.getContext()));
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            try {
                if ((web.getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                    WebView.setWebContentsDebuggingEnabled(true);
                }
            } catch (Exception ignored) {
            }
        }
        web.setBackgroundColor(0xFF000000);
    }

    public static boolean isOnline(Context c) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network network = cm.getActiveNetwork();
                if (network == null) return false;
                NetworkCapabilities caps = cm.getNetworkCapabilities(network);
                return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            }
            NetworkInfo info = cm.getActiveNetworkInfo();
            return info != null && info.isConnected();
        } catch (Exception e) {
            return true;
        }
    }

    public static String host(String url) {
        try {
            String h = new URI(url).getHost();
            return h == null ? "" : h;
        } catch (Exception e) {
            return "";
        }
    }

    public static boolean isYandex(String url) {
        String h = host(url).toLowerCase();
        if (h.isEmpty()) return false;
        return h.equals("yandex.ru") || h.endsWith(".yandex.ru")
                || h.equals("yandex.com") || h.endsWith(".yandex.com")
                || h.equals("yandex.net") || h.endsWith(".yandex.net")
                || h.equals("ya.ru") || h.endsWith(".ya.ru");
    }

    public static boolean isDnd(String url) {
        String h = host(url).toLowerCase();
        return h.equals("dnd.su") || h.endsWith(".dnd.su") || h.equals("dnd.su");
    }

    public static boolean isHttp(String url) {
        return url != null && (url.startsWith("http://") || url.startsWith("https://"));
    }

    public static String shortHost(String url) {
        String h = host(url);
        return h.isEmpty() ? "" : h;
    }
}
