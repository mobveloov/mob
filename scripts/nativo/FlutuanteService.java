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
 * Bolinha com o ícone do app, por cima de outros aplicativos. Dá para arrastar; um toque traz o app de volta.
 * Só roda enquanto o motorista está online e com o app minimizado (quem liga e desliga é o app, pelo plugin Flutuante).
 */
public class FlutuanteService extends Service {
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
        try {
            Drawable icone = getPackageManager().getApplicationIcon(getPackageName());
            img.setImageDrawable(icone);
        } catch (Exception e) { /* sem ícone: a bolinha fica vazia */ }
        img.setPadding(dp(4), dp(4), dp(4), dp(4));
        img.setElevation(dp(6));

        int tipo = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        final WindowManager.LayoutParams p = new WindowManager.LayoutParams(
                dp(56), dp(56), tipo,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        p.gravity = Gravity.TOP | Gravity.START;
        p.x = dp(12);
        p.y = dp(160);

        img.setOnTouchListener(new View.OnTouchListener() {
            private int x0, y0;
            private float tx0, ty0;
            private boolean moveu;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        x0 = p.x; y0 = p.y; tx0 = e.getRawX(); ty0 = e.getRawY(); moveu = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        if (Math.abs(e.getRawX() - tx0) > dp(6) || Math.abs(e.getRawY() - ty0) > dp(6)) moveu = true;
                        p.x = x0 + Math.round(e.getRawX() - tx0);
                        p.y = y0 + Math.round(e.getRawY() - ty0);
                        janela.updateViewLayout(v, p);
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moveu) abrirApp();
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
        super.onDestroy();
    }
}
