@echo off
REM ใช้บนเครื่องที่มี Vivado 2025.2 (Windows)
REM   fpga\run.bat smoke            build อย่างเดียว
REM   fpga\run.bat smoke program    build แล้วโหลดลงบอร์ด
REM ผลอยู่ที่ build\<target>\  ส่งโฟลเดอร์นั้นกลับมา (ไม่ต้องส่ง .bit)

setlocal
set TARGET=%1
if "%TARGET%"=="" set TARGET=smoke

cd /d "%~dp0\.."

where vivado >nul 2>nul
if errorlevel 1 (
    echo ERROR: หา vivado ไม่เจอใน PATH
    echo   เปิด cmd แล้วรัน settings64.bat ของ Vivado ก่อน เช่น
    echo   call "C:\AMDDesignTools\2025.2\Vivado\settings64.bat"
    echo   ^(path จริงขึ้นกับที่ติดตั้ง^)
    exit /b 1
)

if not exist build\%TARGET% mkdir build\%TARGET%
call vivado -mode batch -source fpga/build.tcl -log build/%TARGET%/vivado.log -journal build/%TARGET%/vivado.jou -tclargs %TARGET%
if errorlevel 1 exit /b 1

if /i "%2"=="program" (
    call vivado -mode batch -source fpga/program.tcl -log build/%TARGET%/program.log -journal build/%TARGET%/program.jou -tclargs %TARGET%
)
endlocal
