package __PACOTE__;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin do ícone flutuante (só existe no app do motorista).
        registerPlugin(FlutuantePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
