'use client';

import React from 'react';
import CriarMusica from '@/app/criar/page';
import { faqJsonLd, howToJsonLd } from '@/lib/structuredData';

export default function Home() {
  return (
    <>
      {/* Dados estruturados JSON-LD para motores de busca e IAs */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([faqJsonLd(), howToJsonLd()]),
        }}
      />
      <CriarMusica />
    </>
  );
}
