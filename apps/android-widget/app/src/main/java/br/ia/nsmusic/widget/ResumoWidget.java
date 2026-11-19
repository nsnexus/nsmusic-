package br.ia.nsmusic.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** Widget "NS Music · Hoje": faturamento, lucro líquido (com % sobre os gastos), vendas e ritmo do dia. */
public class ResumoWidget extends AppWidgetProvider {
    static final String ACAO_ATUALIZAR = "br.ia.nsmusic.widget.ATUALIZAR";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        // Redesenha NA HORA com o último resultado salvo, antes de ir à internet. Depois de instalar
        // uma versão nova, o launcher ainda guarda o desenho da versão anterior (com ids de tela que
        // mudaram) e mostra "Não é possível carregar o widget" até receber um desenho novo; sem isto,
        // o desenho novo só chegava depois da busca na API (até ~1 min, ou nunca se ela falhasse).
        mostrar(context, Resumo.ultimo(context), "Atualizando…");
        atualizarEmSegundoPlano(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, android.os.Bundle opcoes) {
        mostrar(context, Resumo.ultimo(context), null);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
            mostrar(context, Resumo.ultimo(context), "Atualizando…");
            atualizarEmSegundoPlano(context);
        } else if (ACAO_ATUALIZAR.equals(intent.getAction())) {
            mostrar(context, Resumo.ultimo(context), "Atualizando…");
            atualizarEmSegundoPlano(context);
        }
    }

    private void atualizarEmSegundoPlano(Context context) {
        final PendingResult pendente = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                atualizarAgora(app);
            } finally {
                pendente.finish();
            }
        }).start();
    }

    /** Busca na API e redesenha todos os widgets. Chamar fora da thread principal. */
    static void atualizarAgora(Context context) {
        String chave = Resumo.chave(context);
        if (chave.isEmpty()) {
            mostrar(context, null, "Toque para configurar");
            return;
        }
        Resumo.Busca b = Resumo.buscar(chave);
        if (b.json != null) {
            Resumo.salvarUltimo(context, b.json);
            mostrar(context, b.json, null);
        } else {
            mostrar(context, Resumo.ultimo(context), b.erro);
        }
    }

    static void mostrar(Context context, JSONObject json, String aviso) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, ResumoWidget.class));
        if (ids.length == 0) return;

        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_resumo);
        boolean semChave = Resumo.chave(context).isEmpty();

        if (json != null) {
            double lucro = json.optDouble("lucro", 0);
            JSONObject ritmo = json.optJSONObject("ritmo");
            int pct = ritmo != null ? ritmo.optInt("percentualVsMedia", 0) : 0;

            v.setTextViewText(R.id.faturamento, Resumo.reais(json.optDouble("faturamento", 0)));
            v.setTextViewText(R.id.lucro, Resumo.reais(lucro));
            v.setTextColor(R.id.lucro, Color.parseColor(lucro >= 0 ? "#4ADE80" : "#F87171"));
            // Margem sobre os gastos do dia: lucro ÷ (anúncios + Kie + WhatsApp). Ex.: gastou
            // R$ 2.000 e lucrou R$ 1.000 → 50%. Sem gasto no dia, não há o que dividir.
            JSONObject despesas = json.optJSONObject("despesas");
            double gastos = despesas != null ? despesas.optDouble("total", 0) : 0;
            if (gastos > 0.009) {
                long margem = Math.round(lucro / gastos * 100);
                v.setTextViewText(R.id.margem, (margem >= 0 ? "▲ " : "▼ ") + margem + "% sobre os gastos");
                v.setTextColor(R.id.margem, Color.parseColor(margem >= 0 ? "#4ADE80" : "#F87171"));
            } else {
                v.setTextViewText(R.id.margem, "sem gastos hoje");
                v.setTextColor(R.id.margem, Color.parseColor("#B3FFFFFF"));
            }
            v.setTextViewText(R.id.vendas, String.valueOf(json.optInt("vendas", 0)));
            v.setTextViewText(R.id.ritmo, (pct >= 0 ? "▲ +" : "▼ ") + pct + "%");
            v.setTextColor(R.id.ritmo, Color.parseColor(pct >= 0 ? "#4ADE80" : "#F87171"));
            v.setTextViewText(R.id.projecao, ritmo != null
                    ? "proj. " + Resumo.reais(ritmo.optDouble("projecaoFaturamento", 0))
                    : "");
            String hora = Resumo.horaBr(json.optString("atualizadoEm", ""));
            v.setTextViewText(R.id.atualizado, aviso != null ? aviso : (hora.isEmpty() ? "" : "às " + hora));
        } else {
            v.setTextViewText(R.id.atualizado, aviso != null ? aviso : "");
        }

        // Toque no widget: abre o Dashboard (ou a configuração, se ainda não tem chave).
        Intent abrir = semChave
                ? new Intent(context, ConfigActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                : new Intent(Intent.ACTION_VIEW, Uri.parse(Resumo.URL_PAINEL));
        v.setOnClickPendingIntent(R.id.raiz, PendingIntent.getActivity(context, 1, abrir,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        // ⟳: atualiza na hora.
        Intent atualizar = new Intent(context, ResumoWidget.class).setAction(ACAO_ATUALIZAR);
        v.setOnClickPendingIntent(R.id.botao_atualizar, PendingIntent.getBroadcast(context, 2, atualizar,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        manager.updateAppWidget(ids, v);
    }
}
