package net.kdt.pojavlaunch.fragments;

import android.content.Context;
import android.content.Intent;
import android.view.LayoutInflater;
import android.widget.ExpandableListAdapter;

import androidx.annotation.NonNull;

import net.kdt.pojavlaunch.Architecture;
import net.kdt.pojavlaunch.JavaGUILauncherActivity;
import net.kdt.pojavlaunch.PojavApplication;
import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.modloaders.ModloaderListenerProxy;
import net.kdt.pojavlaunch.modloaders.NeoForgeDownloadTask;
import net.kdt.pojavlaunch.modloaders.NeoForgeUtils;
import net.kdt.pojavlaunch.modloaders.NeoForgeVersion;
import net.kdt.pojavlaunch.modloaders.NeoForgeVersionListAdapter;
import net.kdt.pojavlaunch.multirt.MultiRTUtils;

import org.apache.commons.io.FileUtils;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Shows the list of NeoForge versions, grouped by Minecraft version,
 * then downloads and runs the installer for the selected version.
 * <p>
 * The installer is run in headless command-line mode
 * ("--install-client &lt;game dir&gt;"), which is supported by NeoForge
 * installers since mid-2024 (so, all NeoForge 21.1.x installers).
 */
public class NeoForgeInstallFragment extends ModVersionListFragment<List<NeoForgeVersion>> {
    public static final String TAG = "NeoForgeInstallFragment";

    public NeoForgeInstallFragment() {
        super(TAG);
    }

    @Override
    public void onAttach(@NonNull Context context) {
        super.onAttach(context);
    }

    @Override
    public int getTitleText() {
        return R.string.neoforge_dl_select_version;
    }

    @Override
    public int getNoDataMsg() {
        return R.string.neoforge_dl_no_installer;
    }

    @Override
    public List<NeoForgeVersion> loadVersionList() throws IOException {
        return NeoForgeUtils.downloadNeoForgeVersions();
    }

    @Override
    public ExpandableListAdapter createAdapter(List<NeoForgeVersion> versionList, LayoutInflater layoutInflater) {
        return new NeoForgeVersionListAdapter(versionList, layoutInflater);
    }

    @Override
    public Runnable createDownloadTask(Object selectedVersion, ModloaderListenerProxy listenerProxy) {
        return new NeoForgeDownloadTask(listenerProxy, selectedVersion.toString());
    }

    @Override
    public void onDownloadFinished(Context context, File downloadedFile) {
        // The installer refuses to run if there is no launcher_profiles.json in the game dir.
        // It normally exists, but make sure it does, just in case.
        // The preparation is done in the background because unpacking a Java runtime
        // (if needed) can take a while.
        PojavApplication.sExecutorService.execute(()-> {
            try {
                File profiles = new File(Tools.DIR_GAME_NEW, "launcher_profiles.json");
                if(!profiles.exists())
                    FileUtils.writeStringToFile(profiles, "{\"profiles\":{}}", StandardCharsets.UTF_8);

                // Make sure a Java 21 runtime is available: it is required to run
                // Minecraft 1.20.5+, and used to run the installer as well.
                if(MultiRTUtils.getNearestJreName(21) == null)
                    unpackInternalJre21(context);
            }catch (IOException e) {
                Tools.showError(context, e);
            }
            Tools.runOnUiThread(()-> {
                Intent modInstallerStartIntent = new Intent(context, JavaGUILauncherActivity.class);
                NeoForgeUtils.addAutoInstallArgs(modInstallerStartIntent, downloadedFile, 21);
                modInstallerStartIntent.putExtra("openLogOutput", true);
                context.startActivity(modInstallerStartIntent);
            });
        });
    }

    /**
     * Unpacks the Java 21 runtime bundled with the launcher ("Internal-21").
     * Mirrors what NewJREUtil does when a game version requires a newer runtime.
     */
    private static void unpackInternalJre21(Context context) throws IOException {
        String assetPath = "components/jre-21";
        String version = Tools.read(context.getAssets().open(assetPath + "/version"));
        MultiRTUtils.installRuntimeNamedBinpack(
                context.getAssets().open(assetPath + "/universal.tar.xz"),
                context.getAssets().open(assetPath + "/bin-" + Architecture.archAsString(Tools.DEVICE_ARCHITECTURE) + ".tar.xz"),
                "Internal-21", version);
        MultiRTUtils.postPrepare("Internal-21");
    }
}
