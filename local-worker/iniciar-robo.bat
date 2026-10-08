@echo off
chcp 65001 > nul
title NSMusic - Robo Desktop Suno AI
color 0B

echo ============================================================
echo         🎵 NSMUSIC - ROBO LOCAL DE GERACAO SUNO AI
echo ============================================================
echo.

REM 1. Verifica se o Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERRO] O Node.js nao foi encontrado no seu computador!
    echo Por favor, instale o Node.js v18+ em https://nodejs.org
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"

REM 2. Prepara o arquivo .env se ainda nao existir
if not exist ".env" (
    if exist "..\.env.local" (
        echo [INFO] Configurando .env a partir do projeto principal...
        copy "..\.env.local" ".env" >nul
    )
)

REM 3. Instala dependencias se necessario
if not exist "node_modules" (
    echo [INFO] Primeira execucao detectada! Instalando dependencias...
    call npm install
    echo [INFO] Configurando navegador Chromium...
    call npx playwright install chromium
)

if not exist "node_modules\ffmpeg-static" (
    echo [INFO] Instalando modulos de conversao de audio para MP3...
    call npm install
)

echo.
echo [INFO] Iniciando o Robo Local...
echo [INFO] Modo Anti-Suspensao ativo: a tela e o PC nao desligarao enquanto o robo estiver aberto.
echo Mantenha esta janela aberta enquanto quiser atender pedidos pelo seu Suno.
echo ============================================================
echo.

node robo-suno.js

echo.
echo ============================================================
echo [AVISO] O processo do robo foi encerrado.
echo Pressione qualquer tecla para fechar esta janela.
pause
