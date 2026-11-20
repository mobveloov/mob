package __PACOTE__;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;
import android.net.Uri;
import android.provider.Settings;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ícone flutuante do motorista (aparece por cima de outros apps quando o app é minimizado, online).
 * Usado pelo app em JavaScript como o plugin "Flutuante": permitido(), pedir(), mostrar(), esconder().
 */
@CapacitorPlugin(name = "Flutuante")
public class FlutuantePlugin extends Plugin {

    /** Mantém a tela ligada enquanto o app está aberto (online, em corrida). */
    @PluginMethod
    public void manterTela(final PluginCall call) {
        final boolean ligar = Boolean.TRUE.equals(call.getBoolean("ligar", true));
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (ligar) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                call.resolve();
            }
        });
    }

    /** Liga o serviço em primeiro plano que manda a posição ao servidor com a tela apagada (url completa de /posicao e o token). */
    @PluginMethod
    public void rastrear(PluginCall call) {
        Intent i = new Intent(getContext(), PosicaoService.class);
        i.putExtra("url", call.getString("url", ""));
        i.putExtra("token", call.getString("token", ""));
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) getContext().startForegroundService(i);
            else getContext().startService(i);
        } catch (Exception e) {
            // o sistema não deixou: o app segue com a posição pela tela
        }
        call.resolve();
    }

    @PluginMethod
    public void pararRastreio(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PosicaoService.class));
        call.resolve();
    }

    @PluginMethod
    public void permitido(PluginCall call) {
        JSObject r = new JSObject();
        r.put("valor", Settings.canDrawOverlays(getContext()));
        call.resolve(r);
    }

    /** Abre a tela do Android onde a pessoa libera "Exibir sobre outros apps". */
    @PluginMethod
    public void pedir(PluginCall call) {
        if (!Settings.canDrawOverlays(getContext())) {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void mostrar(PluginCall call) {
        if (Settings.canDrawOverlays(getContext())) {
            getContext().startService(new Intent(getContext(), FlutuanteService.class));
        }
        call.resolve();
    }

    @PluginMethod
    public void esconder(PluginCall call) {
        getContext().stopService(new Intent(getContext(), FlutuanteService.class));
        call.resolve();
    }

    // ------------------------------------------------------------------ permissões (passo a passo no app) e oferta em tela cheia

    /** Situação de cada permissão que o app do motorista precisa para receber corrida com o app fechado ou a tela bloqueada. */
    @PluginMethod
    public void permissoes(PluginCall call) {
        Context c = getContext();
        JSObject r = new JSObject();
        r.put("sobrePosicao", Settings.canDrawOverlays(c));
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        r.put("notificacoes", nm != null && nm.areNotificationsEnabled());
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        r.put("bateria", pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        boolean fina = c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        r.put("localizacao", fina);
        r.put("localizacaoSempre", fina && (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || c.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED));
        boolean telaCheia = true;
        if (Build.VERSION.SDK_INT >= 34 && nm != null) telaCheia = nm.canUseFullScreenIntent();
        r.put("telaCheia", telaCheia);
        r.put("fabricante", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    private void abrirTela(Intent i) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
    }

    private void abrirDetalhes() {
        abrirTela(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())));
    }

    /** Abre a tela certa do Android para a permissão pedida: sobre, notificacoes, bateria, localizacao, localizacaoSempre, telaCheia, autoinicio. */
    @PluginMethod
    public void abrir(PluginCall call) {
        String tipo = call.getString("tipo", "");
        Context c = getContext();
        try {
            switch (tipo) {
                case "sobre":
                    abrirTela(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + c.getPackageName())));
                    break;
                case "notificacoes":
                    if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        getActivity().requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 9101);
                    } else {
                        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                        i.putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName());
                        abrirTela(i);
                    }
                    break;
                case "bateria":
                    try {
                        abrirTela(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + c.getPackageName())));
                    } catch (Exception e) {
                        abrirTela(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                    }
                    break;
                case "localizacao":
                    if (c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                        getActivity().requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 9102);
                    } else abrirDetalhes();
                    break;
                case "localizacaoSempre":
                    // Android 11+: "o tempo todo" só se escolhe na tela de permissões do app. Antes, dá para pedir direto.
                    if (Build.VERSION.SDK_INT >= 30) abrirDetalhes();
                    else if (Build.VERSION.SDK_INT >= 29) getActivity().requestPermissions(new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION}, 9103);
                    else abrirDetalhes();
                    break;
                case "telaCheia":
                    if (Build.VERSION.SDK_INT >= 34) abrirTela(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + c.getPackageName())));
                    else abrirDetalhes();
                    break;
                case "autoinicio":
                    abrirAutoinicio();
                    break;
                default:
                    abrirDetalhes();
            }
        } catch (Exception e) {
            try { abrirDetalhes(); } catch (Exception ignorado) { /* sem tela de configurações */ }
        }
        call.resolve();
    }

    /** Início automático / sem restrição de bateria: a tela é diferente em cada fabricante; tenta a conhecida e cai nos detalhes do app. */
    private void abrirAutoinicio() {
        String[][] telas = {
            {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
            {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
            {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"},
            {"com.coloros.oppoguardelf", "com.coloros.powermanager.fuelgauge.PowerUsageModelActivity"},
            {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
            {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"},
            {"com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"},
            {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
            {"com.asus.mobilemanager", "com.asus.mobilemanager.autostart.AutoStartActivity"},
        };
        for (String[] t : telas) {
            try {
                Intent i = new Intent();
                i.setComponent(new ComponentName(t[0], t[1]));
                abrirTela(i);
                return;
            } catch (Exception e) {
                // essa tela não existe neste aparelho: tenta a próxima
            }
        }
        abrirDetalhes();
    }

    /**
     * Chegou uma corrida com o app minimizado ou a tela bloqueada: acorda a tela, sobe uma notificação de chamada com tela cheia
     * (full-screen intent) e, se "Exibir sobre outros apps" estiver liberado, traz o app para a frente por cima de tudo.
     */
    @PluginMethod
    public void ofertaTelaCheia(PluginCall call) {
        Context c = getContext();
        String titulo = call.getString("titulo", "Nova corrida");
        String texto = call.getString("texto", "Toque para ver a chamada");
        try {
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                @SuppressWarnings("deprecation")
                PowerManager.WakeLock w = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, c.getPackageName() + ":oferta");
                w.acquire(15000);
            }
            Intent abrir = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (abrir != null) {
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
                if (Settings.canDrawOverlays(c)) c.startActivity(abrir); // com "exibir sobre outros apps" o sistema deixa abrir direto, por cima do que estiver aberto
            }
        } catch (Exception e) {
            // o sistema recusou: a notificação (ou o próprio app aberto) continua avisando
        }
        call.resolve();
    }

    /** A chamada acabou (aceitou, recusou, expirou ou outro pegou): tira a notificação de chamada. */
    @PluginMethod
    public void cancelarOferta(PluginCall call) {
        try {
            ((NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE)).cancel(4712);
        } catch (Exception e) {
            // nada a cancelar
        }
        call.resolve();
    }
}
