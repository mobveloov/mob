package __PACOTE__;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Serviço em primeiro plano do motorista online: mantém o aplicativo vivo com a tela apagada ou em segundo plano
 * (notificação fixa "Você está online") e manda a posição ao servidor a cada ~15 s, sem depender da tela do aplicativo.
 * Quem liga e desliga é o app (plugin Flutuante: rastrear / pararRastreio).
 */
public class PosicaoService extends Service implements LocationListener {
    private static final String CANAL = "em-servico";
    private LocationManager lm;
    private PowerManager.WakeLock wake;
    private String url, token;
    private long ultimoEnvio = 0;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "FICAR_OFFLINE".equals(intent.getAction())) {
            ficarOffline();
            return START_NOT_STICKY;
        }
        if (intent != null) {
            url = intent.getStringExtra("url");
            token = intent.getStringExtra("token");
        }
        iniciarEmPrimeiroPlano();
        try {
            if (wake == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, getPackageName() + ":posicao");
                wake.setReferenceCounted(false);
                wake.acquire(12 * 60 * 60 * 1000L);
            }
            if (lm == null) {
                lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10000, 15, this);
                if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15000, 50, this);
                }
            }
        } catch (SecurityException e) {
            stopSelf(); // sem permissão de localização
        } catch (Exception e) {
            // provedor indisponível
        }
        return START_REDELIVER_INTENT;
    }

    /** Botão "Ficar offline" da notificação: manda /offline ao servidor (o app descobre ao voltar), tira a bolha flutuante e para o serviço. */
    private void ficarOffline() {
        final String u = url == null ? null : url.replace("/posicao", "/offline");
        final String t = token;
        try { stopService(new Intent(this, FlutuanteService.class)); } catch (Exception e) { /* bolha já fechada */ }
        if (u == null || t == null) { stopSelf(); return; }
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(u).openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(8000);
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    c.setRequestProperty("Authorization", "Bearer " + t);
                    OutputStream o = c.getOutputStream();
                    o.write("{}".getBytes("UTF-8"));
                    o.close();
                    c.getResponseCode();
                } catch (Exception e) {
                    // sem rede: o servidor derruba o motorista sozinho quando a posição para de chegar
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        }).start();
        stopSelf();
    }

    private void iniciarEmPrimeiroPlano() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CANAL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CANAL, "Em serviço", NotificationManager.IMPORTANCE_LOW));
        }
        Intent abrir = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = abrir == null ? null : PendingIntent.getActivity(this, 0, abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, CANAL) : new Notification.Builder(this);
        b.setContentTitle("Você está online").setContentText("Recebendo corridas. Toque para abrir.").setSmallIcon(getApplicationInfo().icon).setOngoing(true);
        if (pi != null) b.setContentIntent(pi);
        // Botão da notificação: "Ficar offline" (como nos apps de mobilidade): avisa o servidor, tira a bolha e encerra o serviço.
        Intent off = new Intent(this, PosicaoService.class).setAction("FICAR_OFFLINE");
        b.addAction(0, "Ficar offline", PendingIntent.getService(this, 1, off, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(4711, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(4711, n);
        }
    }

    @Override
    public void onLocationChanged(Location l) {
        long agora = System.currentTimeMillis();
        if (agora - ultimoEnvio < 12000 || url == null || token == null) return;
        ultimoEnvio = agora;
        final double lat = l.getLatitude();
        final double lng = l.getLongitude();
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(8000);
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    c.setRequestProperty("Authorization", "Bearer " + token);
                    byte[] corpo = ("{\"lat\":" + lat + ",\"lng\":" + lng + "}").getBytes("UTF-8");
                    OutputStream o = c.getOutputStream();
                    o.write(corpo);
                    o.close();
                    c.getResponseCode();
                } catch (Exception e) {
                    // sem rede agora: a próxima posição tenta de novo
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        }).start();
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) { }

    @Override
    public void onProviderEnabled(String provider) { }

    @Override
    public void onProviderDisabled(String provider) { }

    @Override
    public void onDestroy() {
        try {
            if (lm != null) lm.removeUpdates(this);
        } catch (Exception e) {
            // já parou
        }
        try {
            if (wake != null && wake.isHeld()) wake.release();
        } catch (Exception e) {
            // já soltou
        }
        stopForeground(true);
        super.onDestroy();
    }
}
