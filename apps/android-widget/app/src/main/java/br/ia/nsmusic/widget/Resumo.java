package br.ia.nsmusic.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Busca os números do dia em /api/widget/resumo e guarda o último resultado. */
final class Resumo {
    static final String URL_RESUMO = "https://nsmusic.ia.br/api/widget/resumo";
    static final String URL_PAINEL = "https://nsmusic.ia.br/admin/dashboard";
    private static final String PREFS = "nsmusic_widget";

    private Resumo() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String chave(Context c) {
        return prefs(c).getString("chave", "");
    }

    /** Resultado de uma busca: json != null em caso de sucesso; senão erro tem a mensagem. */
    static final class Busca {
        final JSONObject json;
        final String erro;
        Busca(JSONObject json, String erro) { this.json = json; this.erro = erro; }
    }

    static Busca buscar(String chave) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(URL_RESUMO).openConnection();
            con.setConnectTimeout(15000);
            con.setReadTimeout(55000); // recálculo sem cache leva até ~40 s
            con.setRequestProperty("Authorization", "Bearer " + chave);
            con.setRequestProperty("Accept", "application/json");
            int status = con.getResponseCode();
            BufferedReader r = new BufferedReader(new InputStreamReader(
                    status >= 400 ? con.getErrorStream() : con.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String linha;
            while ((linha = r.readLine()) != null) sb.append(linha);
            r.close();
            JSONObject json = new JSONObject(sb.toString());
            if (status == 401) return new Busca(null, "Chave inválida");
            if (status >= 400 || !json.optBoolean("ok")) return new Busca(null, json.optString("error", "Erro " + status));
            return new Busca(json, null);
        } catch (Exception e) {
            return new Busca(null, "Sem conexão");
        } finally {
            if (con != null) con.disconnect();
        }
    }

    static void salvarUltimo(Context c, JSONObject json) {
        prefs(c).edit().putString("ultimo", json.toString()).apply();
    }

    static JSONObject ultimo(Context c) {
        try {
            String s = prefs(c).getString("ultimo", null);
            return s == null ? null : new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    static String reais(double v) {
        NumberFormat f = NumberFormat.getCurrencyInstance(new Locale("pt", "BR"));
        f.setMaximumFractionDigits(v >= 10000 || v <= -10000 ? 0 : 2);
        return f.format(v).replace(' ', ' ');
    }

    static String horaBr(String iso) {
        try {
            SimpleDateFormat in = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            in.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = in.parse(iso.substring(0, 19));
            SimpleDateFormat out = new SimpleDateFormat("HH:mm", Locale.US);
            out.setTimeZone(TimeZone.getTimeZone("America/Sao_Paulo"));
            return out.format(d);
        } catch (Exception e) {
            return "";
        }
    }
}
