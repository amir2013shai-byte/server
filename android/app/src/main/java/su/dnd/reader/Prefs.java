package su.dnd.reader;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;

/** User preferences. */
public final class Prefs {
    public static final int THEME_SYSTEM = 0;
    public static final int THEME_LIGHT = 1;
    public static final int THEME_DARK = 2;

    private static final String FILE = "dnd_reader";

    private Prefs() {
    }

    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    public static int themeMode(Context c) {
        return sp(c).getInt("theme", THEME_SYSTEM);
    }

    public static void setThemeMode(Context c, int mode) {
        sp(c).edit().putInt("theme", mode).apply();
    }

    public static boolean isDark(Context c) {
        int mode = themeMode(c);
        if (mode == THEME_DARK) return true;
        if (mode == THEME_LIGHT) return false;
        int ui = c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return ui == Configuration.UI_MODE_NIGHT_YES;
    }

    public static void applyTheme(Activity a) {
        a.setTheme(isDark(a) ? R.style.Theme_Dnd_Dark : R.style.Theme_Dnd);
    }

    public static int textZoom(Context c) {
        return sp(c).getInt("text_zoom", 100);
    }

    public static void setTextZoom(Context c, int zoom) {
        sp(c).edit().putInt("text_zoom", zoom).apply();
    }

    /** Reading mode by default for article-like pages. */
    public static boolean readerMode(Context c) {
        return sp(c).getBoolean("reader_mode", false);
    }

    public static void setReaderMode(Context c, boolean on) {
        sp(c).edit().putBoolean("reader_mode", on).apply();
    }

    /** Experimental dark theme injected into site pages. */
    public static boolean darkPages(Context c) {
        return sp(c).getBoolean("dark_pages", false);
    }

    public static void setDarkPages(Context c, boolean on) {
        sp(c).edit().putBoolean("dark_pages", on).apply();
    }

    public static boolean embedImages(Context c) {
        return sp(c).getBoolean("embed_images", true);
    }

    public static void setEmbedImages(Context c, boolean on) {
        sp(c).edit().putBoolean("embed_images", on).apply();
    }

    public static int syncLimit(Context c) {
        return sp(c).getInt("sync_limit", 30);
    }

    public static void setSyncLimit(Context c, int limit) {
        sp(c).edit().putInt("sync_limit", limit).apply();
    }

    public static boolean syncDetails(Context c) {
        return sp(c).getBoolean("sync_details", true);
    }

    public static void setSyncDetails(Context c, boolean on) {
        sp(c).edit().putBoolean("sync_details", on).apply();
    }

    public static String lastUrl(Context c) {
        return sp(c).getString("last_url", "https://dnd.su/");
    }

    public static void setLastUrl(Context c, String url) {
        sp(c).edit().putString("last_url", url).apply();
    }

    public static boolean firstRun(Context c) {
        return sp(c).getBoolean("first_run", true);
    }

    public static void setFirstRunDone(Context c) {
        sp(c).edit().putBoolean("first_run", false).apply();
    }
}
