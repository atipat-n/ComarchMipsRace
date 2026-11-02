@echo off
REM เปิดเว็บ CPU Race Live ผ่าน http://localhost (ใช้เมื่อเปิด web-live\index.html ตรงๆ แล้วเบราว์เซอร์ไม่ให้ใช้ Web Serial)
REM ต้องมี Python 3 · ปิดหน้าต่างนี้เพื่อหยุดเซิร์ฟเวอร์
cd /d "%~dp0"
start "" http://localhost:8765/web-live/index.html
python -m http.server 8765 --bind 127.0.0.1
