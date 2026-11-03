package su.dnd.reader;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/** Small UI helpers used to build the app chrome without any external libraries. */
public final class Ui {

    private Ui() {
    }

    public static int dp(Context c, float value) {
        return (int) (value * c.getResources().getDisplayMetrics().density + 0.5f);
    }

    public static int color(Context c, int attr) {
        TypedValue tv = new TypedValue();
        if (c.getTheme().resolveAttribute(attr, tv, true)) {
            if (tv.type >= TypedValue.TYPE_FIRST_COLOR_INT && tv.type <= TypedValue.TYPE_LAST_COLOR_INT) {
                return tv.data;
            }
            if (tv.resourceId != 0) {
                try {
                    return c.getResources().getColor(tv.resourceId);
                } catch (Exception ignored) {
                }
            }
        }
        return Color.GRAY;
    }

    public static AlertDialog.Builder dialog(Context c) {
        int style = Prefs.isDark(c)
                ? android.R.style.Theme_Material_Dialog_Alert
                : android.R.style.Theme_Material_Light_Dialog_Alert;
        AlertDialog.Builder b = new AlertDialog.Builder(c, style);
        b.setNegativeButton("Отмена", null);
        return b;
    }

    public static void toast(Context c, String message) {
        if (c == null) return;
        Toast.makeText(c, message, Toast.LENGTH_SHORT).show();
    }

    public static TextView text(Context c, CharSequence value, float sp, boolean bold) {
        TextView tv = new TextView(c);
        tv.setText(value);
        tv.setTextSize(sp);
        tv.setTextColor(color(c, R.attr.dndText));
        if (bold) tv.setTypeface(Typeface.DEFAULT_BOLD);
        return tv;
    }

    public static TextView secondary(Context c, CharSequence value, float sp) {
        TextView tv = text(c, value, sp, false);
        tv.setTextColor(color(c, R.attr.dndTextDim));
        return tv;
    }

    public static ImageView icon(Context c, int res, int colorAttr, int sizeDp) {
        ImageView iv = new ImageView(c);
        iv.setImageResource(res);
        iv.setColorFilter(color(c, colorAttr));
        int size = dp(c, sizeDp);
        iv.setLayoutParams(new LinearLayout.LayoutParams(size, size));
        return iv;
    }

