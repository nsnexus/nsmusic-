@echo off
chcp 65001 > nul
title NSMusic - Teste Isolado do Robô Suno Local

echo ========================================================
echo   NSMusic - Teste Isolado do Robô Suno AI (Playwright)
echo ========================================================
echo.
echo Este script executara um teste isolado no Suno.com:
echo 1. Abrira o navegador com seu perfil do Suno
echo 2. Criara uma musica de teste
echo 3. Fara upload dos audios direto pro seu Cloudflare R2
echo.
echo Seus clientes NAO serao afetados.
echo ========================================================
echo.

if not exist node_modules (
  echo Instalando dependencias necessarias...
  call npm install
  call npx playwright install chromium
)

node testar-automacao.js

echo.
echo Pressione qualquer tecla para sair...
pause > nul
