package su.dnd.reader;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Loads the JavaScript snippets stored in assets/js. */
public final class Js {
    private static final Map<String, String> CACHE = new HashMap<>();

    private Js() {
    }

    public static String get(Context c, String name) {
        synchronized (CACHE) {
            if (CACHE.containsKey(name)) return CACHE.get(name);
            try (InputStream in = c.getAssets().open("js/" + name + ".js")) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                String js = new String(bos.toByteArray(), StandardCharsets.UTF_8);
                CACHE.put(name, js);
                return js;
            } catch (Exception e) {
                return "";
            }
        }
    }

    public static String localize(Context c) {
        return get(c, "localize").replace("__MAP__", Archive.localMapJson(c));
    }

    public static String reader(Context c) {
        boolean dark = Prefs.isDark(c);
        return get(c, "reader").replace("__DARK__", dark ? "true" : "false");
    }

    public static String find(Context c, String query) {
        String safe = query == null ? "" : query.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", " ").replace("\r", " ");
        return get(c, "find").replace("__QUERY__", "\"" + safe + "\"");
    }
}
