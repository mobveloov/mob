package __PACOTE__;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;

/**
 * Bolha com o ícone do app (quadrado de cantos arredondados), por cima de outros aplicativos. Dá para arrastar; um toque traz o app de volta.
 * Só roda enquanto o motorista está online e com o app minimizado (quem liga e desliga é o app, pelo plugin Flutuante).
 */
public class FlutuanteService extends Service {
    /** Lado da bolha em dp: igual nos dois apps. */
    private static final int TAMANHO = 48;
    private WindowManager janela;
    private View bolinha;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (bolinha == null) mostrar();
        return START_NOT_STICKY;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void mostrar() {
        janela = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        ImageView img = new ImageView(this);
        // O mesmo ícone oficial do launcher (vem da Personalização do painel), em quadrado de cantos arredondados, nunca redondo.
        // O ícone adaptativo do Android é um quadro de 108 dp em que só os 72 dp do meio aparecem; desenhar o quadro inteiro deixava
        // uma borda de fundo (preto) sobrando. Aqui desenha o quadro e recorta só a parte visível.
        try {
            // Arte COMPLETA do ícone (sem o recorte do ícone adaptativo, que cortava o "UP" e o boneco): imagem própria do build.
            int idArte = getResources().getIdentifier("icone_flutuante", "drawable", getPackageName());
            if (idArte != 0) img.setImageResource(idArte);
            else {
                Drawable icone = getPackageManager().getApplicationIcon(getPackageName());
                img.setImageBitmap(recortarIcone(icone));
            }
        } catch (Exception e) { /* sem ícone: a bolha fica vazia */ }
        img.setScaleType(ImageView.ScaleType.FIT_CENTER);
        img.setElevation(dp(4));
        img.setClipToOutline(false); // a arte já vem com os cantos arredondados: nada é recortado pela view
        final float raio = dp(TAMANHO) * 0.14f; // só a sombra segue o canto da arte
        img.setOutlineProvider(new android.view.ViewOutlineProvider() {
            @Override
            public void getOutline(View v, android.graphics.Outline o) { o.setRoundRect(0, 0, v.getWidth(), v.getHeight(), raio); }
        });

        int tipo = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        final WindowManager.LayoutParams p = new WindowManager.LayoutParams(
                dp(TAMANHO), dp(TAMANHO), tipo,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        p.gravity = Gravity.TOP | Gravity.START;
        p.x = dp(12);
        p.y = dp(160);

        final int alvoTam = dp(64);
        img.setOnTouchListener(new View.OnTouchListener() {
            private int x0, y0;
            private float tx0, ty0;
            private boolean moveu, segurou;
            private final android.os.Handler relogio = new android.os.Handler(android.os.Looper.getMainLooper());
            private final Runnable doisSegundos = new Runnable() {
                @Override
                public void run() { if (!moveu) { segurou = true; vibrar(); mostrarSos(); } }
            };

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        x0 = p.x; y0 = p.y; tx0 = e.getRawX(); ty0 = e.getRawY(); moveu = false; segurou = false;
                        relogio.postDelayed(doisSegundos, 2000); // segurar 2 s sem arrastar: pede confirmação do SOS
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        if (segurou) return true;
                        if (!moveu && (Math.abs(e.getRawX() - tx0) > dp(6) || Math.abs(e.getRawY() - ty0) > dp(6))) { moveu = true; relogio.removeCallbacks(doisSegundos); mostrarAlvo(alvoTam); }
                        if (!moveu) return true;
                        p.x = x0 + Math.round(e.getRawX() - tx0);
                        p.y = y0 + Math.round(e.getRawY() - ty0);
                        janela.updateViewLayout(v, p);
                        alvoAceso(sobreAlvo(p, alvoTam));
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        relogio.removeCallbacks(doisSegundos);
                        if (segurou) return true; // o diálogo do SOS já está na tela
                        boolean fechar = moveu && sobreAlvo(p, alvoTam);
                        esconderAlvo();
                        if (fechar) { stopSelf(); return true; } // soltou no X: a bolha é removida
                        if (!moveu) { abrirApp(); return true; }
                        encostarNaBorda(v, p); // soltou fora: volta para a borda mais perto
                        return true;
                    default:
                        return false;
                }
            }
        });
        bolinha = img;
        try {
            janela.addView(bolinha, p);
        } catch (Exception e) {
            bolinha = null;
            stopSelf();
        }
    }

    // ------------------------------------------------------------------ zona "X" (aparece ao arrastar a bolha)
    private View alvo;
    private WindowManager.LayoutParams alvoP;
    private boolean alvoLigado;

    private int tipoJanela() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
    }

    /** Círculo escuro com um X desenhado (sem emoji), no meio da parte de baixo da tela. */
    private void mostrarAlvo(final int tam) {
        if (alvo != null) return;
        alvo = new View(this) {
            @Override
            protected void onDraw(android.graphics.Canvas c) {
                android.graphics.Paint f = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
                f.setColor(alvoLigado ? 0xFFE53935 : 0xCC111111);
                float r = getWidth() / 2f;
                c.drawCircle(r, r, alvoLigado ? r : r * 0.86f, f);
                android.graphics.Paint l = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
                l.setColor(0xFFFFFFFF); l.setStrokeWidth(dp(3)); l.setStrokeCap(android.graphics.Paint.Cap.ROUND);
                float d = getWidth() * 0.17f;
                c.drawLine(r - d, r - d, r + d, r + d, l);
                c.drawLine(r + d, r - d, r - d, r + d, l);
            }
        };
        alvoP = new WindowManager.LayoutParams(tam, tam, tipoJanela(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT);
        alvoP.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        alvoP.y = dp(48);
        try { janela.addView(alvo, alvoP); } catch (Exception e) { alvo = null; }
    }

    private boolean sobreAlvo(WindowManager.LayoutParams p, int tam) {
        if (alvoP == null) return false;
        android.util.DisplayMetrics m = getResources().getDisplayMetrics();
        float cx = p.x + dp(TAMANHO) / 2f, cy = p.y + dp(TAMANHO) / 2f;
        float ax = m.widthPixels / 2f, ay = m.heightPixels - alvoP.y - tam / 2f;
        double dist = Math.hypot(cx - ax, cy - ay);
        return dist < tam * 0.9;
    }

    private void alvoAceso(boolean ligado) {
        if (alvo == null || ligado == alvoLigado) return;
        alvoLigado = ligado;
        alvo.animate().scaleX(ligado ? 1.25f : 1f).scaleY(ligado ? 1.25f : 1f).setDuration(120).start();
        alvo.invalidate();
    }

    private void esconderAlvo() {
        if (alvo != null) { try { janela.removeView(alvo); } catch (Exception e) { /* já saiu */ } }
        alvo = null; alvoP = null; alvoLigado = false;
    }

    /** Solta a bolha fora do X: ela volta para a borda esquerda ou direita mais próxima. */
    private void encostarNaBorda(View v, WindowManager.LayoutParams p) {
        android.util.DisplayMetrics m = getResources().getDisplayMetrics();
        int margem = dp(8);
        p.x = (p.x + dp(TAMANHO) / 2 < m.widthPixels / 2) ? margem : m.widthPixels - dp(TAMANHO) - margem;
        p.y = Math.max(dp(40), Math.min(p.y, m.heightPixels - dp(TAMANHO) - dp(140)));
        try { janela.updateViewLayout(v, p); } catch (Exception e) { /* já saiu */ }
    }

    // ------------------------------------------------------------------ SOS pela bolha (segurar 2 s sem arrastar)
    private View sosView;

    private void vibrar() {
        try {
            android.os.Vibrator vb = (android.os.Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vb == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) vb.vibrate(android.os.VibrationEffect.createOneShot(120, android.os.VibrationEffect.DEFAULT_AMPLITUDE));
            else vb.vibrate(120);
        } catch (Exception e) { /* sem vibrador */ }
    }

    private android.widget.Button botao(String texto, int cor, int corTexto) {
        android.widget.Button b = new android.widget.Button(this);
        b.setText(texto); b.setAllCaps(false); b.setTextColor(corTexto); b.setTextSize(16);
        android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
        g.setColor(cor); g.setCornerRadius(dp(24));
        b.setBackground(g);
        return b;
    }

    /** Cartão no meio da tela: "Pedir ajuda (SOS)?" com Confirmar e Cancelar. */
    private void mostrarSos() {
        if (sosView != null) return;
        android.widget.LinearLayout caixa = new android.widget.LinearLayout(this);
        caixa.setOrientation(android.widget.LinearLayout.VERTICAL);
        caixa.setPadding(dp(22), dp(22), dp(22), dp(18));
        android.graphics.drawable.GradientDrawable fundo = new android.graphics.drawable.GradientDrawable();
        fundo.setColor(0xFFFFFFFF); fundo.setCornerRadius(dp(26));
        caixa.setBackground(fundo); caixa.setElevation(dp(12));
        android.widget.TextView t = new android.widget.TextView(this);
        t.setText("Pedir ajuda (SOS)?"); t.setTextColor(0xFF111111); t.setTextSize(20); t.setTypeface(null, android.graphics.Typeface.BOLD);
        android.widget.TextView d = new android.widget.TextView(this);
        d.setText("A central recebe o alerta com a sua localização e a corrida atual."); d.setTextColor(0xFF555555); d.setTextSize(14); d.setPadding(0, dp(8), 0, dp(16));
        android.widget.Button ok = botao("Confirmar SOS", 0xFFD33A3A, 0xFFFFFFFF), nao = botao("Cancelar", 0xFFEDEDED, 0xFF111111);
        android.widget.LinearLayout.LayoutParams lp = new android.widget.LinearLayout.LayoutParams(android.widget.LinearLayout.LayoutParams.MATCH_PARENT, dp(52));
        lp.topMargin = dp(8);
        caixa.addView(t); caixa.addView(d); caixa.addView(ok, lp); caixa.addView(nao, lp);
        ok.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { fecharSos(); enviarSos(); } });
        nao.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { fecharSos(); } });
        WindowManager.LayoutParams lpJ = new WindowManager.LayoutParams(Math.min(getResources().getDisplayMetrics().widthPixels - dp(48), dp(340)), WindowManager.LayoutParams.WRAP_CONTENT, tipoJanela(),
                WindowManager.LayoutParams.FLAG_DIM_BEHIND | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT);
        lpJ.dimAmount = 0.5f; lpJ.gravity = Gravity.CENTER;
        sosView = caixa;
        try { janela.addView(sosView, lpJ); } catch (Exception e) { sosView = null; }
    }

    private void fecharSos() {
        if (sosView != null) { try { janela.removeView(sosView); } catch (Exception e) { /* já saiu */ } }
        sosView = null;
    }

    /** Mesmo alerta do botão SOS do app: POST /sos com a posição; o servidor junta a corrida atual e avisa a central. */
    private void enviarSos() {
        final String u = PosicaoService.sosUrl, t = PosicaoService.sosToken;
        final double lat = PosicaoService.sosLat, lng = PosicaoService.sosLng;
        if (u == null || t == null) { abrirApp(); return; } // sem sessão guardada: abre o app para o motorista usar o botão SOS
        new Thread(new Runnable() {
            @Override
            public void run() {
                java.net.HttpURLConnection c = null;
                boolean enviou = false;
                try {
                    c = (java.net.HttpURLConnection) new java.net.URL(u).openConnection();
                    c.setRequestMethod("POST"); c.setConnectTimeout(8000); c.setReadTimeout(8000); c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json"); c.setRequestProperty("Authorization", "Bearer " + t);
                    String corpo = Double.isNaN(lat) ? "{\"motivo\":\"SOS pela bolha\"}" : "{\"lat\":" + lat + ",\"lng\":" + lng + ",\"motivo\":\"SOS pela bolha\"}";
                    java.io.OutputStream o = c.getOutputStream(); o.write(corpo.getBytes("UTF-8")); o.close();
                    enviou = c.getResponseCode() == 200;
                } catch (Exception e) { /* sem rede */ } finally { if (c != null) c.disconnect(); }
                final boolean deu = enviou;
                new android.os.Handler(android.os.Looper.getMainLooper()).post(new Runnable() {
                    @Override public void run() { android.widget.Toast.makeText(getApplicationContext(), deu ? "SOS enviado à central" : "Não consegui enviar o SOS. Abra o app e use o botão SOS.", android.widget.Toast.LENGTH_LONG).show(); }
                });
            }
        }).start();
    }

    private android.graphics.Bitmap recortarIcone(Drawable icone) {
        final int lado = 432; // 108 dp x 4
        android.graphics.Bitmap quadro = android.graphics.Bitmap.createBitmap(lado, lado, android.graphics.Bitmap.Config.ARGB_8888);
        android.graphics.Canvas tela = new android.graphics.Canvas(quadro);
        icone.setBounds(0, 0, lado, lado);
        icone.draw(tela);
        boolean adaptativo = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && icone instanceof android.graphics.drawable.AdaptiveIconDrawable;
        if (!adaptativo) return quadro;
        int margem = lado / 6; // 18 dp de cada lado: sobram os 72 dp visíveis
        return android.graphics.Bitmap.createBitmap(quadro, margem, margem, lado - 2 * margem, lado - 2 * margem);
    }

    private void abrirApp() {
        Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (i != null) {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(i);
        }
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (bolinha != null && janela != null) {
            try { janela.removeView(bolinha); } catch (Exception e) { /* já saiu */ }
        }
        bolinha = null;
        esconderAlvo();
        fecharSos();
        super.onDestroy();
    }
}
