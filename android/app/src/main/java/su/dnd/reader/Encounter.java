package su.dnd.reader;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** State of one combat encounter: combatants, initiative order, rounds. Stored in SharedPreferences. */
public final class Encounter {

    public static final String[] CONDITIONS = {
            "Сбит с ног", "Отравлен", "Испуган", "Очарован", "Оглушён",
            "Ослеплён", "Парализован", "Ошеломлён", "Схвачен", "Невидим",
            "Ускорен", "Концентрация", "Без сознания"
    };

    private static final Pattern AC = Pattern.compile(
            "(?iu)класс\\s+(?:доспеха|брони)\\s*[:—–-]?\\s*(\\d{1,2})");
    private static final Pattern HP = Pattern.compile("(?iu)хиты\\s*[:—–-]?\\s*(\\d{1,4})");

    public static final class Combatant {
        public String name = "";
        public String url = "";
        public int initiative;
        public int hp;
        public int maxHp;
        public int ac;
        public boolean monster;
        public List<String> conditions = new ArrayList<>();

        public String conditionsText() {
            StringBuilder sb = new StringBuilder();
            for (String c : conditions) {
                if (sb.length() > 0) sb.append(", ");
                sb.append(c);
            }
            return sb.toString();
        }

        public JSONObject toJson() {
            JSONObject o = new JSONObject();
            try {
                o.put("n", name);
                o.put("u", url == null ? "" : url);
                o.put("i", initiative);
                o.put("h", hp);
                o.put("m", maxHp);
                o.put("a", ac);
                o.put("b", monster);
                JSONArray arr = new JSONArray();
                for (String c : conditions) arr.put(c);
                o.put("c", arr);
            } catch (Exception ignored) {
            }
            return o;
        }

        public static Combatant fromJson(JSONObject o) {
            Combatant c = new Combatant();
            c.name = o.optString("n", "");
            c.url = o.optString("u", "");
            c.initiative = o.optInt("i", 0);
            c.hp = o.optInt("h", 0);
            c.maxHp = o.optInt("m", 0);
            c.ac = o.optInt("a", 0);
            c.monster = o.optBoolean("b", false);
            JSONArray arr = o.optJSONArray("c");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    String value = arr.optString(i, "");
                    if (!value.isEmpty()) c.conditions.add(value);
                }
            }
            return c;
        }
    }

    public final List<Combatant> combatants = new ArrayList<>();
    public int turn;
    public int round = 1;

    public boolean isEmpty() {
        return combatants.isEmpty();
    }

    public Combatant current() {
        if (combatants.isEmpty()) return null;
        if (turn < 0 || turn >= combatants.size()) turn = 0;
        return combatants.get(turn);
    }

    public void sortByInitiative() {
        Collections.sort(combatants, new Comparator<Combatant>() {
            @Override
            public int compare(Combatant a, Combatant b) {
                return Integer.compare(b.initiative, a.initiative);
            }
        });
    }

    /** Moves to the next combatant; wraps to the next round at the end of the list. */
    public void nextTurn() {
        if (combatants.isEmpty()) {
            turn = 0;
            round = 1;
            return;
        }
        turn++;
        if (turn >= combatants.size()) {
            turn = 0;
            round++;
        }
    }

    public void add(Combatant c) {
        combatants.add(c);
        sortByInitiative();
        turn = 0;
    }

    public void remove(int index) {
        if (index < 0 || index >= combatants.size()) return;
        combatants.remove(index);
        if (turn >= combatants.size()) turn = 0;
    }

    public void newEncounter() {
        combatants.clear();
        turn = 0;
        round = 1;
    }

    public String toJson() {
        JSONObject o = new JSONObject();
        try {
            o.put("t", turn);
            o.put("r", round);
            JSONArray arr = new JSONArray();
            for (Combatant c : combatants) arr.put(c.toJson());
            o.put("c", arr);
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    public static Encounter load(Context c) {
        Encounter e = new Encounter();
        String raw = Prefs.encounter(c);
        if (raw == null || raw.trim().isEmpty()) return e;
        try {
            JSONObject o = new JSONObject(raw);
            e.turn = o.optInt("t", 0);
            e.round = Math.max(1, o.optInt("r", 1));
            JSONArray arr = o.optJSONArray("c");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject item = arr.optJSONObject(i);
                    if (item != null) e.combatants.add(Combatant.fromJson(item));
                }
            }
        } catch (Exception ignored) {
        }
        if (e.turn < 0 || e.turn >= Math.max(1, e.combatants.size())) e.turn = 0;
        return e;
    }

    public void save(Context c) {
        Prefs.setEncounter(c, toJson());
    }

    /** Reads HP and AC from the statblock text of a saved bestiary page. */
    public static int[] readStatblock(Context c, Archive.Page page) {
        if (page == null) return new int[]{-1, -1};
        return parseStatblock(Archive.text(c, page));
    }

    /** Same parsing without Android dependencies, so it can be tested on the JVM. */
    public static int[] parseStatblock(String text) {
        int[] out = {-1, -1};
        if (text == null || text.isEmpty()) return out;
        Matcher ac = AC.matcher(text);
        if (ac.find()) {
            try {
                out[0] = Integer.parseInt(ac.group(1));
            } catch (Exception ignored) {
            }
        }
        Matcher hp = HP.matcher(text);
        if (hp.find()) {
            try {
                out[1] = Integer.parseInt(hp.group(1));
            } catch (Exception ignored) {
            }
        }
        return out;
    }
}
