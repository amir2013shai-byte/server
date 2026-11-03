package su.dnd.reader;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Site sections that can be browsed and downloaded for offline use. */
public final class Categories {

    public static final class Cat {
        public final String key;
        public final String title;
        public final String url;
        /** Regexp matched against the URL path for article pages, empty for the index only. */
        public final String detailPattern;
        public final int icon;

        Cat(String key, String title, String url, String detailPattern, int icon) {
            this.key = key;
            this.title = title;
            this.url = url;
            this.detailPattern = detailPattern;
            this.icon = icon;
        }

        public boolean isDetail(String url) {
            if (detailPattern == null || detailPattern.isEmpty()) return false;
            try {
                String path = new java.net.URI(url).getPath();
                return path != null && Pattern.compile(detailPattern).matcher(path).find();
            } catch (Exception e) {
                return false;
            }
        }
    }

    public static final Cat HOME = new Cat("home", "Главная", "https://dnd.su/", "", R.drawable.ic_home);
    public static final Cat SPELLS = new Cat("spells", "Заклинания", "https://dnd.su/spells/",
            "^/spells/\\d+-", R.drawable.ic_spell);
    public static final Cat BESTIARY = new Cat("bestiary", "Бестиарий", "https://dnd.su/bestiary/",
            "^/bestiary/\\d+-", R.drawable.ic_bestiary);
    public static final Cat ITEMS = new Cat("items", "Магические предметы", "https://dnd.su/items/",
            "^/items/\\d+-", R.drawable.ic_items);
    public static final Cat CLASSES = new Cat("class", "Классы", "https://dnd.su/class/",
            "^/class/\\d+-", R.drawable.ic_book);
    public static final Cat RACES = new Cat("race", "Расы и происхождения", "https://dnd.su/race/",
            "^/(race|multiverse/race)/\\d+-", R.drawable.ic_globe);
    public static final Cat FEATS = new Cat("feats", "Черты", "https://dnd.su/feats/",
            "^/feats/\\d+-", R.drawable.ic_star);
    public static final Cat BACKGROUNDS = new Cat("backgrounds", "Предыстории", "https://dnd.su/backgrounds/",
            "^/backgrounds/\\d+-", R.drawable.ic_book);
    public static final Cat ARTICLES = new Cat("articles", "Статьи", "https://dnd.su/articles/",
            "^/articles/[a-z-]+/\\d+-", R.drawable.ic_article);

    public static final Cat[] DOWNLOADABLE = {
            HOME, SPELLS, BESTIARY, ITEMS, CLASSES, RACES, FEATS, BACKGROUNDS, ARTICLES
    };

    /** Sections shown in the "all sections" dialog. */
    public static final Cat[] ALL = DOWNLOADABLE;

    private Categories() {
    }

    public static Cat byKey(String key) {
        for (Cat c : DOWNLOADABLE) {
            if (c.key.equals(key)) return c;
        }
        return null;
    }

    public static String titleOf(String key) {
        for (Cat c : DOWNLOADABLE) {
            if (c.key.equals(key)) return c.title;
        }
        if ("other".equals(key)) return "Прочее";
        if ("next".equals(key)) return "D&D 2024";
        return "Страница";
    }

    /** Guess the section for an arbitrary URL. */
    public static Cat forUrl(String url) {
        if (url == null) return null;
        String u = url;
        for (Cat c : DOWNLOADABLE) {
            if (c.detailPattern != null && !c.detailPattern.isEmpty() && c.isDetail(u)) return c;
        }
        for (Cat c : DOWNLOADABLE) {
            if (c == HOME) continue;
            if (u.startsWith(c.url)) return c;
        }
        String home = HOME.url;
        if (u.equals(home) || u.equals(home.substring(0, home.length() - 1))
                || u.startsWith(home + "?") || u.startsWith(home + "#")) {
            return HOME;
        }
        return null;
    }

    public static String categoryKey(String url) {
        Cat c = forUrl(url);
        if (c != null) return c.key;
        if (url != null && url.contains("next.dnd.su")) return "next";
        return "other";
    }

    /** Extra navigation entries shown in the menu (title, url). */
    public static List<String[]> extraSections() {
        List<String[]> out = new ArrayList<>();
        out.add(new String[]{"D&D 2024: Классы", "https://next.dnd.su/class/"});
        out.add(new String[]{"D&D 2024: Виды", "https://next.dnd.su/species/"});
        out.add(new String[]{"D&D 2024: Заклинания", "https://next.dnd.su/spells/"});
        out.add(new String[]{"D&D 2024: Бестиарий", "https://next.dnd.su/bestiary/"});
        out.add(new String[]{"D&D 2024: Предметы", "https://next.dnd.su/items/"});
        out.add(new String[]{"D&D 2024: Снаряжение", "https://next.dnd.su/equipment/"});
        out.add(new String[]{"D&D 2024: Новичку", "https://next.dnd.su/newbie/"});
        return out;
    }
}
