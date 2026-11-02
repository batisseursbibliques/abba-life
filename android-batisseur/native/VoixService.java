package org.batisseursbibliques.abba;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import androidx.core.app.NotificationCompat;

import java.util.Locale;

/**
 * Lecture vocale en service de premier plan : continue écran éteint et application en arrière-plan.
 * Tous les textes restants sont mis en file d'attente d'un coup dans le moteur vocal du téléphone.
 */
public class VoixService extends Service implements TextToSpeech.OnInitListener {

    public interface Ecouteur {
        void index(int i);
        void fin();
        void pause(int i);
        void erreur(String message);
        void reprise(int i);
    }

    public static final String LIRE = "abba.LIRE";
    public static final String PAUSE = "abba.PAUSE";
    public static final String REPRENDRE = "abba.REPRENDRE";
    public static int reprise = 0;
    // État lisible par l'application (elle se remet d'accord avec le service quand elle revient au premier plan)
    public static volatile boolean lecture = false;
    public static volatile boolean enPause = false;
    public static volatile boolean termine = false;
    private static final String CANAL = "abba_voix";

    public static volatile Ecouteur ecouteur;
    public static volatile VoixService instance;
    public static String[] textes = new String[0];
    public static int depuis = 0;
    public static float vitesse = 1f;
    public static String titre = "ABBA";
    public static String details = "";
    public static volatile String langue = "fr";
    private static boolean en() { return "en".equals(langue); }
    public static volatile int courant = -1;

