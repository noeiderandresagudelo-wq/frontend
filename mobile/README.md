# Alarvix Android

Esta carpeta contiene la configuración de la aplicación Android de Alarvix.

## GPS en segundo plano

La APK utiliza Capacitor y `@capacitor-community/background-geolocation`. El perfil **TÉCNICO** inicia un rastreo nativo con una notificación visible del sistema. La ubicación se envía a Supabase mediante HTTP nativo para evitar la limitación de solicitudes del WebView cuando Android mantiene la aplicación en segundo plano.

## Generar la APK

Desde la raíz del repositorio:

```bash
npm install
npm run build
cd mobile
npm install
npx cap add android
npx cap sync android
npx cap open android
```

En Android Studio se puede ejecutar el dispositivo o generar el APK.

También se puede compilar directamente en Windows:

```bash
cd mobile
npx cap sync android
cd android
gradlew.bat assembleDebug
```

El APK de depuración queda en:

`mobile/android/app/build/outputs/apk/debug/app-debug.apk`

### Permisos

La primera vez que el técnico active el GPS, Android solicitará los permisos necesarios. En Android 13+ también se solicita permiso para la notificación persistente que indica que Alarvix está usando la ubicación.

El rastreo se inicia mientras Alarvix está visible y después puede continuar con la pantalla bloqueada o la aplicación minimizada.
