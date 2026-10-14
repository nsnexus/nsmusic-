import React, { Suspense } from 'react';
import GravarVozView from './GravarVozView';

export const runtime = 'edge';

export async function generateMetadata({ params }) {
  return {
    title: 'Grave sua Voz — NS Music',
    description: 'Cadastre sua voz para criar músicas personalizadas com Inteligência Artificial.',
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function PaginaGravarVoz({ params }) {
  const token = params?.token;

  return (
    <Suspense
      fallback={
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#090d16',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: '4px solid #7c3aed',
            borderTopColor: 'transparent',
            animation: 'spin 1s linear infinite'
          }} />
        </div>
      }
    >
      <GravarVozView token={token} />
    </Suspense>
  );
}
