package org.batisseursbibliques.abba;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AbbaVoix")
public class AbbaVoixPlugin extends Plugin {

    @PluginMethod
    public void lire(PluginCall call) {
        JSArray arr = call.getArray("textes");
        int n = arr == null ? 0 : arr.length();
        String[] t = new String[n];
        for (int i = 0; i < n; i++) t[i] = arr.optString(i, "");
        VoixService.textes = t;
        JSObject d = call.getData();
        VoixService.depuis = d.optInt("depuis", 0);
        VoixService.vitesse = (float) d.optDouble("vitesse", 1.0);
        VoixService.titre = d.optString("titre", "ABBA");
        VoixService.langue = "en".equals(d.optString("langue", "fr")) ? "en" : "fr";
        VoixService.details = d.optString("details", "");
        VoixService.courant = -1;
        VoixService.lecture = true; VoixService.enPause = false; VoixService.termine = false;
        VoixService.ecouteur = new VoixService.Ecouteur() {
            @Override public void index(int i) {
                JSObject o = new JSObject();
                o.put("index", i);
                notifyListeners("index", o);
            }
            @Override public void fin() {
                notifyListeners("fin", new JSObject());
            }
            @Override public void erreur(String message) {
                JSObject o = new JSObject();
                o.put("message", message);
                notifyListeners("erreur", o);
            }
            @Override public void reprise(int i) {
                JSObject o = new JSObject();
                o.put("index", i);
                notifyListeners("reprise", o);
            }
            @Override public void pause(int i) {
                JSObject o = new JSObject();
                o.put("index", i);
                notifyListeners("pause", o);
            }
        };
        if (Build.VERSION.SDK_INT >= 33 && getActivity() != null
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 9);
        }
        ContextCompat.startForegroundService(getContext(), new Intent(getContext(), VoixService.class).setAction(VoixService.LIRE));
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        int idx = VoixService.courant;
        VoixService s = VoixService.instance;
        if (s != null) s.arreterTout(false);
        else {
            // plus de lecture en cours : on retire une éventuelle notification « En pause » devenue inutile
            android.app.NotificationManager nm = (android.app.NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(1);
        }
        JSObject o = new JSObject();
        o.put("index", idx);
        call.resolve(o);
    }

    // État du service de lecture : l'application s'en sert pour se remettre d'accord quand elle revient au premier plan
    @PluginMethod
    public void etat(PluginCall call) {
        JSObject o = new JSObject();
        o.put("lecture", VoixService.lecture);
        o.put("enPause", VoixService.enPause);
        o.put("termine", VoixService.termine);
        o.put("index", VoixService.courant);
        o.put("reprise", VoixService.reprise);
        call.resolve(o);
    }

    @PluginMethod
    public void batterie(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignore) { }
        call.resolve();
    }
}