    public static LinearLayout vertical(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    public static LinearLayout horizontal(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        return l;
    }

    public static View divider(Context c) {
        View v = new View(c);
        v.setBackgroundColor(color(c, R.attr.dndDivider));
        v.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, dp(c, 0.7f))));
        return v;
    }

    /** Card container with rounded background. */
    public static LinearLayout card(Context c) {
        LinearLayout l = vertical(c);
        l.setBackgroundResource(R.drawable.bg_card);
        int pad = dp(c, 14);
        l.setPadding(pad, pad, pad, pad);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(c, 10);
        l.setLayoutParams(lp);
        return l;
    }

    public static LinearLayout menuRow(Context c, int iconRes, String title, String subtitle, View.OnClickListener click) {
        LinearLayout row = horizontal(c);
        row.setPadding(dp(c, 10), dp(c, 12), dp(c, 10), dp(c, 12));
        row.setBackgroundResource(selectableBackground(c));
        row.addView(icon(c, iconRes, R.attr.dndAccent, 22));
        LinearLayout texts = vertical(c);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lp.leftMargin = dp(c, 14);
        texts.setLayoutParams(lp);
        TextView t = text(c, title, 15, false);
        texts.addView(t);
        if (subtitle != null && !subtitle.isEmpty()) {
            TextView s = secondary(c, subtitle, 12);
            s.setPadding(0, dp(c, 2), 0, 0);
            texts.addView(s);
        }
        row.addView(texts);
        row.setOnClickListener(click);
        return row;
    }

    public static int selectableBackground(Context c) {
        TypedValue tv = new TypedValue();
        c.getTheme().resolveAttribute(android.R.attr.selectableItemBackground, tv, true);
        return tv.resourceId;
    }

    public static TextView sectionHeader(Context c, String title) {
        TextView tv = text(c, title.toUpperCase(), 11, true);
        tv.setTextColor(color(c, R.attr.dndTextDim));
        tv.setLetterSpacing(0.08f);
        tv.setPadding(dp(c, 6), dp(c, 16), dp(c, 6), dp(c, 6));
        return tv;
    }

    public static Button primaryButton(Context c, String title, View.OnClickListener click) {
        Button b = new Button(c);
        b.setText(title);
        b.setAllCaps(false);
        b.setTextSize(14);
        b.setTextColor(Color.WHITE);
        b.setBackgroundResource(R.drawable.bg_button_primary);
        b.setOnClickListener(click);
        b.setPadding(dp(c, 18), dp(c, 10), dp(c, 18), dp(c, 10));
        return b;
    }

    public static Button flatButton(Context c, String title, View.OnClickListener click) {
        Button b = new Button(c);
        b.setText(title);
        b.setAllCaps(false);
        b.setTextSize(14);
        b.setTextColor(color(c, R.attr.dndAccent));
        b.setBackgroundResource(selectableBackground(c));
        b.setOnClickListener(click);
        return b;
    }

    /** Simple dialog with a progress bar and a message. */
    public static AlertDialog progressDialog(Context c, String title, String message, boolean cancelable,
                                             final Runnable onCancel) {
        LinearLayout box = vertical(c);
        int pad = dp(c, 20);
        box.setPadding(pad, dp(c, 6), pad, 0);
        TextView tv = text(c, message, 14, false);
        tv.setId(android.R.id.text1);
        box.addView(tv);
        ProgressBar pb = new ProgressBar(c, null, android.R.attr.progressBarStyleHorizontal);
        pb.setId(android.R.id.progress);
        pb.setIndeterminate(true);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(c, 4));
        lp.topMargin = dp(c, 16);
        pb.setLayoutParams(lp);
        box.addView(pb);

        AlertDialog.Builder b = dialog(c);
        b.setTitle(title);
        b.setView(box);
        if (cancelable) {
            b.setNegativeButton("Отмена", (d, w) -> {
                if (onCancel != null) onCancel.run();
            });
        }
        b.setCancelable(cancelable);
        AlertDialog d = b.create();
        d.setCancelable(cancelable);
        if (cancelable && onCancel != null) {
            d.setOnCancelListener(x -> onCancel.run());
        }
        return d;
    }

    public static void setProgress(AlertDialog d, int value, int max) {
        if (d == null || !d.isShowing()) return;
        ProgressBar pb = d.findViewById(android.R.id.progress);
        if (pb != null) {
            pb.setIndeterminate(false);
            pb.setMax(Math.max(1, max));
            pb.setProgress(Math.min(value, max));
        }
    }

    public static void setProgressMessage(AlertDialog d, String message) {
        if (d == null || !d.isShowing()) return;
        TextView tv = d.findViewById(android.R.id.text1);
        if (tv != null) tv.setText(message);
    }

    public static GradientDrawable rounded(int color, float radiusDp, Context c) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(c, radiusDp));
        return g;
    }

    public static String ellipsize(String value, int max) {
        if (value == null) return "";
        if (value.length() <= max) return value;
        return value.substring(0, max - 1) + "…";
    }

    public static String formatBytes(long bytes) {
        if (bytes < 1024) return bytes + " Б";
        if (bytes < 1024 * 1024) return String.format("%.1f КБ", bytes / 1024f);
        return String.format("%.1f МБ", bytes / (1024f * 1024f));
    }

    public static boolean isTablet(Context c) {
        return (c.getResources().getConfiguration().screenLayout
                & android.content.res.Configuration.SCREENLAYOUT_SIZE_MASK)
                >= android.content.res.Configuration.SCREENLAYOUT_SIZE_LARGE;
    }

    public static void applyTextZoom(Activity a) {
        int zoom = Prefs.textZoom(a);
        if (a instanceof MainActivity) {
            ((MainActivity) a).setTextZoom(zoom);
        }
    }

    public static String join(CharSequence delimiter, Iterable<? extends CharSequence> items) {
        return TextUtils.join(delimiter, items);
    }
}
