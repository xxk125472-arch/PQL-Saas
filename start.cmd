@echo off
setlocal EnableExtensions
chcp 65001 >nul
title PQL Health
rem ==========================================================================
rem  PQL Health one-click start (Windows CMD)
rem  Needs: Python 3.11+ and Node.js 20+ on PATH.
rem  Usage: start.cmd [--rebuild] [--reset-db]
rem  First run: create apps\api\.venv + pip install, copy .env, npm ci + build.
rem  Later runs skip finished steps; --rebuild forces a fresh frontend build.
rem  --reset-db asks twice (in Chinese) and only then deletes the SQLite DB the
rem  backend uses (default data\app.db) and rebuilds it. A plain start NEVER
rem  deletes the database.
rem  Serves the API and apps\web\dist on http://127.0.0.1:8000 only
rem  (set PQL_PORT=xxxx beforehand to use another port, e.g. for testing).
rem ==========================================================================

set "ROOT=%~dp0"
set "API=%ROOT%apps\api"
set "WEB=%ROOT%apps\web"
set "VPY=%API%\.venv\Scripts\python.exe"
if not defined PQL_PORT set "PQL_PORT=8000"
set "PORT=%PQL_PORT%"
set "URL=http://127.0.0.1:%PORT%"
set "REBUILD=0"
set "RESETDB=0"

:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="--rebuild" (
  set "REBUILD=1"
  shift
  goto :parse_args
)
if /i "%~1"=="--reset-db" (
  set "RESETDB=1"
  shift
  goto :parse_args
)
echo [错误] 不认识的参数：%~1
echo        用法：start.cmd             正常启动（不会删除任何数据）
echo              start.cmd --rebuild   强制重新构建前端后启动
echo              start.cmd --reset-db  清空数据库后重建（会二次确认）
goto :fail
:args_done

echo.
echo ==================== PQL Health 一键启动 ====================
echo.

rem ---------------------------------------------------------------- 环境检查
echo [检查] Python 与 Node.js ...
set "PY="
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>&1 && set "PY=python"
if not defined PY py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>&1 && set "PY=py -3"
if not defined PY (
  echo [错误] 没有找到 Python 3.11 或更高版本。
  echo        请到 https://www.python.org/downloads/ 下载安装，
  echo        安装时勾选「Add python.exe to PATH」，装好后重新打开窗口再运行本脚本。
  goto :fail
)

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 没有找到 Node.js。
  echo        请到 https://nodejs.org/ 下载安装 20 或更高版本（LTS），装好后重新打开窗口再运行本脚本。
  goto :fail
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)" >nul 2>&1
if errorlevel 1 (
  echo [错误] Node.js 版本过低，需要 20 或更高版本。当前版本：
  node --version
  goto :fail
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [错误] 找到了 Node.js 但没有 npm，请重新安装 Node.js（默认会带 npm）。
  goto :fail
)
for /f "delims=" %%v in ('%PY% --version 2^>^&1') do echo        %%v
for /f "delims=" %%v in ('node --version') do echo        Node.js %%v

netstat -ano -p tcp | findstr /r /c:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [错误] %PORT% 端口已被占用，可能已经有一个后端在运行。
  echo        如果是之前打开的 PQL Health，直接访问 %URL% 即可；
  echo        否则请先关闭占用 %PORT% 端口的程序，再运行本脚本。
  if "%RESETDB%"=="1" echo        清空数据库前也必须先关闭正在运行的 PQL Health。
  goto :fail
)

rem ---------------------------------------------------------------- 1. 后端虚拟环境
echo.
if exist "%VPY%" (
  echo [1/5] 后端虚拟环境已存在，跳过。
) else (
  echo [1/5] 创建后端虚拟环境 apps\api\.venv ...
  %PY% -m venv "%API%\.venv"
  if errorlevel 1 (
    echo [错误] 创建虚拟环境失败，请确认 Python 安装完整（含 venv 模块）。
    goto :fail
  )
)

rem ---------------------------------------------------------------- 2. 后端依赖
set "NEED_PIP=1"
if exist "%API%\.venv\.requirements.installed" (
  fc /b "%API%\requirements.txt" "%API%\.venv\.requirements.installed" >nul 2>&1 && set "NEED_PIP=0"
)
if "%NEED_PIP%"=="0" (
  echo [2/5] 后端依赖已安装，跳过。
) else (
  echo [2/5] 安装后端依赖（首次约 1-3 分钟）...
  "%VPY%" -m pip install --disable-pip-version-check -r "%API%\requirements.txt"
  if errorlevel 1 (
    echo        默认源安装失败，改用清华镜像重试 ...
    "%VPY%" -m pip install --disable-pip-version-check -r "%API%\requirements.txt" -i https://pypi.tuna.tsinghua.edu.cn/simple
    if errorlevel 1 (
      echo [错误] 后端依赖安装失败，请检查网络后重新运行本脚本。
      goto :fail
    )
  )
  copy /y "%API%\requirements.txt" "%API%\.venv\.requirements.installed" >nul
)

