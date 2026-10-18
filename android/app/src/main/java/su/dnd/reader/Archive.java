package su.dnd.reader;

import android.content.Context;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;

/** On-device store for pages saved for offline reading. */
public final class Archive {

    public static final String LOCAL_HOST = "appassets.androidplatform.net";
    private static final Object LOCK = new Object();

    public static final class Page {
        public String url;
        public String title;
        public String category;
        public long savedAt;
        public long bytes;
        public String hash;

        public String localUrl() {
            return "https://" + LOCAL_HOST + "/archive/" + hash + ".html";
        }
    }

    private Archive() {
    }

    public static File root(Context c) {
        File f = new File(c.getFilesDir(), "archive");
        if (!f.exists()) //noinspection ResultOfMethodCallIgnored
            f.mkdirs();
        return f;
    }

    private static File pagesDir(Context c) {
        File f = new File(root(c), "pages");
        if (!f.exists()) //noinspection ResultOfMethodCallIgnored
            f.mkdirs();
        return f;
    }

    private static File indexFile(Context c) {
        return new File(root(c), "index.json");
    }

    public static String hash(String url) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] d = md.digest(normalize(url).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(url.hashCode());
        }
    }

    /** Normalizes a URL so the same page always maps to the same key. */
    public static String normalize(String url) {
        if (url == null) return "";
        String u = url;
        int hash = u.indexOf('#');
        if (hash >= 0) u = u.substring(0, hash);
        if (u.endsWith("/") && u.length() > "https://x/".length()) u = u.substring(0, u.length() - 1);
        return u;
    }

    private static JSONObject readIndex(Context c) {
        synchronized (LOCK) {
            File f = indexFile(c);
            if (!f.exists()) return new JSONObject();
            try (InputStream in = new FileInputStream(f)) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                return new JSONObject(new String(bos.toByteArray(), StandardCharsets.UTF_8));
            } catch (Exception e) {
                return new JSONObject();
            }
        }
    }

    private static void writeIndex(Context c, JSONObject index) {
        synchronized (LOCK) {
            try (OutputStream out = new FileOutputStream(indexFile(c))) {
                out.write(index.toString().getBytes(StandardCharsets.UTF_8));
            } catch (Exception ignored) {
            }
        }
    }

    public static boolean has(Context c, String url) {
        return readIndex(c).has(normalize(url));
    }

    public static Page get(Context c, String url) {
        JSONObject index = readIndex(c);
        JSONObject o = index.optJSONObject(normalize(url));
        if (o == null) return null;
        return toPage(normalize(url), o);
    }

    private static Page toPage(String url, JSONObject o) {
        Page p = new Page();
        p.url = url;
        p.title = o.optString("t", url);
        p.category = o.optString("c", "other");
        p.savedAt = o.optLong("ts", 0);
        p.bytes = o.optLong("s", 0);
        p.hash = o.optString("h", hash(url));
        return p;
    }

    public static void put(Context c, String url, String title, String category, String html) {
        synchronized (LOCK) {
            String key = normalize(url);
            String hash = hash(key);
            File file = new File(pagesDir(c), hash + ".html");
            try (OutputStream out = new FileOutputStream(file)) {
                out.write(html.getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) {
                return;
            }
            JSONObject index = readIndex(c);
            JSONObject o = new JSONObject();
            try {
                o.put("t", title == null || title.trim().isEmpty() ? key : title.trim());
                o.put("c", category == null ? "other" : category);
                o.put("ts", System.currentTimeMillis());
                o.put("s", file.length());
                o.put("h", hash);
                index.put(key, o);
            } catch (Exception ignored) {
            }
            writeIndex(c, index);
        }
    }

    public static String read(Context c, String url) {
        String hash = hash(normalize(url));
        File f = new File(pagesDir(c), hash + ".html");
        if (!f.exists()) return null;
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return new String(bos.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    public static void delete(Context c, String url) {
        String key = normalize(url);
        Page p = get(c, url);
        if (p != null) {
            File f = new File(pagesDir(c), p.hash + ".html");
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
        JSONObject index = readIndex(c);
        index.remove(key);
        writeIndex(c, index);
    }

    public static void clear(Context c) {
        File[] files = pagesDir(c).listFiles();
        if (files != null) {
            for (File f : files) //noinspection ResultOfMethodCallIgnored
                f.delete();
        }
        writeIndex(c, new JSONObject());
    }

    public static List<Page> pages(Context c) {
        JSONObject index = readIndex(c);
        List<Page> list = new ArrayList<>();
        Iterator<String> it = index.keys();
        while (it.hasNext()) {
            String url = it.next();
            JSONObject o = index.optJSONObject(url);
            if (o != null) list.add(toPage(url, o));
        }
        Collections.sort(list, new Comparator<Page>() {
            @Override
            public int compare(Page a, Page b) {
                return Long.compare(b.savedAt, a.savedAt);
            }
        });
        return list;
    }

    public static int count(Context c) {
        return readIndex(c).length();
    }

    public static long totalBytes(Context c) {
        long total = 0;
        File[] files = pagesDir(c).listFiles();
        if (files != null) {
            for (File f : files) total += f.length();
        }
        return total;
    }

    public static String localUrl(String url) {
        return "https://" + LOCAL_HOST + "/archive/" + hash(normalize(url)) + ".html";
    }

    /** key: local archive path -> page, used by the interceptor. */
    public static File fileForPath(Context c, String path) {
        if (path == null) return null;
        String prefix = "/archive/";
        if (!path.startsWith(prefix)) return null;
        String name = path.substring(prefix.length());
        if (!name.matches("[0-9a-f]{8,40}\\.html")) return null;
        File f = new File(pagesDir(c), name);
        return f.isFile() ? f : null;
    }

    public static String mimeFor(String path) {
        if (path == null) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "text/html";
    }

    /** JSON map (url -> local url) injected into saved pages so links between them work offline. */
    public static String localMapJson(Context c) {
        JSONObject map = new JSONObject();
        try {
            for (Page p : pages(c)) {
                map.put(p.url, p.localUrl());
                map.put(p.url + "/", p.localUrl());
            }
        } catch (Exception ignored) {
        }
        return map.toString();
    }

    /** Human readable category label for a page. */
    public static String categoryTitle(Context c, String key) {
        return Categories.titleOf(key);
    }
}
