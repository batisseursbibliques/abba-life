package org.batisseursbibliques.abba;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AbbaVoixPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // La page continue de tourner (événements de lecture, passage au chapitre suivant) même écran éteint.
    @Override
    public void onPause() {
        super.onPause();
        try { getBridge().getWebView().resumeTimers(); } catch (Exception ignore) { }
    }

    @Override
    public void onStop() {
        super.onStop();
        try { getBridge().getWebView().resumeTimers(); } catch (Exception ignore) { }
    }
}
