@echo off
chcp 65001 > nul
title NSMusic - Robô Desktop Suno AI
color 0B

echo ============================================================
echo         🎵 NSMUSIC - ROBÔ LOCAL DE GERAÇÃO SUNO AI
echo ============================================================
echo.

:: 1. Verifica se o Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERRO] O Node.js não foi encontrado no seu computador!
    echo Por favor, instale o Node.js v18+ em https://nodejs.org
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"

:: 2. Prepara o arquivo .env se ainda não existir
if not exist ".env" (
    if exist "..\.env.local" (
        echo [INFO] Configurando .env a partir do projeto principal...
        copy "..\.env.local" ".env" >nul
    ) else (
        if exist ".env.example" (
            echo [INFO] Criando .env a partir do .env.example...
            copy ".env.example" ".env" >nul
        )
    )
)

:: 3. Instala dependências se necessário
if not exist "node_modules\" (
    echo [INFO] Primeira execução detectada! Instalando dependências...
    call npm install
    echo [INFO] Configurando navegador Chromium...
    call npx playwright install chromium
) else (
    if not exist "node_modules\ffmpeg-static\" (
        echo [INFO] Instalando dependências de áudio (ffmpeg-static)...
        call npm install
    )
)

echo.
echo [INFO] Iniciando o Robô Local...
echo Mantenha esta janela aberta enquanto quiser atender pedidos pelo seu Suno.
echo ============================================================
echo.

node robo-suno.js

if %errorlevel% neq 0 (
    echo.
    echo [AVISO] O processo do robô foi encerrado com código %errorlevel%.
    pause
)
