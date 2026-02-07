@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  正在启动服务器 ...
echo  启动成功后，用浏览器打开： http://localhost:3000
echo  作品将保存在本机「以往历史」中，无需登录
echo  关闭此窗口即可停止服务器
echo.
if not exist "server\node_modules" (
    echo  首次运行正在安装依赖 ...
    cd server
    call npm install
    cd ..
)
cd server
node server.js
pause
