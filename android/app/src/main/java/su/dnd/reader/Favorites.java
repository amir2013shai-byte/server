package su.dnd.reader;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Bookmarks and personal notes for pages (work online and offline). */
public final class Favorites {

    private Favorites() {
    }

    private static JSONArray readFavorites(Context c) {
        try {
            return new JSONArray(Prefs.favorites(c));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static JSONObject readNotes(Context c) {
        try {
            return new JSONObject(Prefs.notes(c));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    public static boolean isFavorite(Context c, String url) {
        if (url == null) return false;
        String key = Archive.normalize(url);
        JSONArray arr = readFavorites(c);
        for (int i = 0; i < arr.length(); i++) {
            if (key.equals(arr.optString(i, ""))) return true;
        }
        return false;
    }

    /** Adds or removes the page; returns true when it is a favorite after the call. */
    public static boolean toggle(Context c, String url) {
        if (url == null || url.isEmpty()) return false;
        String key = Archive.normalize(url);
        JSONArray arr = readFavorites(c);
        JSONArray out = new JSONArray();
        boolean found = false;
        for (int i = 0; i < arr.length(); i++) {
            String value = arr.optString(i, "");
            if (value.isEmpty()) continue;
            if (value.equals(key)) {
                found = true;
                continue;
            }
            out.put(value);
        }
        if (!found) out.put(key);
        Prefs.setFavorites(c, out.toString());
        return !found;
    }

    public static List<String> urls(Context c) {
        List<String> out = new ArrayList<>();
        JSONArray arr = readFavorites(c);
        for (int i = 0; i < arr.length(); i++) {
            String value = arr.optString(i, "");
            if (!value.isEmpty()) out.add(value);
        }
        return out;
    }

    public static int count(Context c) {
        return readFavorites(c).length();
    }

    public static String note(Context c, String url) {
        if (url == null) return "";
        JSONObject notes = readNotes(c);
        return notes.optString(Archive.normalize(url), "");
    }

    public static void setNote(Context c, String url, String text) {
        if (url == null || url.isEmpty()) return;
        String key = Archive.normalize(url);
        JSONObject notes = readNotes(c);
        try {
            if (text == null || text.trim().isEmpty()) {
                notes.remove(key);
            } else {
                notes.put(key, text.trim());
            }
        } catch (Exception ignored) {
        }
        Prefs.setNotes(c, notes.toString());
    }

    /** URLs that have a note (newest last, callers can sort by title). */
    public static List<String> notedUrls(Context c) {
        List<String> out = new ArrayList<>();
        JSONObject notes = readNotes(c);
        java.util.Iterator<String> it = notes.keys();
        while (it.hasNext()) {
            String key = it.next();
            if (!notes.optString(key, "").isEmpty()) out.add(key);
        }
        return out;
    }

    public static int noteCount(Context c) {
        return notedUrls(c).size();
    }
}
