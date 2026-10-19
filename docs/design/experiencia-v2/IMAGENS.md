# Imagens da nova experiência NS Music

Data: 19/10/2026. Geradas com o recurso integrado `image_gen`, sem uso de CLI ou chave de API do projeto.

## Entregáveis

| Arquivo | Uso na proposta | Dimensões e tamanho |
|---|---|---|
| `assets/familia-editorial.webp` | Categoria família, painel editorial e capa demonstrativa | 1280 × 853; 91.702 bytes |
| `assets/amor-editorial.webp` | Categoria amor/casal | 1280 × 853; 89.920 bytes |
| `assets/logo.png` | Identidade oficial | Cópia fiel de `public/logo.png`; não foi gerada nem redesenhada |

As fotografias são cenas sintéticas editoriais. Não representam compradores, depoimentos nem histórias reais de clientes. Não enviamos dados de clientes para produzir estas imagens. A inspeção visual confirmou a composição, rostos, ausência de texto/marca e adequação à direção fotográfica escolhida. Revisar os recortes finais também no dispositivo antes de publicar.

Os originais PNG foram preservados no diretório de imagens geradas do Codex; as cópias de consumo desta proposta foram codificadas em WebP de qualidade 82 e largura 1280, sem alterar o conteúdo da cena.

## Prompt final — família

```text
Use case: photorealistic-natural. Asset type: editorial photograph for NS Music, a Brazilian personalized music gift website. Primary request: a beautiful, emotionally authentic moment of a Brazilian mother around 55 with her adult daughter around 28 on a simple elegant sofa at home, the mother wearing small wireless earbuds listening to a song her daughter made for her, daughter leaning her head softly against her mother's shoulder. Both have medium brown skin, natural dark hair, realistic age and skin texture, quiet tender smiles rather than exaggerated laughing. Scene: lived-in tasteful Brazilian home, warm cream linen, subtle wood, late afternoon window light. Style: premium lifestyle editorial photography, photorealistic, natural pores and hair strands, cinematic but credible, subtle film grain, warm restrained color grading, 50mm lens, shallow depth of field. Composition: landscape 3:2, waist-up, subjects grouped centrally with generous breathing room, eyes and faces safe for mobile crop, no copy or graphic overlays. Constraints: exactly two people, anatomically natural hands if visible; no text, no logos, no watermarks, no vectors, no 3D, no plastic skin, no glowing music notes. Do not portray a real customer testimonial.
```

## Prompt final — amor

```text
Use case: photorealistic-natural. Asset type: occasion card and editorial cover for NS Music personalized musical gifts website. Primary request: candid photograph of a Brazilian couple in their late thirties, a black woman with natural curly hair and a brown-skinned man with short dark hair, warmly embracing forehead to forehead in an intimate moment at their anniversary dinner on a cozy home balcony. Waist-up framing, genuine relaxed gentle expressions, eyes softly closed, natural adult proportions and skin texture. Scene: a simple tasteful balcony with softly blurred plants, understated flowers on small table in background. Style: premium cinematic lifestyle photography, photorealistic, soft film grain, 50mm lens, subtle warm color grading, late afternoon natural light. Composition: landscape 3:2, faces near center and safe for square thumbnail cropping, uncluttered scene. Constraints: no text, no logos, no watermark, no vector illustration, no 3D, no plastic skin, no heart graphics, no neon effects. This is illustrative editorial imagery, not a customer testimonial.
```

## Próxima produção

Completar a coleção com aniversário/amizade, pai/filho, saudade e fé quando as telas e os recortes estiverem definidos. Não usar uma foto de festa para homenagem de luto, nem fotografia genérica como se fosse a pessoa do pedido. A capa enviada pelo usuário tem prioridade; manter fallback editorial e atribuição clara de contexto.

Para produção: derivar versões responsivas, recortar sem cortar rostos, reservar dimensões, carregar abaixo da dobra sob demanda e usar `next/image` conforme a configuração de hospedagem do projeto.
