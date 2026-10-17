package net.kdt.pojavlaunch.modloaders;

import com.kdt.mcgui.ProgressLayout;

import net.kdt.pojavlaunch.R;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;
import net.kdt.pojavlaunch.utils.DownloadUtils;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/**
 * Downloads the NeoForge installer jar for the selected version.
 */
public class NeoForgeDownloadTask implements Runnable, Tools.DownloaderFeedback {
    private final String mDownloadUrl;
    private final String mVersion;
    private final ModloaderDownloadListener mListener;

    public NeoForgeDownloadTask(ModloaderDownloadListener listener, String neoForgeVersion) {
        this.mListener = listener;
        this.mVersion = neoForgeVersion;
        this.mDownloadUrl = NeoForgeUtils.getInstallerUrl(neoForgeVersion);
    }

    @Override
    public void run() {
        ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, 0, R.string.neoforge_dl_progress, mVersion);
        try {
            File destinationFile = new File(Tools.DIR_CACHE, "neoforge-installer.jar");
            byte[] buffer = new byte[8192];
            DownloadUtils.downloadFileMonitored(mDownloadUrl, destinationFile, buffer, this);
            mListener.onDownloadFinished(destinationFile);
        }catch (FileNotFoundException e) {
            mListener.onDataNotAvailable();
        }catch (IOException e) {
            mListener.onDownloadError(e);
        }
        ProgressLayout.clearProgress(ProgressLayout.INSTALL_MODPACK);
    }

    @Override
    public void updateProgress(int curr, int max) {
        int progress100 = (int)(((float)curr / (float)max)*100f);
        ProgressKeeper.submitProgress(ProgressLayout.INSTALL_MODPACK, progress100, R.string.neoforge_dl_progress, mVersion);
    }
}
