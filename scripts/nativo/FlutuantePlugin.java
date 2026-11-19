package __PACOTE__;

import android.content.Intent;
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
}
