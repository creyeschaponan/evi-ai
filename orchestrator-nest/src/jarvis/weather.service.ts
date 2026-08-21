import { Injectable, Logger } from '@nestjs/common';

export interface WeatherData {
  city: string;
  country: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  condition: string;
  precipitation: number;
  maxTemp: number;
  minTemp: number;
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  // Códigos WMO de Open-Meteo interpretados al español natural
  private readonly weatherCodes: Record<number, string> = {
    0: 'Cielo despejado y soleado',
    1: 'Mayormente despejado',
    2: 'Parcialmente nublado',
    3: 'Cielo cubierto y nublado',
    45: 'Neblina densa',
    48: 'Niebla con escarcha',
    51: 'Llovizna ligera',
    53: 'Llovizna moderada',
    55: 'Llovizna constante',
    61: 'Lluvia leve',
    63: 'Lluvia moderada',
    65: 'Lluvia fuerte',
    80: 'Chubascos aislados',
    81: 'Chubascos moderados',
    82: 'Chubascos intensos',
    95: 'Tormenta eléctrica',
    96: 'Tormenta eléctrica con granizo leve',
    99: 'Tormenta eléctrica severa',
  };

  /**
   * Obtiene datos en tiempo real de Open-Meteo (100% gratuito, sin API key)
   */
  async getLiveWeather(cityName: string = 'Lima'): Promise<WeatherData | null> {
    try {
      this.logger.log(`Fetching live weather data for: "${cityName}"`);

      // 1. Geocodificación para resolver coordenadas geográficas
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=es&format=json`;
      const geoRes = await fetch(geoUrl, { headers: { 'User-Agent': 'EVI-Virtual-Intelligence/1.0' } });
      
      if (!geoRes.ok) {
        throw new Error(`Geocoding failed with status ${geoRes.status}`);
      }

      const geoData: any = await geoRes.json();
      if (!geoData.results || geoData.results.length === 0) {
        this.logger.warn(`Could not resolve location: "${cityName}"`);
        return null;
      }

      const loc = geoData.results[0];
      const lat = loc.latitude;
      const lon = loc.longitude;
      const resolvedCity = loc.name;
      const country = loc.country || '';

      // 2. Consulta de clima actual y pronóstico diario
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
      const weatherRes = await fetch(weatherUrl);

      if (!weatherRes.ok) {
        throw new Error(`Weather API failed with status ${weatherRes.status}`);
      }

      const weatherData: any = await weatherRes.json();
      const current = weatherData.current;
      const daily = weatherData.daily;

      const code = current.weather_code;
      const condition = this.weatherCodes[code] || 'Tiempo variable';

      const result: WeatherData = {
        city: resolvedCity,
        country: country,
        temperature: Math.round(current.temperature_2m),
        apparentTemperature: Math.round(current.apparent_temperature),
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        condition: condition,
        precipitation: current.precipitation,
        maxTemp: daily?.temperature_2m_max?.[0] ? Math.round(daily.temperature_2m_max[0]) : Math.round(current.temperature_2m),
        minTemp: daily?.temperature_2m_min?.[0] ? Math.round(daily.temperature_2m_min[0]) : Math.round(current.temperature_2m),
      };

      return result;
    } catch (error) {
      this.logger.error(`Error fetching live weather: ${error.message}`);
      return null;
    }
  }

  /**
   * Extrae la intención meteorológica y retorna un resumen para el prompt del LLM
   */
  async getWeatherContext(queryText: string): Promise<string | null> {
    const lower = queryText.toLowerCase();
    const isWeatherQuery =
      /clima|tiempo|temperatura|lluvia|llover|lloviendo|calor|fr[ií]o|pron[oó]stico|grados/i.test(lower);

    if (!isWeatherQuery) {
      return null;
    }

    // Extraer nombre de ciudad si se menciona
    let targetCity = 'Lima';
    const cityMatch = lower.match(/(?:en|de|para)\s+([a-záéíóúñ\s]+)(?:\?|$|\.|\,)/i);
    if (cityMatch && cityMatch[1]) {
      let extracted = cityMatch[1].trim();
      extracted = extracted
        .replace(/\b(hoy|mañana|ahora|esta tarde|esta noche|esta semana|por favor|ayer)\b/gi, '')
        .trim();
      if (extracted.length >= 2 && !['mi ciudad', 'donde vivo', 'aqui', 'acá'].includes(extracted)) {
        targetCity = extracted;
      }
    }

    const weather = await this.getLiveWeather(targetCity);
    if (!weather) {
      return `Datos meteorológicos: No se pudo obtener información actualizada para ${targetCity}.`;
    }

    return `Datos meteorológicos en tiempo real (Open-Meteo): En ${weather.city}, ${weather.country}, la temperatura actual es de ${weather.temperature}°C (sensación térmica de ${weather.apparentTemperature}°C), estado: ${weather.condition}, humedad del ${weather.humidity}%, velocidad del viento de ${weather.windSpeed} km/h. Pronóstico para hoy: máxima de ${weather.maxTemp}°C y mínima de ${weather.minTemp}°C${weather.precipitation > 0 ? ` con precipitación de ${weather.precipitation} mm` : ' sin probabilidad de lluvia'}.`;
  }
}
