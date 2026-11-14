package __PACOTE__;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

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
