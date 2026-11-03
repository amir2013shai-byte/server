package su.dnd.reader;

import android.content.Context;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Builds export files of the offline library: one merged HTML or a ZIP with separate pages. */
public final class Export {

    private static final Pattern BODY = Pattern.compile("(?is)<body\\b[^>]*>(.*)</body\\s*>");
    private static final Pattern SCRIPT = Pattern.compile("(?is)<script\\b[^>]*>.*?</script\\s*>");
    private static final Pattern STYLE = Pattern.compile("(?is)<style\\b[^>]*>.*?</style\\s*>");

    private Export() {
    }

    public static File dir(Context c) {
        File d = new File(c.getCacheDir(), "exports");
        if (!d.exists()) //noinspection ResultOfMethodCallIgnored
            d.mkdirs();
        return d;
    }

    private static String stamp() {
        return new SimpleDateFormat("yyyy-MM-dd_HH-mm", Locale.US).format(new Date());
    }

    /** One self-contained HTML file with a table of contents. */
    public static File mergedHtml(Context c, List<Archive.Page> pages) throws Exception {
        File out = new File(dir(c), "dndsu-offline-" + stamp() + ".html");
        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html><html lang=\"ru\"><head><meta charset=\"utf-8\">")
                .append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
                .append("<title>D&amp;D.su — офлайн-библиотека</title><style>")
                .append("body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:900px;")
                .append("margin:0 auto;padding:24px;line-height:1.6;color:#221a11;background:#fdfaf4}")
                .append("h1,h2{line-height:1.25}h2{margin-top:2.5em;padding-top:1em;border-top:2px solid #d9a441}")
                .append("img{max-width:100%;height:auto}a{color:#8c1d18}")
                .append(".toc a{display:block;padding:3px 0;text-decoration:none}")
                .append(".toc{columns:2;column-gap:32px}.meta{color:#6f6354;font-size:12px}")
                .append("table{border-collapse:collapse;width:100%}td,th{border:1px solid #dfd4c1;padding:6px}")
                .append("@media print{.toc{columns:1}body{background:#fff}h2{page-break-before:always}}")
                .append("</style></head><body>");
        sb.append("<h1>D&amp;D.su — офлайн-библиотека</h1>");
        sb.append("<p class=\"meta\">Страниц: ").append(pages.size()).append(" · выгружено ")
                .append(new SimpleDateFormat("d MMMM yyyy, HH:mm", new Locale("ru")).format(new Date()))
                .append("</p><div class=\"toc\">");
        for (int i = 0; i < pages.size(); i++) {
            sb.append("<a href=\"#p").append(i).append("\">").append(escape(pages.get(i).title)).append("</a>");
        }
        sb.append("</div>");
        for (int i = 0; i < pages.size(); i++) {
            Archive.Page page = pages.get(i);
            String html = Archive.read(c, page.url);
            if (html == null) continue;
            sb.append("<h2 id=\"p").append(i).append("\">").append(escape(page.title)).append("</h2>");
            sb.append("<p class=\"meta\">").append(escape(page.url)).append(" · ")
                    .append(escape(Categories.titleOf(page.category))).append("</p>");
            String body = bodyOf(html);
            sb.append(body);
        }
        sb.append("</body></html>");
        write(out, sb.toString());
        return out;
    }

    /** ZIP archive: index.html with links plus one HTML file per page. */
    public static File zip(Context c, List<Archive.Page> pages) throws Exception {
        File out = new File(dir(c), "dndsu-offline-" + stamp() + ".zip");
        try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(out))) {
            StringBuilder index = new StringBuilder();
            index.append("<!DOCTYPE html><html lang=\"ru\"><head><meta charset=\"utf-8\">")
                    .append("<title>D&amp;D.su — офлайн-библиотека</title><style>")
                    .append("body{font-family:sans-serif;max-width:760px;margin:0 auto;padding:24px;")
                    .append("line-height:1.6;background:#fdfaf4;color:#221a11}a{color:#8c1d18}")
                    .append("</style></head><body><h1>Офлайн-библиотека D&amp;D.su</h1>")
                    .append("<p>Страниц: ").append(pages.size()).append("</p><ol>");
            int saved = 0;
            for (Archive.Page page : pages) {
                String html = Archive.read(c, page.url);
                if (html == null) continue;
                String name = String.format(Locale.US, "%03d-%s.html", saved + 1, slug(page.title));
                zos.putNextEntry(new ZipEntry(name));
                zos.write(html.getBytes(StandardCharsets.UTF_8));
                zos.closeEntry();
                index.append("<li><a href=\"").append(name).append("\">")
                        .append(escape(page.title)).append("</a> <span style=\"color:#6f6354;font-size:12px\">")
                        .append(escape(Categories.titleOf(page.category))).append("</span></li>");
                saved++;
            }
            index.append("</ol></body></html>");
            zos.putNextEntry(new ZipEntry("index.html"));
            zos.write(index.toString().getBytes(StandardCharsets.UTF_8));
            zos.closeEntry();
        }
        return out;
    }

    private static String bodyOf(String html) {
        String body = html;
        Matcher m = BODY.matcher(html);
        if (m.find()) body = m.group(1);
        body = SCRIPT.matcher(body).replaceAll(" ");
        body = STYLE.matcher(body).replaceAll(" ");
        return body;
    }

    private static void write(File file, String content) throws Exception {
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static String slug(String title) {
        String s = HtmlText.fold(title == null ? "page" : title)
                .replaceAll("[^a-z0-9а-я\\s-]", "")
                .replaceAll("\\s+", "-");
        if (s.length() > 48) s = s.substring(0, 48);
        return s.isEmpty() ? "page" : s;
    }

    static String escape(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
