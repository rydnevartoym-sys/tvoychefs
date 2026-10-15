// Принимает данные калькулятора и отправляет отчёт в Telegram.
// Токен и chat id берутся из переменных окружения Netlify.
const fmt = n => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let d;
  try { d = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'Bad JSON' }; }

  // ловушка для ботов: поле скрыто от людей
  if (d.website) return { statusCode: 200, body: 'ok' };

  const name = clean(d.name, 80);
  const phone = clean(d.phone, 30);
  if (!name || phone.replace(/\D/g, '').length < 10) return { statusCode: 400, body: 'Invalid contact' };

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { statusCode: 500, body: 'Telegram is not configured' };

  const pct = n => (Number(n) || 0).toFixed(1) + '%';
  const text = [
    '🔔 Новая заявка — калькулятор фуд-коста',
    '',
    `👤 Имя: ${name}`,
    `📞 Телефон: ${phone}`,
    '',
    '— Введённые данные —',
    `Выручка за месяц: ${fmt(d.rev)} ₽`,
    `Затраты на продукты: ${fmt(d.fc)} ₽`,
    `ФОТ кухни: ${fmt(d.fotK)} ₽`,
    `ФОТ зала: ${fmt(d.fotH)} ₽`,
    `Средний чек: ${d.chk ? fmt(d.chk) + ' ₽' : 'не указан'}`,
    '',
    '— Результат —',
    `Фуд-кост: ${pct(d.fcP)}`,
    `ФОТ: ${pct(d.fotP)}`,
    `Прайм-кост: ${pct(d.primeP)}`,
    `Потери в месяц: ${fmt(d.loss)} ₽`,
    `Потери в год: ${fmt(Number(d.loss) * 12)} ₽`,
  ].join('\n');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) return { statusCode: 502, body: 'Telegram error' };
  return { statusCode: 200, body: 'ok' };
};
