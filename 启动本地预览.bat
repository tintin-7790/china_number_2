@echo off
chcp 65001 >nul
echo.
echo  正在启动本地预览服务器（仅静态页，无登录接口）...
echo  启动成功后，用浏览器打开： http://localhost:3000
echo  若要点「微信登录」、保存作品，请改用：启动带登录.bat
echo  关闭此窗口即可停止服务器。
echo.
npx --yes serve
pause
