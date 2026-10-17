package net.kdt.pojavlaunch.modloaders;

import androidx.annotation.NonNull;

/**
 * A NeoForge version, as published on the NeoForged maven.
 * <p>
 * NeoForge version numbers are derived from the Minecraft version they target:
 * Minecraft {@code 1.A.B} is targeted by NeoForge {@code A.B.<build>}, and a Minecraft
 * version without a patch number (for example {@code 1.21}) is targeted by
 * {@code A.0.<build>}. So Minecraft 1.21.1 is targeted by NeoForge 21.1.x.
 */
public class NeoForgeVersion {
    /** The NeoForge version string, for example "21.1.209" or "21.1.100-beta" */
    public final String version;
    /** The Minecraft version this NeoForge version targets, for example "1.21.1" */
    public final String mcVersion;
    /** The build number, used to order versions within one Minecraft version */
    public final int build;
    /** Whether this version is a beta build */
    public final boolean beta;

    public NeoForgeVersion(String version, String mcVersion, int build, boolean beta) {
        this.version = version;
        this.mcVersion = mcVersion;
        this.build = build;
        this.beta = beta;
    }

    @NonNull
    @Override
    public String toString() {
        return version;
    }
}
