package __PACOTE__;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Recebe o push de ALTA PRIORIDADE só de dados mesmo com o app fechado ou em repouso (Doze) e transforma em chamada de corrida em tela
 * cheia (OfertaTelaCheia). Só entra no APK quando a empresa tem Firebase configurado (build-app-proprio.mjs).
 * Mensagens de outros tipos (notificação comum) são mostradas pelo próprio sistema quando o app está fechado.
 */
public class OfertaMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(RemoteMessage mensagem) {
        Map<String, String> d = mensagem.getData();
        if (d == null) return;
        String tipo = d.get("tipo");
        if ("oferta".equals(tipo) || "sos".equals(tipo)) {
            String titulo = d.get("titulo");
            String texto = d.get("texto");
            OfertaTelaCheia.mostrar(getApplicationContext(), titulo == null ? "Nova corrida" : titulo, texto == null ? "Toque para ver a chamada" : texto);
        }
    }

    /** Token novo do aparelho: guarda; o app registra de novo no servidor na próxima abertura. */
    @Override
    public void onNewToken(String token) {
        SharedPreferences sp = getSharedPreferences("flutuante", Context.MODE_PRIVATE);
        sp.edit().putString("tokenNovo", token).apply();
    }
}
