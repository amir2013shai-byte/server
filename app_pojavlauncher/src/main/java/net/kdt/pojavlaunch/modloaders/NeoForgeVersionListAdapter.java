package net.kdt.pojavlaunch.modloaders;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseExpandableListAdapter;
import android.widget.ExpandableListAdapter;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Groups NeoForge versions by the Minecraft version they target.
 * The preferred Minecraft version (1.21.1 for this build) is placed first,
 * other groups follow from the newest Minecraft version to the oldest.
 */
public class NeoForgeVersionListAdapter extends BaseExpandableListAdapter implements ExpandableListAdapter {
    private final List<String> mGameVersions;
    private final List<List<NeoForgeVersion>> mNeoForgeVersions;
    private final LayoutInflater mLayoutInflater;

    public NeoForgeVersionListAdapter(List<NeoForgeVersion> neoForgeVersions, LayoutInflater layoutInflater) {
        this.mLayoutInflater = layoutInflater;
        mGameVersions = new ArrayList<>();
        mNeoForgeVersions = new ArrayList<>();
        for(NeoForgeVersion neoForgeVersion : neoForgeVersions) {
            List<NeoForgeVersion> versionList;
            int gameVersionIndex = mGameVersions.indexOf(neoForgeVersion.mcVersion);
            if(gameVersionIndex != -1) versionList = mNeoForgeVersions.get(gameVersionIndex);
            else {
                versionList = new ArrayList<>();
                mGameVersions.add(neoForgeVersion.mcVersion);
                mNeoForgeVersions.add(versionList);
            }
            versionList.add(neoForgeVersion);
        }
        // Sort the Minecraft version groups: the preferred one first, then newest to oldest
        List<Integer> indices = new ArrayList<>();
        for(int i = 0; i < mGameVersions.size(); i++) indices.add(i);
        final String preferred = NeoForgeUtils.PREFERRED_MC_VERSION;
        indices.sort(Comparator
                .comparingInt((Integer i) -> mGameVersions.get(i).equals(preferred) ? 0 : 1)
                .thenComparing((i1, i2) -> NeoForgeUtils.compareMcVersions(mGameVersions.get(i1), mGameVersions.get(i2))));
        List<String> sortedGameVersions = new ArrayList<>(mGameVersions.size());
        List<List<NeoForgeVersion>> sortedVersions = new ArrayList<>(mNeoForgeVersions.size());
        for(int index : indices) {
            sortedGameVersions.add(mGameVersions.get(index));
            List<NeoForgeVersion> versions = mNeoForgeVersions.get(index);
            // Within a group: newest build first, stable releases before betas
            versions.sort((a, b) -> {
                if(a.build != b.build) return Integer.compare(b.build, a.build);
                return Boolean.compare(a.beta, b.beta);
            });
            sortedVersions.add(versions);
        }
        mGameVersions.clear();
        mGameVersions.addAll(sortedGameVersions);
        mNeoForgeVersions.clear();
        mNeoForgeVersions.addAll(sortedVersions);
    }

    @Override
    public int getGroupCount() {
        return mGameVersions.size();
    }

    @Override
    public int getChildrenCount(int i) {
        return mNeoForgeVersions.get(i).size();
    }

    @Override
    public Object getGroup(int i) {
        return getGameVersion(i);
    }

    @Override
    public Object getChild(int i, int i1) {
        return getNeoForgeVersion(i, i1);
    }

    @Override
    public long getGroupId(int i) {
        return i;
    }

    @Override
    public long getChildId(int i, int i1) {
        return i1;
    }

    @Override
    public boolean hasStableIds() {
        return true;
    }

    @Override
    public View getGroupView(int i, boolean b, View convertView, ViewGroup viewGroup) {
        if(convertView == null)
            convertView = mLayoutInflater.inflate(android.R.layout.simple_expandable_list_item_1, viewGroup, false);
        ((TextView) convertView).setText(getGameVersion(i));
        return convertView;
    }

    @Override
    public View getChildView(int i, int i1, boolean b, View convertView, ViewGroup viewGroup) {
        if(convertView == null)
            convertView = mLayoutInflater.inflate(android.R.layout.simple_expandable_list_item_1, viewGroup, false);
        NeoForgeVersion version = getNeoForgeVersion(i, i1);
        ((TextView) convertView).setText(version.beta ? version.version + " (beta)" : version.version);
        return convertView;
    }

    private String getGameVersion(int i) {
        return mGameVersions.get(i);
    }

    private NeoForgeVersion getNeoForgeVersion(int i, int i1) {
        return mNeoForgeVersions.get(i).get(i1);
    }

    @Override
    public boolean isChildSelectable(int i, int i1) {
        return true;
    }
}
