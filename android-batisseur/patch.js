// Prépare le projet Android généré par Capacitor : code natif, permissions, icône ABBA, signature stable.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  // 1. Code natif
  const dest = 'android/app/src/main/java/org/batisseursbibliques/batisseur';
  fs.mkdirSync(dest, { recursive: true });
  for (const f of ['MainActivity.java', 'VoixService.java', 'AbbaVoixPlugin.java']) {
    const code = fs.readFileSync(path.join('native', f), 'utf8').replace('package org.batisseursbibliques.abba;', 'package org.batisseursbibliques.batisseur;');
    fs.writeFileSync(path.join(dest, f), code);
  }

  // 2. Manifeste
  const man = 'android/app/src/main/AndroidManifest.xml';
  let x = fs.readFileSync(man, 'utf8');
  const perms = `
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <queries>
        <intent><action android:name="android.intent.action.TTS_SERVICE" /></intent>
    </queries>
`;
  if (!x.includes('FOREGROUND_SERVICE_MEDIA_PLAYBACK')) x = x.replace('<application', perms + '\n    <application');
  // Rappel quotidien : notifications locales programmées (alarmes) + reprogrammation après redémarrage
  const alarmes = `
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
`;
  if (!x.includes('SCHEDULE_EXACT_ALARM')) x = x.replace('<application', alarmes + '\n    <application');
  if (!x.includes('.VoixService')) x = x.replace('</application>', '    <service android:name=".VoixService" android:exported="false" android:foregroundServiceType="mediaPlayback" />\n    </application>');
  fs.writeFileSync(man, x);

  // Petite icône de notification (silhouette blanche : une cloche)
  fs.mkdirSync('android/app/src/main/res/drawable', { recursive: true });
  fs.writeFileSync('android/app/src/main/res/drawable/ic_stat_abba.xml', `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M12,22c1.1,0 2,-0.9 2,-2h-4c0,1.1 0.89,2 2,2zM18,16v-5c0,-3.07 -1.64,-5.64 -4.5,-6.32V4c0,-0.83 -0.67,-1.5 -1.5,-1.5s-1.5,0.67 -1.5,1.5v0.68C7.63,5.36 6,7.92 6,11v5l-2,2v1h16v-1l-2,-2z"/>
</vector>
`);

  // 3. Icône : le logo ABBA (icône classique + icône adaptative)
  const logo = path.resolve('..', 'icon-512.png');
  const tailles = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
  for (const [d, [petit, grand]] of Object.entries(tailles)) {
    const dossier = `android/app/src/main/res/mipmap-${d}`;
    fs.mkdirSync(dossier, { recursive: true });
    const carre = await sharp(logo).resize(petit, petit).png().toBuffer();
    fs.writeFileSync(`${dossier}/ic_launcher.png`, carre);
    fs.writeFileSync(`${dossier}/ic_launcher_round.png`, carre);
    const interieur = Math.round(grand * 0.66);
    const dedans = await sharp(logo).resize(interieur, interieur).png().toBuffer();
    await sharp({ create: { width: grand, height: grand, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: dedans, gravity: 'center' }]).png().toFile(`${dossier}/ic_launcher_foreground.png`);
  }
  const fond = 'android/app/src/main/res/values/ic_launcher_background.xml';
  fs.mkdirSync(path.dirname(fond), { recursive: true });
  fs.writeFileSync(fond, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n');

  // L'icône adaptative du modèle Capacitor pointe vers ses propres dessins : on la redirige vers le logo ABBA
  const adaptative = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n';
  fs.mkdirSync('android/app/src/main/res/mipmap-anydpi-v26', { recursive: true });
  fs.writeFileSync('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', adaptative);
  fs.writeFileSync('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', adaptative);
  for (const f of ['android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml', 'android/app/src/main/res/drawable/ic_launcher_background.xml']) { try { fs.unlinkSync(f); } catch (e) { /* absent */ } }

  // 4. Signature stable : une mise à jour de l'application s'installe par-dessus la précédente
  const gradle = 'android/app/build.gradle';
  let g = fs.readFileSync(gradle, 'utf8');
  if (!process.env.ABBA_KEYSTORE_PATH || !process.env.ABBA_KEYSTORE_PASSWORD) {
    throw new Error('Clé de signature absente : secrets ABBA_KEYSTORE_B64 et ABBA_KEYSTORE_PASSWORD requis.');
  }
  if (!g.includes('ABBA_KEYSTORE_PATH')) {
    g = g.replace(/android\s*\{/, `android {
    signingConfigs {
        debug {
            storeFile file(System.getenv('ABBA_KEYSTORE_PATH'))
            storePassword System.getenv('ABBA_KEYSTORE_PASSWORD')
            keyAlias 'abba'
            keyPassword System.getenv('ABBA_KEYSTORE_PASSWORD')
            storeType 'pkcs12'
        }
    }`);
    fs.writeFileSync(gradle, g);
  }
  console.log('Projet Android préparé.');
}
main().catch((e) => { console.error(e); process.exit(1); });
