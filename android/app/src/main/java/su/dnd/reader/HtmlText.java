package su.dnd.reader;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Very small HTML to plain text converter used for the offline full-text index.
 * No third-party libraries: the saved pages are ordinary HTML with data: images.
 */
public final class HtmlText {

    private static final Pattern REMOVE_BLOCKS = Pattern.compile(
            "(?is)<(script|style|noscript|template|svg)\\b[^>]*>.*?</\\1\\s*>");
    private static final Pattern REMOVE_HEAD = Pattern.compile("(?is)<head\\b[^>]*>.*?</head\\s*>");
    private static final Pattern COMMENT = Pattern.compile("(?s)<!--.*?-->");
    private static final Pattern BLOCK_TAG = Pattern.compile(
            "(?i)</?(p|div|br|li|ul|ol|tr|td|th|table|h[1-6]|section|article|header|footer|blockquote|pre|dd|dt|dl|hr)\\b[^>]*>");
    private static final Pattern TAG = Pattern.compile("(?s)<[^>]*>");
    private static final Pattern SPACES = Pattern.compile("[ \\t\\u00a0\\u200b]+");
    private static final Pattern NEWLINES = Pattern.compile("\\s*\\n\\s*");
    private static final Pattern NUMERIC_ENTITY = Pattern.compile("&#(x?)([0-9a-fA-F]+);");

    private HtmlText() {
    }

    /** Converts an HTML document into readable plain text (max ~400 KB). */
    public static String fromHtml(String html) {
        if (html == null) return "";
        if (html.length() > 4_000_000) html = html.substring(0, 4_000_000);
        String s = COMMENT.matcher(html).replaceAll(" ");
        s = REMOVE_BLOCKS.matcher(s).replaceAll(" ");
        s = REMOVE_HEAD.matcher(s).replaceAll(" ");
        s = BLOCK_TAG.matcher(s).replaceAll("\n");
        s = TAG.matcher(s).replaceAll(" ");
        s = decodeEntities(s);
        s = SPACES.matcher(s).replaceAll(" ");
        s = NEWLINES.matcher(s).replaceAll("\n");
        s = s.replace("\n ", "\n").replace(" \n", "\n");
        while (s.contains("\n\n\n")) s = s.replace("\n\n\n", "\n\n");
        s = s.trim();
        if (s.length() > 400_000) s = s.substring(0, 400_000);
        return s;
    }

    private static String decodeEntities(String s) {
        if (s.indexOf('&') < 0) return s;
        String out = s
                .replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&#x27;", "'")
                .replace("&apos;", "'")
                .replace("&laquo;", "«")
                .replace("&raquo;", "»")
                .replace("&mdash;", "—")
                .replace("&ndash;", "–")
                .replace("&hellip;", "…")
                .replace("&copy;", "©")
                .replace("&deg;", "°")
                .replace("&times;", "×")
                .replace("&minus;", "−");
        Matcher m = NUMERIC_ENTITY.matcher(out);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String replacement;
            try {
                int code = m.group(1).isEmpty()
                        ? Integer.parseInt(m.group(2))
                        : Integer.parseInt(m.group(2), 16);
                replacement = new String(Character.toChars(code));
            } catch (Exception e) {
                replacement = " ";
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /** Normalizes a string for case-insensitive search (ё and е are the same letter). */
    public static String fold(String value) {
        if (value == null) return "";
        return value.toLowerCase().replace('ё', 'е').replace('Ё', 'е');
    }
}