rem ---------------------------------------------------------------- 可选：清空数据库
rem Only reachable with --reset-db; everything else in this script leaves the DB alone.
rem scripts\reset_db.py asks twice in Chinese, then deletes the DB file (cmd's own
rem set /p is unreliable with UTF-8 prompts, so the prompts live in Python).
if not "%RESETDB%"=="1" goto :reset_done
pushd "%API%"
"%VPY%" "%ROOT%scripts\reset_db.py"
set "RCODE=%ERRORLEVEL%"
popd
if not "%RCODE%"=="0" goto :fail
:reset_done

rem ---------------------------------------------------------------- 3. 本地配置 .env
if exist "%ROOT%.env" (
  echo [3/5] 本地配置 .env 已存在，跳过。
) else if exist "%ROOT%.env.example" (
  copy /y "%ROOT%.env.example" "%ROOT%.env" >nul
  if errorlevel 1 (
    echo [错误] 无法创建 .env，请确认当前目录可写。
    goto :fail
  )
  echo [3/5] 已从 .env.example 生成本地配置 .env（飞书凭证可稍后在 .env 或设置页填写）。
) else (
  echo [3/5] 未找到 .env.example，使用默认配置。
)

rem ---------------------------------------------------------------- 4. 前端依赖与构建
set "LOCK=%WEB%\package-lock.json"
if not exist "%LOCK%" set "LOCK=%WEB%\package.json"
set "NEED_NPM=1"
if exist "%WEB%\node_modules\.pql-install-stamp" (
  fc /b "%LOCK%" "%WEB%\node_modules\.pql-install-stamp" >nul 2>&1 && set "NEED_NPM=0"
)
pushd "%WEB%" || (
  echo [错误] 找不到前端目录 apps\web。
  goto :fail
)
if "%NEED_NPM%"=="0" (
  echo [4/5] 前端依赖已安装，跳过。
) else (
  echo [4/5] 安装前端依赖（首次约 1-3 分钟）...
  if exist package-lock.json (call npm ci --no-audit --no-fund) else (call npm install --no-audit --no-fund)
  if errorlevel 1 (
    echo        默认源安装失败，改用 npmmirror 镜像重试 ...
    if exist package-lock.json (call npm ci --no-audit --no-fund --registry=https://registry.npmmirror.com) else (call npm install --no-audit --no-fund --registry=https://registry.npmmirror.com)
    if errorlevel 1 (
      popd
      echo [错误] 前端依赖安装失败，请检查网络后重新运行本脚本。
      goto :fail
    )
  )
  copy /y "%LOCK%" "node_modules\.pql-install-stamp" >nul
  set "REBUILD=1"
)
if not exist "dist\index.html" set "REBUILD=1"
if "%REBUILD%"=="0" (
  echo        前端已构建，跳过（需要重新构建请运行 start.cmd --rebuild）。
) else (
  echo        构建前端 ...
  call npm run build
  if errorlevel 1 (
    popd
    echo [错误] 前端构建失败，请查看上方报错信息。
    goto :fail
  )
)
popd

rem ---------------------------------------------------------------- 5. 数据库迁移
if "%RESETDB%"=="1" (echo [5/5] 重建数据库 ...) else (echo [5/5] 数据库迁移（默认数据库 data\app.db）...)
pushd "%API%"
"%VPY%" -c "from app.core.db import init_db; init_db()"
if errorlevel 1 (
  popd
  echo [错误] 数据库迁移失败，请查看上方报错信息。
  goto :fail
)

rem ---------------------------------------------------------------- 启动
echo.
echo ============================================================
echo   PQL Health 已就绪：%URL%
echo   浏览器会自动打开；关闭本窗口或按 Ctrl+C 即停止服务。
echo ============================================================
echo.
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$u='%URL%'; for($i=0; $i -lt 120; $i++){ try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 ($u + '/health') | Out-Null; Start-Process $u; break } catch { Start-Sleep -Milliseconds 500 } }"
"%VPY%" -m uvicorn app.main:app --host 127.0.0.1 --port %PORT%
set "CODE=%ERRORLEVEL%"
popd
if not "%CODE%"=="0" (
  echo.
  echo [错误] 后端异常退出（退出码 %CODE%），请查看上方报错信息。
  goto :fail
)
endlocal
exit /b 0

:fail
echo.
echo 启动已中止。处理好上面的问题后，重新双击 start.cmd 即可。
pause
endlocal
exit /b 1
