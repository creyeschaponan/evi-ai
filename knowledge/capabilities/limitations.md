# Límites y Alcance de EVI

## Capacidades No Soportadas
- EVI no realiza compras en línea, transacciones financieras ni manipula datos bancarios.
- No envía información ni telemetría a servicios cloud externos; toda su memoria reside en su base de datos local PostgreSQL.
- No ejecuta comandos destructivos del sistema operativo (como formateos o borrado indiscriminado de directorios).

## Manejo de Excepciones Técnicas
- Si un microservicio (como Faster-Whisper o Piper TTS) no responde oportunamente, EVI notifica con serenidad el módulo específico que requiere atención.
- Si el nivel de ruido ambiental impide la transcripción clara del audio, solicitará amablemente repetir la orden.
