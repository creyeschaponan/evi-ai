import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface ActionExecutionResult {
  executed: boolean;
  action: string;
  output?: string;
  error?: string;
}

@Injectable()
export class WindowsService {
  private readonly logger = new Logger(WindowsService.name);

  private getScriptPath(): string {
    const paths = [
      path.resolve(__dirname, 'scripts', 'win-control.ps1'),
      path.resolve(__dirname, '..', '..', 'src', 'jarvis', 'scripts', 'win-control.ps1'),
      path.resolve(process.cwd(), 'src', 'jarvis', 'scripts', 'win-control.ps1'),
      path.resolve(process.cwd(), 'orchestrator-nest', 'src', 'jarvis', 'scripts', 'win-control.ps1'),
    ];

    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return paths[0];
  }

  /**
   * Ejecuta un comando en PowerShell usando el script win-control.ps1
   */
  async executeAction(action: string, value = 0, app = '', query = ''): Promise<string> {
    const scriptPath = this.getScriptPath();
    this.logger.log(`[PS EXECUTE] Action: "${action}" | Value: ${value} | App: "${app}" | Query: "${query}"`);

    return new Promise((resolve, reject) => {
      const args = [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-Action',
        action,
        '-Value',
        value.toString(),
        '-App',
        app,
        '-Query',
        query,
      ];

      const ps = spawn('powershell', args, { windowsHide: true });
      let stdout = '';
      let stderr = '';

      ps.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ps.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ps.on('close', (code) => {
        if (code === 0) {
          const result = stdout.trim();
          this.logger.log(`[PS SUCCESS] Action [${action}] Output: "${result}"`);
          resolve(result);
        } else {
          this.logger.error(`[PS ERROR] Action [${action}] Code ${code}: ${stderr}`);
          reject(new Error(stderr || `Process exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Busca el mejor resultado en YouTube y lo abre directamente en el navegador con autoplay
   */
  async playDirectYouTube(query: string): Promise<string> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      this.logger.log(`[YOUTUBE] Opening YouTube Home (empty query)`);
      await this.executeAction('open_app', 0, 'https://www.youtube.com');
      return 'YOUTUBE_HOME';
    }

    this.logger.log(`[YOUTUBE] Searching top video for: "${cleanQuery}"...`);
    try {
      const ytSearch = require('yt-search');
      const searchResult = await ytSearch(cleanQuery);
      if (searchResult && searchResult.videos && searchResult.videos.length > 0) {
        const topVideo = searchResult.videos[0];
        const watchUrl = `https://www.youtube.com/watch?v=${topVideo.videoId}&autoplay=1`;
        this.logger.log(`[YOUTUBE FOUND] "${topVideo.title}" (${topVideo.timestamp}) -> ${watchUrl}`);
        await this.executeAction('open_app', 0, watchUrl);
        return `Reproduciendo en YouTube: "${topVideo.title}" (${topVideo.timestamp})`;
      } else {
        this.logger.warn(`[YOUTUBE] No video found for: "${cleanQuery}", opening search results`);
      }
    } catch (e) {
      this.logger.error(`[YOUTUBE ERROR] yt-search failed: ${e.message}`);
    }

    const fallbackUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
    await this.executeAction('open_app', 0, fallbackUrl);
    return `Buscando en YouTube: "${cleanQuery}"`;
  }

  /**
   * Limpia preámbulos conversacionales para extraer la intención real
   */
  private cleanQueryPrefix(text: string): string {
    return text
      .replace(/^(?:por\s+favor\s+|favor\s+de\s+|puedes\s+|podr[ií]as\s+|quiero\s+que\s+|deseo\s+que\s+|haz\s+que\s+|procede\s+a\s+)/i, '')
      .trim();
  }

  /**
   * Detecta y ejecuta acciones si están presentes en la intención del usuario
   */
  async handlePotentialIntent(text: string): Promise<ActionExecutionResult | null> {
    const rawLower = text.toLowerCase().trim();
    const lower = this.cleanQueryPrefix(rawLower);

    this.logger.log(`[INTENT EVALUATION] Raw: "${rawLower}" | Processed: "${lower}"`);

    // ==========================================
    // 1. Multimedia: YouTube (Extracción Universal)
    // ==========================================
    if (lower.includes('youtube')) {
      this.logger.log(`[INTENT MATCH] Detected YouTube keyword`);
      // Limpiar prefijos de acción y la palabra 'youtube'
      let query = lower
        .replace(/(?:en|por|de)\s+youtube/gi, '')
        .replace(/youtube/gi, '')
        .replace(/^(?:reprodu[czs][a-z]*|pon[a-z]*|busc[a-z]*|escuch[a-z]*|[aá]br[a-z]*|toc[a-z]*)\s+/i, '')
        .replace(/^(?:una\s+)?(?:playlist|canci[oó]n|tema|m[uú]sica|video)?\s*(?:de|para|con)?\s*/i, '')
        .trim();

      const out = await this.playDirectYouTube(query);
      return { executed: true, action: 'play_youtube_direct', output: out };
    }

    // ==========================================
    // 2. Multimedia: Spotify (Extracción Universal)
    // ==========================================
    if (lower.includes('spotify')) {
      this.logger.log(`[INTENT MATCH] Detected Spotify keyword`);
      // Si pide cerrar Spotify
      if (/ci[eé]rr|mat|sal|quit|close/i.test(lower)) {
        const out = await this.executeAction('close_app', 0, 'spotify');
        return { executed: true, action: 'close_app', output: out };
      }

      // Extraer búsqueda si existe
      let query = lower
        .replace(/(?:en|por|de)\s+spotify/gi, '')
        .replace(/spotify/gi, '')
        .replace(/^(?:reprodu[czs][a-z]*|pon[a-z]*|busc[a-z]*|escuch[a-z]*|[aá]br[a-z]*|toc[a-z]*)\s+/i, '')
        .replace(/^(?:una\s+)?(?:playlist|canci[oó]n|tema|m[uú]sica)?\s*(?:de|para|con)?\s*/i, '')
        .trim();

      const out = await this.executeAction('play_spotify', 0, '', query);
      return { executed: true, action: 'play_spotify', output: out };
    }

    // ==========================================
    // 3. Recomendaciones y Selección al Azar
    // ==========================================
    if (
      /recomendaci[oó]n\s+aleatoria/i.test(lower) ||
      /el(?:i|e)g(?:e|ir)\s+una\s+al\s+azar/i.test(lower) ||
      /pon\s+(?:una\s+)?al\s+azar/i.test(lower) ||
      /lo\s+que\s+quieras/i.test(lower) ||
      /sorpr[eé]ndeme/i.test(lower)
    ) {
      this.logger.log(`[INTENT MATCH] Detected Random/Surprise Music Request`);
      const out = await this.playDirectYouTube('lofi hip hop chill beats study mix');
      return { executed: true, action: 'play_youtube_direct', output: out };
    }

    // ==========================================
    // 4. Reproducción Universal de Música / Playlist / Canción (Vía YouTube Autoplay)
    // ==========================================
    // Ej: "reproduzcas in the end", "reproduscas coldplay", "pon lofi", "reproduce rock", "toca salsa"
    const isMusicVerb = /^(?:reprodu[czs][a-z]*|pon[a-z]*|busc[a-z]*|escuch[a-z]*|toc[a-z]*)\s+/i.test(lower);
    if (
      isMusicVerb &&
      !lower.includes('volumen') &&
      !lower.includes('captura') &&
      !lower.includes('pc') &&
      !lower.includes('computadora') &&
      !lower.includes('pantalla') &&
      !lower.includes('escritorio')
    ) {
      let query = lower
        .replace(/^(?:reprodu[czs][a-z]*|pon[a-z]*|busc[a-z]*|escuch[a-z]*|toc[a-z]*)\s+/i, '')
        .replace(/^(?:una\s+)?(?:playlist|canci[oó]n|tema|m[uú]sica|video)?\s*(?:de|para|con)?\s*/i, '')
        .trim();

      // Descartar si el target era una app del sistema (ej: "pon la calculadora")
      if (!/^(?:el\s+|la\s+)?(?:bloc|calculadora|chrome|code|navegador|explorador|administrador|taskmgr)/i.test(query)) {
        if (!query) query = 'musica lofi chill';
        this.logger.log(`[INTENT MATCH] Detected Generic Music Playback for query: "${query}"`);
        const out = await this.playDirectYouTube(query);
        return { executed: true, action: 'play_youtube_direct', output: out };
      }
    }

    // ==========================================
    // 5. Controles Universales de Reproducción
    // ==========================================
    if (
      lower === 'pausa' ||
      lower === 'play' ||
      /pausa(?:r)?\s+(?:la\s+)?m[uú]sica/i.test(lower) ||
      /reanuda(?:r)?\s+(?:la\s+)?m[uú]sica/i.test(lower) ||
      /dale\s+play/i.test(lower)
    ) {
      this.logger.log(`[INTENT MATCH] Media Play/Pause`);
      const out = await this.executeAction('media_play_pause');
      return { executed: true, action: 'media_play_pause', output: out };
    }

    if (
      lower === 'siguiente' ||
      /siguiente\s+canci[oó]n/i.test(lower) ||
      /pasa\s+(?:la\s+)?canci[oó]n/i.test(lower) ||
      /siguiente\s+pista/i.test(lower)
    ) {
      this.logger.log(`[INTENT MATCH] Media Next Track`);
      const out = await this.executeAction('media_next');
      return { executed: true, action: 'media_next', output: out };
    }

    if (
      lower === 'anterior' ||
      /canci[oó]n\s+anterior/i.test(lower) ||
      /pista\s+anterior/i.test(lower)
    ) {
      this.logger.log(`[INTENT MATCH] Media Previous Track`);
      const out = await this.executeAction('media_prev');
      return { executed: true, action: 'media_prev', output: out };
    }

    if (
      lower === 'stop' ||
      /det[eé]n\s+(?:la\s+)?m[uú]sica/i.test(lower) ||
      /para\s+(?:la\s+)?m[uú]sica/i.test(lower) ||
      /detener\s+(?:la\s+)?m[uú]sica/i.test(lower)
    ) {
      this.logger.log(`[INTENT MATCH] Media Stop`);
      const out = await this.executeAction('media_stop');
      return { executed: true, action: 'media_stop', output: out };
    }

    // ==========================================
    // 6. Control de Audio Master
    // ==========================================
    // Ajuste exacto de volumen (ej: "pon el volumen al 30", "baja el volumen al 30%")
    const exactVolumeMatch = lower.match(/(?:volumen\s+(?:al|en|a)|pon(?:er)?\s+el\s+volumen\s+(?:al|en|a)|bajar?\s+el\s+volumen\s+(?:al|en|a)|subir?\s+el\s+volumen\s+(?:al|en|a)|cambiar?\s+el\s+volumen\s+(?:al|en|a))\s+(\d+)/i);
    if (exactVolumeMatch) {
      const targetVolume = Math.min(100, Math.max(0, parseInt(exactVolumeMatch[1], 10)));
      this.logger.log(`[INTENT MATCH] Set exact volume: ${targetVolume}%`);
      const out = await this.executeAction('set_volume', targetVolume);
      return { executed: true, action: 'set_volume', output: out };
    }

    // Subir volumen
    if (lower.includes('sube el volumen') || lower.includes('subir volumen') || lower.includes('más volumen') || lower.includes('aumenta el volumen') || lower.includes('aumentar volumen')) {
      this.logger.log(`[INTENT MATCH] Volume Up`);
      const out = await this.executeAction('volume_up');
      return { executed: true, action: 'volume_up', output: out };
    }

    // Bajar volumen
    if (lower.includes('baja el volumen') || lower.includes('bajar volumen') || lower.includes('menos volumen') || lower.includes('reduce el volumen') || lower.includes('reducir volumen')) {
      this.logger.log(`[INTENT MATCH] Volume Down`);
      const out = await this.executeAction('volume_down');
      return { executed: true, action: 'volume_down', output: out };
    }

    // Consultar nivel de volumen
    if (lower.includes('a cuánto está el volumen') || lower.includes('qué volumen tengo') || lower.includes('nivel de volumen')) {
      this.logger.log(`[INTENT MATCH] Get Volume`);
      const out = await this.executeAction('get_volume');
      return { executed: true, action: 'get_volume', output: out };
    }

    // Silenciar / Quitar silencio
    if (lower === 'silencia' || lower.includes('silencia el audio') || lower.includes('mutea') || lower.includes('pon en silencio')) {
      this.logger.log(`[INTENT MATCH] Mute Audio`);
      const out = await this.executeAction('mute');
      return { executed: true, action: 'mute', output: out };
    }
    if (lower.includes('desilencia') || lower.includes('quita el silencio') || lower.includes('desmutea')) {
      this.logger.log(`[INTENT MATCH] Unmute Audio`);
      const out = await this.executeAction('unmute');
      return { executed: true, action: 'unmute', output: out };
    }

    // ==========================================
    // 7. Telemetría y Estado de Hardware
    // ==========================================
    if (lower.includes('recursos del sistema') || lower.includes('cuánta ram') || lower.includes('estado de la gpu') || lower.includes('temperatura de la gpu') || lower.includes('cómo van los recursos') || lower.includes('memoria ram')) {
      this.logger.log(`[INTENT MATCH] Hardware Telemetry`);
      const out = await this.executeAction('get_system_info');
      return { executed: true, action: 'get_system_info', output: out };
    }

    // Hora y fecha actual
    if (lower.includes('qué hora es') || lower.includes('dime la hora') || lower.includes('qué fecha es') || lower.includes('en qué día estamos')) {
      this.logger.log(`[INTENT MATCH] Current Date/Time`);
      const out = await this.executeAction('get_time');
      return { executed: true, action: 'get_time', output: out };
    }

    // ==========================================
    // 8. Captura de Pantalla y Escritorio
    // ==========================================
    if (lower.includes('captura de pantalla') || lower.includes('toma una captura') || lower.includes('haz una captura') || lower.includes('screenshot') || lower.includes('pantallazo')) {
      this.logger.log(`[INTENT MATCH] Screenshot`);
      const out = await this.executeAction('screenshot');
      return { executed: true, action: 'screenshot', output: out };
    }

    if (lower.includes('minimiza todo') || lower.includes('muestra el escritorio') || lower.includes('minimiza las ventanas')) {
      this.logger.log(`[INTENT MATCH] Minimize All Windows`);
      const out = await this.executeAction('minimize_all');
      return { executed: true, action: 'minimize_all', output: out };
    }

    if (lower.includes('bloquea la pc') || lower.includes('bloquea la computadora') || lower.includes('bloquear equipo') || lower.includes('bloquear sesión') || lower.includes('bloquear pantalla')) {
      this.logger.log(`[INTENT MATCH] Lock Workstation`);
      const out = await this.executeAction('lock_workstation');
      return { executed: true, action: 'lock_workstation', output: out };
    }

    // ==========================================
    // 9. Cerrar Aplicaciones (Flexible)
    // ==========================================
    if (/ci[eé]rr|mat|sal|close|quit/i.test(lower)) {
      let appName = '';
      if (lower.includes('chrome') || lower.includes('navegador')) appName = 'chrome';
      else if (lower.includes('code') || lower.includes('vs code')) appName = 'code';
      else if (lower.includes('notepad') || lower.includes('bloc de notas')) appName = 'notepad';
      else if (lower.includes('calculadora')) appName = 'CalculatorApp';

      if (appName) {
        this.logger.log(`[INTENT MATCH] Close App: ${appName}`);
        const out = await this.executeAction('close_app', 0, appName);
        return { executed: true, action: 'close_app', output: out };
      }
    }

    // ==========================================
    // 10. Abrir Aplicaciones (Flexible)
    // ==========================================
    if (/[aá]br|inici|lanz|ejecut|open/i.test(lower)) {
      let appName = '';
      if (lower.includes('chrome') || lower.includes('navegador')) appName = 'chrome';
      else if (lower.includes('code') || lower.includes('vs code')) appName = 'code';
      else if (lower.includes('explorador') || lower.includes('carpetas') || lower.includes('archivos')) appName = 'explorer';
      else if (lower.includes('notepad') || lower.includes('bloc de notas')) appName = 'notepad';
      else if (lower.includes('calculadora')) appName = 'calc';
      else if (lower.includes('administrador de tareas') || lower.includes('task manager')) appName = 'taskmgr';

      if (appName) {
        this.logger.log(`[INTENT MATCH] Open App: ${appName}`);
        const out = await this.executeAction('open_app', 0, appName);
        return { executed: true, action: 'open_app', output: out };
      }
    }

    this.logger.log(`[NO INTENT MATCH] No Windows action matched for: "${text}"`);
    return null;
  }
}
