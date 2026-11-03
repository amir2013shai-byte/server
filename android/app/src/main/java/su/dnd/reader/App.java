package su.dnd.reader;

import android.app.Application;

/** Application entry point. */
public class App extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        // Make sure the archive directory exists on first launch.
        Archive.root(this);
    }
}
