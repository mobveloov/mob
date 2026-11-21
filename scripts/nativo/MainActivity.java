package __PACOTE__;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.provider.Settings;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin do ícone flutuante (só existe no app do motorista).
        registerPlugin(FlutuantePlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); // tela acesa com o app aberto
    }

    /** A bolha flutuante só existe com o app MINIMIZADO (a Activity não está mais visível) e quando o motorista está online. */
    @Override
    public void onStop() {
        super.onStop();
        try {
            SharedPreferences sp = getSharedPreferences("flutuante", Context.MODE_PRIVATE);
            if (sp.getBoolean("bolha", false) && Settings.canDrawOverlays(this)) startService(new Intent(this, FlutuanteService.class));
        } catch (Exception e) {
            // sem permissão ou o sistema não deixou: sem bolha
        }
    }

    /** Voltou para o app: a bolha some (dentro do app ela nunca aparece). */
    @Override
    public void onStart() {
        super.onStart();
        try { stopService(new Intent(this, FlutuanteService.class)); } catch (Exception e) { /* já parada */ }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Volta do segundo plano: o sistema pode ter soltado a flag. O app (ajuste "Manter a tela ligada") limpa de novo se o motorista desligou.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
