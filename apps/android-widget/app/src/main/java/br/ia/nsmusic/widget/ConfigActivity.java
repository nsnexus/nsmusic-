package br.ia.nsmusic.widget;

import android.app.Activity;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import org.json.JSONObject;

/** Tela do app: colar a chave do widget e testar. */
public class ConfigActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_config);

        EditText campo = findViewById(R.id.campo_chave);
        Button salvar = findViewById(R.id.botao_salvar);
        TextView resultado = findViewById(R.id.resultado);
        campo.setText(Resumo.chave(this));

        salvar.setOnClickListener(x -> {
            String chave = campo.getText().toString().trim();
            Resumo.prefs(this).edit().putString("chave", chave).apply();
            resultado.setText("Testando…");
            salvar.setEnabled(false);
            new Thread(() -> {
                Resumo.Busca b = chave.isEmpty() ? new Resumo.Busca(null, "Cole a chave primeiro") : Resumo.buscar(chave);
                if (b.json != null) Resumo.salvarUltimo(this, b.json);
                ResumoWidget.mostrar(this, b.json != null ? b.json : Resumo.ultimo(this), b.erro);
                runOnUiThread(() -> {
                    salvar.setEnabled(true);
                    if (b.json != null) {
                        JSONObject j = b.json;
                        resultado.setText("✅ Funcionando!\n\nHoje: " + Resumo.reais(j.optDouble("faturamento", 0))
                                + " · " + j.optInt("vendas", 0) + " vendas\nLucro: " + Resumo.reais(j.optDouble("lucro", 0))
                                + "\n\nAgora adicione o widget na tela inicial.");
                    } else {
                        resultado.setText("❌ " + b.erro);
                    }
                });
            }).start();
        });
    }
}
