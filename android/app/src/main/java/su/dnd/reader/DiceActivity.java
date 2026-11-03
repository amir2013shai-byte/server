package su.dnd.reader;

import android.app.Activity;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;

/**
 * Dice roller: d4–d100, modifier, advantage/disadvantage, quick presets and roll history.
 * Everything is computed on the device and works without internet.
 */
public class DiceActivity extends Activity {

    private static final int[] DICE = {4, 6, 8, 10, 12, 20, 100};
    private static final int MAX_HISTORY = 30;
    private static final int MODE_NORMAL = 0;
    private static final int MODE_ADVANTAGE = 1;
    private static final int MODE_DISADVANTAGE = 2;

    private final Map<Integer, Integer> pool = new LinkedHashMap<>();
    private final List<String> history = new ArrayList<>();
    private final Random random = new Random();
    private final Handler handler = new Handler(Looper.getMainLooper());

    private int modifier = 0;
    private int mode = MODE_NORMAL;

    private TextView tvTotal;
    private TextView tvDetail;
    private TextView tvCrit;
    private TextView tvModifier;
    private LinearLayout poolRow;
    private LinearLayout modifierRow;
    private LinearLayout modeRow;
    private LinearLayout diceGrid;
    private LinearLayout actionRow;
    private LinearLayout historyList;

    @Override
    protected void onCreate(Bundle state) {
        Prefs.applyTheme(this);
        super.onCreate(state);
        setContentView(R.layout.activity_dice);

        tvTotal = findViewById(R.id.tvTotal);
        tvDetail = findViewById(R.id.tvDetail);
        tvCrit = findViewById(R.id.tvCrit);
        poolRow = findViewById(R.id.poolRow);
        modifierRow = findViewById(R.id.modifierRow);
        modeRow = findViewById(R.id.modeRow);
        diceGrid = findViewById(R.id.diceGrid);
        actionRow = findViewById(R.id.actionRow);
        historyList = findViewById(R.id.historyList);

        findViewById(R.id.btnBack).setOnClickListener(v -> finish());
        findViewById(R.id.btnClearHistory).setOnClickListener(v -> {
            history.clear();
            Prefs.setDiceHistory(this, "[]");
            renderHistory();
            Ui.toast(this, "История очищена");
        });

        loadHistory();
        buildModifierRow();
        buildModeRow();
        buildDiceGrid();
        buildActions();
        pool.put(20, 1);
        renderPool();
        renderHistory();
    }

    // ------------------------------------------------------------------ UI

    private void renderPool() {
        poolRow.removeAllViews();
        if (pool.isEmpty()) {
            poolRow.addView(Ui.secondary(this, "Набор пуст — бросьте кубик ниже", 13));
            return;
        }
        LinearLayout chips = Ui.horizontal(this);
        for (Map.Entry<Integer, Integer> entry : pool.entrySet()) {
            final int faces = entry.getKey();
            final int count = entry.getValue();
            TextView chip = chip("d" + faces + (count > 1 ? " ×" + count : ""),
                    Ui.color(this, R.attr.dndAccent), v -> {
                        Integer current = pool.get(faces);
                        if (current != null && current > 1) pool.put(faces, current - 1);
                        else pool.remove(faces);
                        renderPool();
                    });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.rightMargin = Ui.dp(this, 8);
            chips.addView(chip, lp);
        }
        poolRow.addView(chips);
    }

    private void buildModifierRow() {
        modifierRow.removeAllViews();
        LinearLayout row = Ui.horizontal(this);
        row.addView(chipButton("−", v -> {
            modifier -= 1;
            updateModifier();
        }));
        tvModifier = new TextView(this);
        tvModifier.setTextSize(18);
        tvModifier.setTypeface(Typeface.DEFAULT_BOLD);
        tvModifier.setGravity(Gravity.CENTER);
        tvModifier.setTextColor(Ui.color(this, R.attr.dndText));
        tvModifier.setLayoutParams(new LinearLayout.LayoutParams(Ui.dp(this, 64),
                ViewGroup.LayoutParams.WRAP_CONTENT));
        row.addView(tvModifier);
        row.addView(chipButton("+", v -> {
            modifier += 1;
            updateModifier();
        }));
        TextView reset = Ui.secondary(this, "сброс", 12);
        reset.setPadding(Ui.dp(this, 12), Ui.dp(this, 10), 0, 0);
        reset.setOnClickListener(v -> {
            modifier = 0;
            updateModifier();
        });
        row.addView(reset);
        modifierRow.addView(row);
        updateModifier();
    }

    private void updateModifier() {
        if (tvModifier != null) {
            tvModifier.setText(modifier > 0 ? "+" + modifier : String.valueOf(modifier));
        }
    }