    private TextToSpeech tts;
    private boolean pret = false;
    private boolean demande = false;
    private PowerManager.WakeLock verrou;
    private int dernier = -1;
    private volatile long generation = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (PAUSE.equals(action)) {
            mettreEnPause();
            return START_NOT_STICKY;
        }
        premierPlan(details);
        if (REPRENDRE.equals(action)) {
            // Bouton « Lecture » de la notification : on reprend là où la pause a eu lieu
            if (textes.length == 0 && !chargerReprise()) {
                stopForeground(true);
                NotificationManager nm0 = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm0 != null) nm0.cancel(1);
                stopSelf();
                return START_NOT_STICKY;
            }
            depuis = Math.max(reprise, 0);
            lecture = true; enPause = false; termine = false;
            Ecouteur er = ecouteur;
            if (er != null) er.reprise(depuis);
        }
        if (verrou == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            verrou = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "abba:voix");
        }
        if (!verrou.isHeld()) verrou.acquire(6 * 60 * 60 * 1000L);
        generation++;
        demande = true;
        if (tts == null) {
            tts = new TextToSpeech(getApplicationContext(), this);
        } else if (pret) {
            lancer();
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) {
            signaler(en() ? "The phone's speech engine did not start (code " + status + "). Check Settings > Text-to-speech." : "Le moteur vocal du téléphone n'a pas démarré (code " + status + "). Vérifiez Paramètres > Synthèse vocale.");
            arreterTout(false);
            return;
        }
        pret = true;
        try {
            appliquerLangue();
        } catch (Exception ex) { signaler("Langue vocale : " + ex.getMessage()); }
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) {
                long g = generationDe(id);
                int i = indexDe(id);
                if (g != generation || i < 0) return;
                courant = i;
                Ecouteur e = ecouteur;
                if (e != null) e.index(i);
                String t = i < textes.length ? textes[i] : "";
                majNotification(t.length() > 70 ? t.substring(0, 70) + "…" : t);
            }
            @Override public void onDone(String id) {
                if (generationDe(id) == generation && indexDe(id) == dernier) terminer();
            }
            @Override public void onError(String id) { signaler(en() ? "Speech playback error." : "Erreur de lecture vocale."); }
            @Override public void onError(String id, int code) { signaler((en() ? "Speech playback error (code " : "Erreur de lecture vocale (code ") + code + ")."); }
        });
        if (demande) lancer();
    }

    private static long generationDe(String id) {
        try { return Long.parseLong(id.substring(1, id.indexOf('_'))); } catch (Exception e) { return -1; }
    }

    private static int indexDe(String id) {
        try { return Integer.parseInt(id.substring(id.indexOf('_') + 1)); } catch (Exception e) { return -1; }
    }

    // Langue de la voix : celle de l'application (français ou anglais), choisie à chaque lecture
    private void appliquerLangue() {
        int r = tts.setLanguage(en() ? Locale.ENGLISH : Locale.FRENCH);
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
            signaler(en()
                ? "English voice not installed on this phone (Settings > Text-to-speech): playback may be silent."
                : "Voix française non installée sur ce téléphone (Paramètres > Synthèse vocale) : la lecture risque d'être muette.");
        }
    }

    private void lancer() {
        tts.stop();
        try { appliquerLangue(); } catch (Exception ex) { signaler("Langue vocale : " + ex.getMessage()); }
        tts.setSpeechRate(vitesse);
        dernier = -1;
        for (int i = Math.max(depuis, 0); i < textes.length; i++) {
            if (textes[i] != null && !textes[i].trim().isEmpty()) dernier = i;
        }
        if (dernier < 0) {
            terminer();
            return;
        }
        for (int i = Math.max(depuis, 0); i < textes.length; i++) {
            String t = textes[i];
            if (t == null || t.trim().isEmpty()) continue;
            if (t.length() > 3900) t = t.substring(0, 3900);
            tts.speak(t, TextToSpeech.QUEUE_ADD, null, "g" + generation + "_" + i);
        }
    }

    private void signaler(String message) {
        Ecouteur e = ecouteur;
        if (e != null) e.erreur(message);
    }

    private void terminer() {
        final long g = generation;
        courant = -1;
        lecture = false; termine = true;
        majNotification(en() ? "Finished" : "Fin de la lecture");
        Ecouteur e = ecouteur;
        if (e != null) e.fin();
        // Le service reste actif quelques secondes : l'application peut enchaîner avec le chapitre suivant
        // sans que le téléphone refuse de relancer la lecture en arrière-plan.
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            if (g == generation) arreterTout(false);
        }, 30000);
    }

    public void arreterTout(boolean notifierPause) {
        int idx = courant;
        lecture = false; enPause = false;
        generation++;
        demande = false;
        try { if (tts != null) tts.stop(); } catch (Exception ignore) { }
        courant = -1;
        if (verrou != null && verrou.isHeld()) verrou.release();
        stopForeground(true);
        if (notifierPause) {
            Ecouteur e = ecouteur;
            if (e != null) e.pause(idx);
        }
        stopSelf();
    }

    @Override
    public void onDestroy() {
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception ignore) { }
        if (verrou != null && verrou.isHeld()) verrou.release();
        instance = null;
        super.onDestroy();
    }

    // Pause depuis la notification : la notification reste, avec un bouton « Lecture » pour reprendre
    private void mettreEnPause() {
        int idx = courant;
        reprise = idx >= 0 ? idx : Math.max(depuis, 0);
        lecture = false; enPause = true; termine = false;
        sauverReprise();
        generation++;
        demande = false;
        try { if (tts != null) tts.stop(); } catch (Exception ignore) { }
        courant = -1;
        if (verrou != null && verrou.isHeld()) verrou.release();
        if (Build.VERSION.SDK_INT >= 33) stopForeground(Service.STOP_FOREGROUND_DETACH); else stopForeground(false);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(1, notificationPause());
        Ecouteur e = ecouteur;
        if (e != null) e.pause(idx);
        stopSelf();
    }

    // Mémorise la lecture en pause : le bouton « Lecture » fonctionne même si Android a fermé le processus entre-temps
    private void sauverReprise() {
        try {
            android.content.SharedPreferences.Editor ed = getSharedPreferences("abba_voix", MODE_PRIVATE).edit();
            ed.putString("textes", new org.json.JSONArray(java.util.Arrays.asList(textes)).toString());
            ed.putInt("reprise", reprise);
            ed.putFloat("vitesse", vitesse);
            ed.putString("titre", titre);
            ed.putString("details", details);
            ed.putString("langue", langue);
            ed.apply();
        } catch (Exception ignore) { }
    }

    private boolean chargerReprise() {
        try {
            android.content.SharedPreferences sp = getSharedPreferences("abba_voix", MODE_PRIVATE);
            String j = sp.getString("textes", null);
            if (j == null) return false;
            org.json.JSONArray a = new org.json.JSONArray(j);
            String[] t = new String[a.length()];
            for (int i = 0; i < t.length; i++) t[i] = a.optString(i, "");
            textes = t;
            reprise = sp.getInt("reprise", 0);
            vitesse = sp.getFloat("vitesse", 1f);
            titre = sp.getString("titre", "ABBA");
            details = sp.getString("details", "");
            langue = sp.getString("langue", "fr");
            return t.length > 0;
        } catch (Exception e) { return false; }
    }

    private Notification notificationPause() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel canal = new NotificationChannel(CANAL, "ABBA Parcours", NotificationManager.IMPORTANCE_LOW);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(canal);
        }
        Intent ouvrir = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 0, ouvrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent r = new Intent(this, VoixService.class).setAction(REPRENDRE);
        PendingIntent pr = Build.VERSION.SDK_INT >= 26
                ? PendingIntent.getForegroundService(this, 2, r, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)
                : PendingIntent.getService(this, 2, r, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CANAL)
                .setSmallIcon(android.R.drawable.ic_media_pause)
                .setContentTitle(titre)
                .setContentText(langue.equals("en") ? "Paused" : "En pause")
                .setContentIntent(pi)
                .setOngoing(false)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(android.R.drawable.ic_media_play, langue.equals("en") ? "Play" : "Lecture", pr)
                .build();
    }

    private void premierPlan(String texte) {
        Notification n = notification(texte);
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(1, n);
        }
    }

    private void majNotification(String texte) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(1, notification(texte));
    }

    private Notification notification(String texte) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel canal = new NotificationChannel(CANAL, "ABBA Parcours", NotificationManager.IMPORTANCE_LOW);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(canal);
        }
        Intent ouvrir = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 0, ouvrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent p = new Intent(this, VoixService.class).setAction(PAUSE);
        PendingIntent pp = PendingIntent.getService(this, 1, p, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CANAL)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(titre)
                .setContentText(texte == null || texte.isEmpty() ? (en() ? "Playing" : "Lecture en cours") : texte)
                .setContentIntent(pi)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(android.R.drawable.ic_media_pause, "Pause", pp)
                .build();
    }
}
