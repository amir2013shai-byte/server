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

    private static final String[] TRACKING = {"ysclid", "yclid", "utm_source", "utm_medium",
            "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "from", "_openstat",
            "ref", "ref_src"};

    /** Normalizes a URL so the same page always maps to the same key. */
    public static String normalize(String url) {
        if (url == null) return "";
        String u = url;
        int hash = u.indexOf('#');
        if (hash >= 0) u = u.substring(0, hash);
        int q = u.indexOf('?');
        if (q >= 0) {
            String base = u.substring(0, q);
            String[] params = u.substring(q + 1).split("&");
            StringBuilder kept = new StringBuilder();
            for (String param : params) {
                if (param.isEmpty()) continue;
                String name = param;
                int eq = param.indexOf('=');
                if (eq >= 0) name = param.substring(0, eq);
                boolean drop = false;
                for (String t : TRACKING) {
                    if (t.equalsIgnoreCase(name)) {
                        drop = true;
                        break;
                    }
                }
                if (drop) continue;
                if (kept.length() > 0) kept.append('&');
                kept.append(param);
            }
            u = kept.length() == 0 ? base : base + "?" + kept;
        }
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
            writeText(c, hash, HtmlText.fromHtml(html));
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

    private static File textFile(Context c, String hash) {
        return new File(pagesDir(c), hash + ".txt");
    }

    private static void writeText(Context c, String hash, String text) {
        try (OutputStream out = new FileOutputStream(textFile(c, hash))) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {
        }
    }

    /** Plain text of a saved page. Older pages are converted on the fly and cached. */
    public static String text(Context c, Page page) {
        if (page == null) return "";
        File txt = textFile(c, page.hash);
        if (txt.isFile()) {
            try (InputStream in = new FileInputStream(txt)) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                return new String(bos.toByteArray(), StandardCharsets.UTF_8);
            } catch (Exception ignored) {
            }
        }
        String html = read(c, page.url);
        if (html == null) return "";
        String text = HtmlText.fromHtml(html);
        writeText(c, page.hash, text);
        return text;
    }

    public static final class Hit {
        public final Page page;
        public final String snippet;
        public final int count;

        Hit(Page page, String snippet, int count) {
            this.page = page;
            this.snippet = snippet;
            this.count = count;
        }
    }

    /** Full-text search over the saved pages. Runs on a background thread. */
    public static List<Hit> search(Context c, String query, int limit) {
        List<Hit> hits = new ArrayList<>();
        String q = HtmlText.fold(query == null ? "" : query.trim());
        if (q.length() < 2) return hits;
        for (Page page : pages(c)) {
            if (hits.size() >= limit) break;
            String text = text(c, page);
            if (text.isEmpty()) continue;
            String folded = HtmlText.fold(text);
            int count = 0;
            int first = -1;
            int from = 0;
            while (true) {
                int pos = folded.indexOf(q, from);
                if (pos < 0) break;
                if (first < 0) first = pos;
                count++;
                if (count > 200) break;
                from = pos + q.length();
            }
            if (count == 0) continue;
            hits.add(new Hit(page, snippet(text, first, q.length()), count));
        }
        Collections.sort(hits, new Comparator<Hit>() {
            @Override
            public int compare(Hit a, Hit b) {
                if (a.count != b.count) return b.count - a.count;
                return Long.compare(b.page.savedAt, a.page.savedAt);
            }
        });
        return hits;
    }

    private static String snippet(String text, int pos, int length) {
        if (pos < 0) return "";
        int start = Math.max(0, pos - 60);
        int end = Math.min(text.length(), pos + length + 110);
        String part = text.substring(start, end).replace('\n', ' ');
        part = part.replaceAll("\\s+", " ").trim();
        return (start > 0 ? "…" : "") + part + (end < text.length() ? "…" : "");
    }

    /** Removes index entries whose page file is gone (e.g. after an interrupted save). */
    public static int pruneBroken(Context c) {
        synchronized (LOCK) {
            JSONObject index = readIndex(c);
            List<String> broken = new ArrayList<>();
            Iterator<String> keys = index.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                JSONObject o = index.optJSONObject(key);
                String hash = o == null ? hash(key) : o.optString("h", hash(key));
                File html = new File(pagesDir(c), hash + ".html");
                if (!html.isFile() || html.length() < 100) broken.add(key);
            }
            for (String key : broken) index.remove(key);
            if (!broken.isEmpty()) writeIndex(c, index);
            return broken.size();
        }
    }

    /** True when the saved copy of the page exists on disk. */
    public static boolean fileExists(Context c, Page page) {
        return page != null && new File(pagesDir(c), page.hash + ".html").isFile();
    }

    /** Human readable category label for a page. */
    public static String categoryTitle(Context c, String key) {
        return Categories.titleOf(key);
    }
}
