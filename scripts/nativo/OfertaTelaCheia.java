package __PACOTE__;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

/**
 * Chamada de corrida (ou alerta) por cima de tudo: acorda a tela, sobe uma notificação de chamada com tela cheia (full-screen intent)
 * e, com "Exibir sobre outros apps" liberado, traz o app para a frente. Usado pelo app aberto/minimizado (plugin Flutuante) e pelo
 * serviço de push (OfertaMessagingService), que funciona com o app fechado.
 */
public final class OfertaTelaCheia {
    private OfertaTelaCheia() { }

    public static void mostrar(Context c, String titulo, String texto) {
        try {
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                @SuppressWarnings("deprecation")
                PowerManager.WakeLock w = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, c.getPackageName() + ":oferta");
                w.acquire(15000);
            }
            Intent abrir = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (abrir == null) return;
            abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            PendingIntent pi = PendingIntent.getActivity(c, 7, abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel("oferta") == null) {
                NotificationChannel canal = new NotificationChannel("oferta", "Chamada de corrida", NotificationManager.IMPORTANCE_HIGH);
                canal.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                canal.enableVibration(true);
                nm.createNotificationChannel(canal);
            }
            Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(c, "oferta") : new Notification.Builder(c);
            b.setContentTitle(titulo).setContentText(texto).setSmallIcon(c.getApplicationInfo().icon)
                .setCategory(Notification.CATEGORY_CALL).setPriority(Notification.PRIORITY_MAX)
                .setAutoCancel(true).setContentIntent(pi).setFullScreenIntent(pi, true).setVisibility(Notification.VISIBILITY_PUBLIC);
            nm.notify(4712, b.build());
            if (Settings.canDrawOverlays(c)) c.startActivity(abrir); // com "exibir sobre outros apps" o sistema deixa abrir direto
        } catch (Exception e) {
            // o sistema recusou: a notificação continua avisando
        }
    }
}
