package __PACOTE__;

import android.os.Bundle;
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

    @Override
    public void onResume() {
        super.onResume();
        // Volta do segundo plano: o sistema pode ter soltado a flag. O app (ajuste "Manter a tela ligada") limpa de novo se o motorista desligou.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
