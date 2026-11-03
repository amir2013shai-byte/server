package su.dnd.reader;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Combat tracker: initiative order, HP, conditions and rounds.
 * Works offline; monsters can be taken from the saved bestiary with HP/AC read from the statblock.
 */
public class EncounterActivity extends Activity {

    private final Encounter encounter = new Encounter();
    private final Random random = new Random();
    private final List<Encounter.Combatant> view = new ArrayList<>();

    private ListView list;
    private View empty;
    private TextView tvRound;
    private TextView tvCurrent;
    private TextView tvCurrentInfo;
    private FrameLayout syncHost;
    private Adapter adapter;

    @Override
    protected void onCreate(Bundle state) {
        Prefs.applyTheme(this);
        super.onCreate(state);
        setContentView(R.layout.activity_encounter);

        list = findViewById(R.id.list);
        empty = findViewById(R.id.tvEmpty);
        tvRound = findViewById(R.id.tvRound);
        tvCurrent = findViewById(R.id.tvCurrent);
        tvCurrentInfo = findViewById(R.id.tvCurrentInfo);
        syncHost = findViewById(R.id.syncHost);

        findViewById(R.id.btnBack).setOnClickListener(v -> finish());
        findViewById(R.id.btnNext).setOnClickListener(v -> {
            if (encounter.isEmpty()) {
                Ui.toast(this, "Сначала добавьте участников");
                return;
            }
            encounter.nextTurn();
            save();
            render();
        });
        findViewById(R.id.btnRollInit).setOnClickListener(v -> rollAll());
        findViewById(R.id.btnReset).setOnClickListener(v -> confirmReset());
        findViewById(R.id.btnAdd).setOnClickListener(v -> editCombatant(null));
        findViewById(R.id.btnAddMonster).setOnClickListener(v -> pickMonster());

        adapter = new Adapter();
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, v, position, id) -> {
            final Encounter.Combatant c = view.get(position);
            encounter.turn = encounter.combatants.indexOf(c);
            save();
            render();
            combatantMenu(c);
        });

        load();
        render();
    }

    @Override
    protected void onResume() {
        super.onResume();
        load();
        render();
    }

    private void load() {
        Encounter loaded = Encounter.load(this);
        encounter.combatants.clear();
        encounter.combatants.addAll(loaded.combatants);
        encounter.turn = loaded.turn;
        encounter.round = loaded.round;
    }

    private void save() {
        encounter.save(this);
    }

    private void render() {
        view.clear();
        view.addAll(encounter.combatants);
        adapter.notifyDataSetChanged();
        tvRound.setText("Раунд " + encounter.round + " · участников: " + view.size());
        Encounter.Combatant current = encounter.current();
        boolean hasAny = current != null;
        tvCurrent.setText(hasAny ? current.name : "Бой не начат");
        tvCurrentInfo.setText(hasAny ? describe(current) : "Добавьте участников и бросьте инициативу");
        empty.setVisibility(view.isEmpty() ? View.VISIBLE : View.GONE);
        list.setVisibility(view.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private String describe(Encounter.Combatant c) {
        StringBuilder sb = new StringBuilder();
        if (c.maxHp > 0) sb.append("Хиты ").append(c.hp).append("/").append(c.maxHp);
        if (c.ac > 0) sb.append(sb.length() > 0 ? " · " : "").append("КБ ").append(c.ac);
        if (!c.conditions.isEmpty()) sb.append(sb.length() > 0 ? " · " : "").append(c.conditionsText());
        return sb.length() == 0 ? "Хиты не указаны" : sb.toString();
    }

    private void rollAll() {
        if (encounter.combatants.isEmpty()) {
            Ui.toast(this, "Сначала добавьте участников");
            return;
        }
        for (Encounter.Combatant c : encounter.combatants) {
            c.initiative = random.nextInt(20) + 1;
        }
        encounter.sortByInitiative();
        encounter.turn = 0;
        encounter.round = 1;
        save();
        render();
        Ui.toast(this, "Инициатива брошена");
    }

    private void confirmReset() {
        Ui.dialog(this).setTitle("Начать новый бой?")
                .setMessage("Порядок хода и все участники будут удалены. Заметки и библиотека не пострадают.")
                .setPositiveButton("Новый бой", (d, w) -> {
                    encounter.newEncounter();
                    save();
                    render();
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    // ------------------------------------------------------------------ add / edit

    private void editCombatant(final Encounter.Combatant existing) {
        final Encounter.Combatant target = existing;
        final int pad = Ui.dp(this, 20);
        LinearLayout box = Ui.vertical(this);
        box.setPadding(pad, Ui.dp(this, 4), pad, 0);

        final EditText name = input("Имя", target == null ? "" : target.name, InputType.TYPE_CLASS_TEXT);
        box.addView(label("Имя"));
        box.addView(name);

        final EditText init = input("", target == null ? "" : String.valueOf(target.initiative),
                InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_SIGNED);
        final EditText hp = input("", target == null || target.maxHp == 0 ? "" : String.valueOf(target.maxHp),
                InputType.TYPE_CLASS_NUMBER);
        final EditText ac = input("", target == null || target.ac == 0 ? "" : String.valueOf(target.ac),
                InputType.TYPE_CLASS_NUMBER);

        LinearLayout initRow = Ui.horizontal(this);
        LinearLayout initBox = Ui.vertical(this);
        initBox.addView(label("Инициатива"));
        initBox.addView(init);
        initRow.addView(initBox, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button roll = Ui.flatButton(this, "d20", v -> {
            int value = random.nextInt(20) + 1;
            init.setText(String.valueOf(value));
            Ui.toast(this, "Выпало " + value);
        });
        LinearLayout.LayoutParams rollParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rollParams.topMargin = Ui.dp(this, 14);
        initRow.addView(roll, rollParams);
        box.addView(initRow);

        LinearLayout stats = Ui.horizontal(this);
        LinearLayout hpBox = Ui.vertical(this);
        hpBox.addView(label("Хиты"));
        hpBox.addView(hp);
        stats.addView(hpBox, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout acBox = Ui.vertical(this);
        acBox.addView(label("Класс брони"));
        acBox.addView(ac);
        LinearLayout.LayoutParams acParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        acParams.leftMargin = Ui.dp(this, 10);
        stats.addView(acBox, acParams);
        box.addView(stats);

        final CheckBox monster = new CheckBox(this);
        monster.setText("Монстр (NPC)");
        monster.setTextColor(Ui.color(this, R.attr.dndText));
        monster.setTextSize(13);
        monster.setChecked(target != null && target.monster);
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        mlp.topMargin = Ui.dp(this, 10);
        monster.setLayoutParams(mlp);
        box.addView(monster);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(box);

        AlertDialog.Builder b = Ui.dialog(this);
        b.setTitle(target == null ? "Новый участник" : "Изменить участника");
        b.setView(scroll);
        b.setPositiveButton("Сохранить", null);
        final AlertDialog dialog = b.create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(v -> {
                    String who = name.getText().toString().trim();
                    if (who.isEmpty()) {
                        Ui.toast(this, "Введите имя");
                        return;
                    }
                    Encounter.Combatant c = target == null ? new Encounter.Combatant() : target;
                    c.name = who;
                    c.initiative = parseInt(init.getText().toString(), 0);
                    int max = parseInt(hp.getText().toString(), 0);
                    if (c.maxHp != max || target == null) {
                        c.maxHp = max;
                        c.hp = max;
                    }
                    c.ac = parseInt(ac.getText().toString(), 0);
                    c.monster = monster.isChecked();
                    if (target == null) encounter.add(c);
                    else encounter.sortByInitiative();
                    dialog.dismiss();
                    save();
                    render();
                }));
        dialog.show();
    }

    private void pickMonster() {
        final List<Archive.Page> monsters = new ArrayList<>();
        for (Archive.Page page : Archive.pages(this)) {
            if ("bestiary".equals(page.category)) monsters.add(page);
        }
        if (monsters.isEmpty()) {
            Ui.toast(this, "В библиотеке нет сохранённых монстров");
            SyncUi.show(this, syncHost, this::render);
            return;
        }
        String[] titles = new String[monsters.size()];
        for (int i = 0; i < monsters.size(); i++) titles[i] = monsters.get(i).title;
        Ui.dialog(this).setTitle("Монстр из бестиария")
                .setItems(titles, (d, which) -> {
                    Archive.Page page = monsters.get(which);
                    int[] stats = Encounter.readStatblock(this, page);
                    Encounter.Combatant c = new Encounter.Combatant();
                    c.name = page.title;
                    c.url = page.url;
                    c.monster = true;
                    c.initiative = random.nextInt(20) + 1;
                    c.ac = Math.max(0, stats[0]);
                    c.maxHp = Math.max(0, stats[1]);
                    c.hp = c.maxHp;
                    encounter.add(c);
                    save();
                    render();
                    Ui.toast(this, c.name + (c.maxHp > 0 ? " · хиты " + c.maxHp : "")
                            + (c.ac > 0 ? " · КБ " + c.ac : ""));
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    // ------------------------------------------------------------------ row actions

    private void combatantMenu(final Encounter.Combatant c) {
        String[] items = {
                "−5 хитов", "−1 хит", "+1 хит", "+5 хитов",
                "Состояния…", "Изменить…",
                c.url.isEmpty() ? "Удалить" : "Открыть страницу · Удалить"
        };
        AlertDialog.Builder b = Ui.dialog(this);
        b.setTitle(c.name + "  ·  " + describe(c));
        b.setItems(items, (d, which) -> {
            switch (which) {
                case 0:
                    damage(c, -5);
                    break;
                case 1:
                    damage(c, -1);
                    break;
                case 2:
                    damage(c, 1);
                    break;
                case 3:
                    damage(c, 5);
                    break;
                case 4:
                    conditions(c);
                    break;
                case 5:
                    editCombatant(c);
                    break;
                case 6:
                    if (c.url.isEmpty()) {
                        confirmRemove(c);
                    } else {
                        otherActions(c);
                    }
                    break;
            }
        });
        b.setNegativeButton("Закрыть", null);
        b.show();
    }

    private void otherActions(final Encounter.Combatant c) {
        String[] items = {"Открыть страницу монстра", "Удалить из боя"};
        Ui.dialog(this).setTitle(c.name).setItems(items, (d, which) -> {
            if (which == 0) {
                Intent i = new Intent(this, MainActivity.class);
                if (Archive.has(this, c.url)) {
                    i.putExtra(MainActivity.EXTRA_ARCHIVE, Archive.localUrl(c.url));
                    i.putExtra(MainActivity.EXTRA_SOURCE, c.url);
                } else {
                    i.putExtra(MainActivity.EXTRA_OPEN, c.url);
                }
                i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(i);
            } else {
                confirmRemove(c);
            }
        }).setNegativeButton("Отмена", null).show();
    }

    private void confirmRemove(final Encounter.Combatant c) {
        Ui.dialog(this).setTitle("Убрать из боя?")
                .setMessage(c.name)
                .setPositiveButton("Убрать", (d, w) -> {
                    encounter.remove(encounter.combatants.indexOf(c));
                    save();
                    render();
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void damage(Encounter.Combatant c, int delta) {
        if (delta < 0 && c.maxHp > 0) {
            c.hp = Math.max(0, c.hp + delta);
            if (c.hp == 0 && !c.conditions.contains("Без сознания")) c.conditions.add("Без сознания");
        } else if (delta > 0 && c.maxHp > 0) {
            c.hp = Math.min(c.maxHp, c.hp + delta);
            if (c.hp > 0) c.conditions.remove("Без сознания");
        } else if (c.maxHp == 0) {
            Ui.toast(this, "Сначала укажите хиты участника");
            return;
        }
        save();
        render();
        Ui.toast(this, c.name + ": " + (c.maxHp > 0 ? c.hp + "/" + c.maxHp : "—"));
    }

    private void conditions(final Encounter.Combatant c) {
        final boolean[] checked = new boolean[Encounter.CONDITIONS.length];
        for (int i = 0; i < Encounter.CONDITIONS.length; i++) {
            checked[i] = c.conditions.contains(Encounter.CONDITIONS[i]);
        }
        Ui.dialog(this).setTitle("Состояния: " + c.name)
                .setMultiChoiceItems(Encounter.CONDITIONS, checked, (d, which, isChecked) -> checked[which] = isChecked)
                .setPositiveButton("Готово", (d, w) -> {
                    c.conditions.clear();
                    for (int i = 0; i < Encounter.CONDITIONS.length; i++) {
                        if (checked[i]) c.conditions.add(Encounter.CONDITIONS[i]);
                    }
                    save();
                    render();
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    // ------------------------------------------------------------------ helpers

    private TextView label(String text) {
        TextView tv = Ui.text(this, text, 12, true);
        tv.setTextColor(Ui.color(this, R.attr.dndTextDim));
        tv.setPadding(0, Ui.dp(this, 10), 0, Ui.dp(this, 4));
        return tv;
    }

    private EditText input(String hint, String value, int inputType) {
        EditText et = new EditText(this);
        et.setHint(hint);
        et.setText(value);
        et.setSingleLine(true);
        et.setInputType(inputType);
        et.setTextSize(15);
        et.setTextColor(Ui.color(this, R.attr.dndText));
        et.setHintTextColor(Ui.color(this, R.attr.dndTextDim));
        et.setBackgroundResource(R.drawable.bg_input);
        et.setPadding(Ui.dp(this, 12), Ui.dp(this, 8), Ui.dp(this, 12), Ui.dp(this, 8));
        return et;
    }

    private static int parseInt(String value, int fallback) {
        try {
            return Integer.parseInt(value.trim());
        } catch (Exception e) {
            return fallback;
        }
    }

    private class Adapter extends BaseAdapter {
        @Override
        public int getCount() {
            return view.size();
        }

        @Override
        public Object getItem(int position) {
            return view.get(position);
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            View row = convertView;
            if (row == null) row = getLayoutInflater().inflate(R.layout.row_combatant, parent, false);
            final Encounter.Combatant c = view.get(position);

            TextView init = row.findViewById(R.id.tvInit);
            TextView name = row.findViewById(R.id.tvName);
            TextView meta = row.findViewById(R.id.tvMeta);
            TextView turn = row.findViewById(R.id.tvTurn);
            ProgressBar bar = row.findViewById(R.id.hpBar);

            init.setText(String.valueOf(c.initiative));
            name.setText(c.name);
            boolean dead = c.maxHp > 0 && c.hp <= 0;
            name.setTextColor(Ui.color(EncounterActivity.this, R.attr.dndText));
            name.setTypeface(null, dead ? Typeface.ITALIC : Typeface.BOLD);

            StringBuilder info = new StringBuilder();
            if (c.maxHp > 0) info.append(c.hp).append("/").append(c.maxHp);
            else info.append("хиты —");
            if (c.ac > 0) info.append(" · КБ ").append(c.ac);
            if (c.monster) info.append(" · монстр");
            meta.setText(info.toString());

            if (!c.conditions.isEmpty()) {
                // conditions share the meta line to keep the row compact
                meta.setText(info + " · " + c.conditionsText());
            }

            bar.setMax(Math.max(1, c.maxHp));
            bar.setProgress(Math.max(0, Math.min(c.hp, Math.max(1, c.maxHp))));
            bar.setVisibility(c.maxHp > 0 ? View.VISIBLE : View.GONE);
            bar.setProgressTintList(android.content.res.ColorStateList.valueOf(
                    dead ? 0xFF7A2E28 : (c.maxHp > 0 && c.hp * 100 / Math.max(1, c.maxHp) < 35
                            ? 0xFFD9A441 : Ui.color(EncounterActivity.this, R.attr.dndAccent))));

            boolean isCurrent = encounter.current() == c;
            turn.setVisibility(isCurrent ? View.VISIBLE : View.GONE);
            row.setBackgroundResource(Ui.selectableBackground(EncounterActivity.this));
            return row;
        }
    }
}
