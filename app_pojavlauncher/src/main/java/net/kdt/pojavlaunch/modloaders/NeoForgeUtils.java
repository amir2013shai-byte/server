package net.kdt.pojavlaunch.modloaders;

import android.content.Intent;

import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.utils.DownloadUtils;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Utilities to interact with the NeoForged maven.
 * <p>
 * The version list is fetched from the maven's JSON API, which returns all released
 * NeoForge versions (oldest first). Version numbers map back to the Minecraft version
 * they target (see {@link NeoForgeVersion}).
 */
public class NeoForgeUtils {
    private static final String NEOFORGE_VERSIONS_URL = "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge";
    private static final String NEOFORGE_INSTALLER_URL = "https://maven.neoforged.net/net/neoforged/neoforge/%1$s/neoforge-%1$s-installer.jar";

    /**
     * The Minecraft version this build is primarily intended for. Groups in the
     * version list are sorted so that this version (if present) comes first.
     */
    public static final String PREFERRED_MC_VERSION = "1.21.1";

    // Matches versions like "21.1.209" or "21.1.100-beta" (but not joke
    // versions like "0.25w14craftmine.3-beta")
    private static final Pattern NEOFORGE_VERSION_PATTERN = Pattern.compile("^(\\d+)\\.(\\d+)\\.(\\d+)(-[A-Za-z0-9.]+)?$");
    private static final Pattern MC_VERSION_PATTERN = Pattern.compile("^1\\.(\\d+)(?:\\.(\\d+))?$");

    /** Download the list of all released NeoForge versions, newest first. */
    public static List<NeoForgeVersion> downloadNeoForgeVersions() throws IOException {
        try {
            return DownloadUtils.downloadStringCached(NEOFORGE_VERSIONS_URL, "neoforge_versions", NeoForgeUtils::parseVersions);
        }catch (DownloadUtils.ParseException e) {
            e.printStackTrace();
            return null;
        }
    }

    private static List<NeoForgeVersion> parseVersions(String input) throws DownloadUtils.ParseException {
        try {
            JSONObject jsonObject = new JSONObject(input);
            JSONArray versions = jsonObject.getJSONArray("versions");
            List<NeoForgeVersion> result = new ArrayList<>(versions.length());
            for(int i = 0; i < versions.length(); i++) {
                String version = versions.getString(i);
                NeoForgeVersion parsed = parseVersion(version);
                if(parsed != null) result.add(parsed);
            }
            // Newest versions first
            result.sort(mVersionComparator);
            return result;
        }catch (JSONException e) {
            throw new DownloadUtils.ParseException(e);
        }
    }

    /**
     * Parses a raw NeoForge version string into a {@link NeoForgeVersion},
     * or returns null if the string does not follow the expected format.
     */
    public static NeoForgeVersion parseVersion(String version) {
        Matcher matcher = NEOFORGE_VERSION_PATTERN.matcher(version);
        if(!matcher.matches()) return null;
        int major = Integer.parseInt(matcher.group(1));
        int minor = Integer.parseInt(matcher.group(2));
        int build = Integer.parseInt(matcher.group(3));
        boolean beta = matcher.group(4) != null;
        String mcVersion = minor == 0 ? ("1." + major) : ("1." + major + "." + minor);
        return new NeoForgeVersion(version, mcVersion, build, beta);
    }

    /** Compares Minecraft versions, newer versions first. */
    public static int compareMcVersions(String left, String right) {
        int[] leftParts = parseMcVersion(left);
        int[] rightParts = parseMcVersion(right);
        if(leftParts == null || rightParts == null) return right.compareTo(left);
        if(leftParts[0] != rightParts[0]) return Integer.compare(rightParts[0], leftParts[0]);
        return Integer.compare(rightParts[1], leftParts[1]);
    }

    private static int[] parseMcVersion(String mcVersion) {
        Matcher matcher = MC_VERSION_PATTERN.matcher(mcVersion);
        if(!matcher.matches()) return null;
        int minor = Integer.parseInt(matcher.group(1));
        int patch = matcher.group(2) == null ? 0 : Integer.parseInt(matcher.group(2));
        return new int[]{minor, patch};
    }

    /** The URL of the installer jar for a NeoForge version. */
    public static String getInstallerUrl(String neoForgeVersion) {
        return String.format(NEOFORGE_INSTALLER_URL, neoForgeVersion);
    }

    /**
     * Adds the arguments used to run the NeoForge installer in headless mode
     * through {@link net.kdt.pojavlaunch.JavaGUILauncherActivity}.
     * <p>
     * Unlike the Forge installer, the NeoForge installer supports a real
     * command-line client install ("--install-client <dir>"), so the GUI
     * automation agent is not needed (and must not be attached: it would
     * kill the process when no installer window appears).
     * The installer itself runs on Java 8+, but runs best on the runtime
     * matching the Minecraft version it targets, and its post-processors may
     * require it, so a Java 21 runtime is requested for modern versions.
     */
    public static void addAutoInstallArgs(Intent intent, java.io.File modInstallerJar, int requiredJavaVersion) {
        intent.putExtra("javaArgs", "-jar " + modInstallerJar.getAbsolutePath()
                + " --install-client " + Tools.DIR_GAME_NEW);
        intent.putExtra("headlessInstall", true);
        intent.putExtra("requiredJavaVersion", requiredJavaVersion);
    }

    /** Sorts NeoForge versions from newest to oldest. */
    private static final Comparator<NeoForgeVersion> mVersionComparator = (a, b) -> {
        int mcResult = compareMcVersions(a.mcVersion, b.mcVersion);
        if(mcResult != 0) return mcResult;
        if(a.build != b.build) return Integer.compare(b.build, a.build);
        // At the same build number, prefer the stable release over the beta
        return Boolean.compare(a.beta, b.beta);
    };
}
