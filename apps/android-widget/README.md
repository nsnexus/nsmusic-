# NS Music · Widget (Android)

Widget de tela inicial com os números do dia: faturamento, lucro líquido (faturamento − anúncios −
Kie − WhatsApp) com a margem sobre os gastos (lucro ÷ gastos, ex.: gastou 2.000 e lucrou 1.000 = 50%), vendas e ritmo (hoje × média dos últimos 7 dias, com projeção). Lê
`https://nsmusic.ia.br/api/widget/resumo` com a chave `WIDGET_TOKEN` (cabeçalho
`Authorization: Bearer`). Atualiza a cada 30 min, ao tocar em ⟳, e ao salvar a chave no app.

## Gerar o APK

```bash
echo "sdk.dir=/caminho/do/android-sdk" > local.properties   # platforms;android-34 + build-tools;34.0.0
gradle assembleRelease                                        # Gradle 8.9+ e JDK 17+
# saída: app/build/outputs/apk/release/app-release.apk
```

Assinado com `debug.keystore` (fixo no repositório, senha pública `android`) para cada versão nova
instalar por cima da anterior. Para chave própria: `NSW_KEYSTORE`, `NSW_KEYSTORE_PASS`, `NSW_KEY_ALIAS`.
Lembre de subir `versionCode` em `app/build.gradle` a cada versão.

## Instalar e usar

1. Instale o APK (o Android pede para permitir "instalar apps desconhecidos").
2. Abra o app **NS Music**, cole a chave (`WIDGET_TOKEN` do Cloudflare) e toque em **Salvar e testar**.
3. Na tela inicial: segure num espaço vazio → Widgets → **NS Music · Hoje**.
4. Xiaomi/HyperOS: em Configurações → Apps → NS Music, ative **Início automático** e deixe a
   bateria **Sem restrições**, senão o sistema pode não deixar o widget atualizar sozinho.