    private void buildModeRow() {
        modeRow.removeAllViews();
        final String[] titles = {"Обычный", "Преимущество", "Помеха"};
        LinearLayout row = Ui.horizontal(this);
        for (int i = 0; i < titles.length; i++) {
            final int value = i;
            TextView chip = chip(titles[i], Ui.color(this, i == mode ? R.attr.dndBrand : R.attr.dndText),
                    v -> {
                        mode = value;
                        buildModeRow();
                    });
            if (i == mode) chip.setTypeface(null, Typeface.BOLD);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.rightMargin = Ui.dp(this, 8);
            row.addView(chip, lp);
        }
        modeRow.addView(row);
    }

    private void buildDiceGrid() {
        diceGrid.removeAllViews();
        for (int rowIndex = 0; rowIndex < 2; rowIndex++) {
            LinearLayout row = Ui.horizontal(this);
            for (int col = 0; col < 4; col++) {
                int index = rowIndex * 4 + col;
                if (index >= DICE.length) {
                    View spacer = new View(this);
                    row.addView(spacer, new LinearLayout.LayoutParams(0, 1, 1f));
                    continue;
                }
                final int faces = DICE[index];
                TextView die = dieButton(faces);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, Ui.dp(this, 62), 1f);
                lp.rightMargin = Ui.dp(this, 8);
                lp.bottomMargin = Ui.dp(this, 8);
                row.addView(die, lp);
            }
            diceGrid.addView(row, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
    }

    private TextView dieButton(final int faces) {
        TextView tv = new TextView(this);
        tv.setText("d" + faces);
        tv.setTextSize(faces >= 100 ? 15 : 18);
        tv.setTypeface(Typeface.DEFAULT_BOLD);
        tv.setGravity(Gravity.CENTER);
        tv.setTextColor(Ui.color(this, R.attr.dndText));
        tv.setBackgroundResource(R.drawable.bg_card);
        tv.setOnClickListener(v -> {
            Integer count = pool.get(faces);
            pool.put(faces, count == null ? 1 : count + 1);
            renderPool();
            roll();
        });
        return tv;
    }

    private void buildActions() {
        actionRow.removeAllViews();
        TextView roll = Ui.primaryButton(this, "Бросить", v -> roll());
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        rp.rightMargin = Ui.dp(this, 8);
        actionRow.addView(roll, rp);
        TextView reset = Ui.flatButton(this, "Сбросить набор", v -> {
            pool.clear();
            renderPool();
            tvTotal.setText("—");
            tvTotal.setTextColor(Ui.color(this, R.attr.dndText));
            tvDetail.setText("Выберите кубик ниже или нажмите «Бросить»");
            tvCrit.setVisibility(View.GONE);
        });
        actionRow.addView(reset, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    }

    private TextView chip(String text, int textColor, View.OnClickListener click) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(14);
        tv.setGravity(Gravity.CENTER);
        tv.setPadding(Ui.dp(this, 14), Ui.dp(this, 9), Ui.dp(this, 14), Ui.dp(this, 9));
        tv.setBackgroundResource(R.drawable.bg_chip);
        tv.setTextColor(textColor);
        tv.setOnClickListener(click);
        return tv;
    }

    private TextView chipButton(String text, View.OnClickListener click) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(18);
        tv.setTypeface(Typeface.DEFAULT_BOLD);
        tv.setGravity(Gravity.CENTER);
        tv.setBackgroundResource(R.drawable.bg_chip);
        tv.setTextColor(Ui.color(this, R.attr.dndAccent));
        tv.setOnClickListener(click);
        tv.setLayoutParams(new LinearLayout.LayoutParams(Ui.dp(this, 48), Ui.dp(this, 40)));
        return tv;
    }

    // ------------------------------------------------------------------ rolls

    private void roll() {
        if (pool.isEmpty()) {
            pool.put(20, 1);
            renderPool();
        }
        StringBuilder detail = new StringBuilder();
        final int total = computeTotal(detail);
        final String detailText = detail.toString();
        final boolean crit = tvCrit.getVisibility() == View.VISIBLE;
        final CharSequence critText = tvCrit.getText();
        final int critColor = tvCrit.getCurrentTextColor();
        tvCrit.setVisibility(View.GONE);
        animateTo(total, detailText, crit, critText, critColor);
        rememberRoll(total);
    }

    private int computeTotal(StringBuilder detail) {
        int sum = 0;
        int diceCount = 0;
        int natural = -1;
        for (Map.Entry<Integer, Integer> entry : pool.entrySet()) {
            int faces = entry.getKey();
            int count = entry.getValue();
            diceCount += count;
            List<String> values = new ArrayList<>();
            if (faces == 20 && count == 1 && mode != MODE_NORMAL) {
                int a = random.nextInt(20) + 1;
                int b = random.nextInt(20) + 1;
                natural = mode == MODE_ADVANTAGE ? Math.max(a, b) : Math.min(a, b);
                values.add(String.valueOf(a));
                values.add(String.valueOf(b));
                sum += natural;
            } else {
                for (int i = 0; i < count; i++) {
                    int value = random.nextInt(faces) + 1;
                    values.add(String.valueOf(value));
                    sum += value;
                    if (faces == 20 && count == 1) natural = value;
                }
            }
            if (detail.length() > 0) detail.append("   ");
            detail.append("d").append(faces);
            if (count > 1) detail.append("×").append(count);
            detail.append(": ").append(join(values));
        }
        int total = sum + modifier;
        detail.append("\n").append(sum);
        if (modifier != 0) detail.append(modifier > 0 ? " + " + modifier : " − " + Math.abs(modifier));
        detail.append(" = ").append(total);
        if (mode != MODE_NORMAL && !(pool.size() == 1 && pool.containsKey(20) && pool.get(20) == 1)) {
            detail.append("\nПреимущество и помеха действуют только на один d20");
        }
        renderCrit(diceCount == 1, natural);
        return total;
    }

