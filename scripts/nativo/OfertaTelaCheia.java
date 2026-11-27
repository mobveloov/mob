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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel("oferta3") == null) {
                // Canal "oferta3": o Android não deixa trocar o som de um canal já criado ("oferta" ficou com o som padrão). Toque de corrida do app, tipo ligação.
                NotificationChannel canal = new NotificationChannel("oferta3", "Chamada de corrida", NotificationManager.IMPORTANCE_HIGH);
                canal.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                canal.enableVibration(true);
                canal.setVibrationPattern(new long[] {0, 600, 300, 600, 300, 600});
                int som = c.getResources().getIdentifier("toque_xperia", "raw", c.getPackageName()); // Sony Xperia: toque padrão do dono
                if (som == 0) som = c.getResources().getIdentifier("toque_corrida", "raw", c.getPackageName());
                if (som != 0) canal.setSound(android.net.Uri.parse("android.resource://" + c.getPackageName() + "/" + som),
                    new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                nm.createNotificationChannel(canal);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) { try { nm.deleteNotificationChannel("oferta2"); } catch (Exception e) { /* canal antigo já foi */ } }
            Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(c, "oferta3") : new Notification.Builder(c);
            b.setContentTitle(titulo).setContentText(texto).setSmallIcon(c.getApplicationInfo().icon)
                .setCategory(Notification.CATEGORY_CALL).setPriority(Notification.PRIORITY_MAX)
                .setAutoCancel(true).setTimeoutAfter(60000).setContentIntent(pi).setFullScreenIntent(pi, true).setVisibility(Notification.VISIBILITY_PUBLIC);
            Notification n = b.build();
            n.flags |= Notification.FLAG_INSISTENT; // toca em laço até aceitar, recusar ou vencer (o app cancela a notificação)
            nm.notify(4712, n);
            if (Settings.canDrawOverlays(c)) c.startActivity(abrir); // com "exibir sobre outros apps" o sistema deixa abrir direto
        } catch (Exception e) {
            // o sistema recusou: a notificação continua avisando
        }
    }
}