    private void renderCrit(boolean singleD20, int natural) {
        if (singleD20 && natural == 20) {
            tvCrit.setText("Критический успех!");
            tvCrit.setTextColor(0xFFD9A441);
            tvCrit.setVisibility(View.VISIBLE);
        } else if (singleD20 && natural == 1) {
            tvCrit.setText("Критический провал");
            tvCrit.setTextColor(0xFFC03B31);
            tvCrit.setVisibility(View.VISIBLE);
        } else {
            tvCrit.setVisibility(View.GONE);
        }
    }

    private static String join(List<String> values) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) sb.append(" + ");
            sb.append(values.get(i));
        }
        return sb.toString();
    }

    /** Short animation: the number flickers before it settles. */
    private void animateTo(final int total, final String detail, final boolean crit,
                           final CharSequence critText, final int critColor) {
        final long start = System.currentTimeMillis();
        final int dim = Ui.color(this, R.attr.dndTextDim);
        tvDetail.setText("Бросаем…");
        handler.post(new Runnable() {
            @Override
            public void run() {
                long elapsed = System.currentTimeMillis() - start;
                if (elapsed < 380) {
                    tvTotal.setText(String.valueOf(random.nextInt(20) + 1));
                    tvTotal.setTextColor(dim);
                    handler.postDelayed(this, 45);
                } else {
                    tvTotal.setText(String.valueOf(total));
                    tvTotal.setTextColor(Ui.color(DiceActivity.this, R.attr.dndAccent));
                    tvDetail.setText(detail);
                    if (crit) {
                        tvCrit.setText(critText);
                        tvCrit.setTextColor(critColor);
                        tvCrit.setVisibility(View.VISIBLE);
                    }
                }
            }
        });
    }

    // ------------------------------------------------------------------ history

    private void loadHistory() {
        history.clear();
        try {
            JSONArray arr = new JSONArray(Prefs.diceHistory(this));
            for (int i = 0; i < arr.length(); i++) {
                String value = arr.optString(i, "");
                if (!value.isEmpty()) history.add(value);
            }
        } catch (Exception ignored) {
        }
    }

    private void remember(String entry) {
        history.add(0, entry);
        while (history.size() > MAX_HISTORY) history.remove(history.size() - 1);
        try {
            JSONArray arr = new JSONArray();
            for (String value : history) arr.put(value);
            Prefs.setDiceHistory(this, arr.toString());
        } catch (Exception ignored) {
        }
        renderHistory();
    }

    private void renderHistory() {
        historyList.removeAllViews();
        if (history.isEmpty()) {
            historyList.addView(Ui.secondary(this, "Пока пусто — броски сохраняются здесь", 12));
            return;
        }
        SimpleDateFormat time = new SimpleDateFormat("HH:mm", Locale.getDefault());
        for (int i = 0; i < history.size(); i++) {
            String entry = history.get(i);
            LinearLayout row = Ui.horizontal(this);
            row.setPadding(0, Ui.dp(this, 6), 0, Ui.dp(this, 6));
            TextView tv = Ui.text(this, entry, 13, false);
            tv.setSingleLine(true);
            row.addView(tv);
            if (i == 0) {
                TextView fresh = Ui.secondary(this, "  только что", 11);
                row.addView(fresh);
            }
            historyList.addView(row);
            if (i < history.size() - 1) historyList.addView(Ui.divider(this));
        }
        TextView stamp = Ui.secondary(this, "Последний бросок: " +
                time.format(new Date()), 11);
        stamp.setPadding(0, Ui.dp(this, 8), 0, 0);
        historyList.addView(stamp);
    }

    private void rememberRoll(int total) {
        StringBuilder poolText = new StringBuilder();
        for (Map.Entry<Integer, Integer> entry : pool.entrySet()) {
            if (poolText.length() > 0) poolText.append(" + ");
            poolText.append(entry.getValue() > 1
                    ? entry.getValue() + "d" + entry.getKey()
                    : "d" + entry.getKey());
        }
        if (modifier != 0) poolText.append(modifier > 0 ? " + " + modifier : " − " + Math.abs(modifier));
        if (mode == MODE_ADVANTAGE) poolText.append(" преим.");
        if (mode == MODE_DISADVANTAGE) poolText.append(" помеха");
        remember(total + "  ·  " + poolText);
    }
}
