// Принимает данные калькулятора и отправляет отчёт о заявке в Telegram.
// TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID берутся из переменных окружения Netlify.

const NORM_FC = 27;      // норма фуд-коста, %
const NORM_FOT = 28;     // ориентир по ФОТ, %
const NORM_PRIME = 55;   // норма прайм-коста, %

const rub = n => Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₽';
const pct = n => (Number(n) || 0).toFixed(1) + '%';
const num = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

async function tg(method, token, params) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
  });
  let body = {};
  try { body = await res.json(); } catch { /* ответ не JSON */ }
  return { ok: res.ok && body.ok !== false, status: res.status, body };
}

function buildReport(d) {
  const rev = num(d.rev), fc = num(d.fc), fotK = num(d.fotK), fotH = num(d.fotH), chk = num(d.chk);
  const fot = fotK + fotH;
  const fcP = rev ? fc / rev * 100 : 0;
  const fotP = rev ? fot / rev * 100 : 0;
  const primeP = fcP + fotP;
  const loss = Math.max(0, (fcP - NORM_FC) / 100 * rev);

  const lines = [];
  const talk = [];

  // Фуд-кост
  if (fcP >= 35) {
    lines.push(`🔴 Фуд-кост ${pct(fcP)} — критично (норма ${NORM_FC}–28%), выше на ${(fcP - NORM_FC).toFixed(1)} п.п.`);
    talk.push(`Фуд-кост ${pct(fcP)} при норме ${NORM_FC}%: уходит около ${rub(loss)} в месяц, ${rub(loss * 12)} в год`);
  } else if (fcP >= 28) {
    lines.push(`🟡 Фуд-кост ${pct(fcP)} — выше нормы на ${(fcP - NORM_FC).toFixed(1)} п.п. (норма ${NORM_FC}–28%)`);
    talk.push(`Фуд-кост ${pct(fcP)}: снижение до ${NORM_FC}% даст около ${rub(loss)} в месяц`);
  } else {
    lines.push(`🟢 Фуд-кост ${pct(fcP)} — в норме (${NORM_FC}–28%)`);
  }

  // ФОТ
  if (fotP > NORM_FOT + 7) {
    lines.push(`🔴 ФОТ ${pct(fotP)} — высокий (ориентир ~${NORM_FOT}%)`);
    talk.push(`ФОТ ${pct(fotP)} от выручки — есть что оптимизировать в расстановке и графиках`);
  } else if (fotP > NORM_FOT) {
    lines.push(`🟡 ФОТ ${pct(fotP)} — немного выше ориентира ~${NORM_FOT}%`);
  } else {
    lines.push(`🟢 ФОТ ${pct(fotP)} — в пределах ориентира ~${NORM_FOT}%`);
  }

  // Прайм-кост
  if (primeP >= 65) {
    lines.push(`🔴 Прайм-кост ${pct(primeP)} — критично (норма до 55–58%)`);
    talk.push(`Прайм-кост ${pct(primeP)} — рентабельность близка к нулю`);
  } else if (primeP >= NORM_PRIME) {
    lines.push(`🟡 Прайм-кост ${pct(primeP)} — требует внимания (норма до 55–58%)`);
  } else {
    lines.push(`🟢 Прайм-кост ${pct(primeP)} — в норме (до 55%)`);
  }

  // Средний чек
  if (chk <= 0) {
    lines.push('⚪ Средний чек не указан');
  } else if (chk < 1500) {
    lines.push(`🔴 Средний чек ${rub(chk)} — низкий`);
    talk.push(`Средний чек ${rub(chk)} — меню можно выстроить так, чтобы чек вырос без потери гостей`);
  } else if (chk < 2000) {
    lines.push(`🟡 Средний чек ${rub(chk)} — есть потенциал роста`);
    talk.push(`Средний чек ${rub(chk)} — есть потенциал роста через архитектуру меню`);
  } else {
    lines.push(`🟢 Средний чек ${rub(chk)} — хороший`);
  }

  return { fcP, fotP, primeP, loss, lines, talk };
}

exports.handler = async (event) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let d;
  try { d = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'Bad JSON' }; }

  // ловушка для ботов: поле скрыто от людей
  if (d.website) return { statusCode: 200, body: 'ok' };

  const name = clean(d.name, 80);
  const phone = clean(d.phone, 30);
  if (!name || phone.replace(/\D/g, '').length < 10) return { statusCode: 400, body: 'Invalid contact' };
  if (!num(d.rev) || !num(d.fc)) return { statusCode: 400, body: 'Invalid numbers' };
  if (!token || !chatId) return { statusCode: 500, body: 'Telegram is not configured' };

  const r = buildReport(d);
  const parts = [
    '🔔 Новая заявка — калькулятор фуд-коста',
    '',
    `👤 ${name}`,
    `📞 ${phone}`,
    '',
    '— Что ввёл клиент —',
    `Выручка за месяц: ${rub(d.rev)}`,
    `Затраты на продукты: ${rub(d.fc)}`,
    `ФОТ кухни: ${rub(d.fotK)}`,
    `ФОТ зала: ${rub(d.fotH)}`,
    `Средний чек: ${num(d.chk) ? rub(d.chk) : 'не указан'}`,
    '',
    '— Отклонения от нормы —',
    ...r.lines,
  ];
  if (r.loss > 0) {
    parts.push('', `💸 Потери: ${rub(r.loss)} в месяц, ${rub(r.loss * 12)} в год (при снижении фуд-коста до ${NORM_FC}%)`);
  }
  if (r.talk.length) {
    parts.push('', '— Что сказать на звонке —', ...r.talk.map(t => '• ' + t));
  }
  const text = parts.join('\n');

  try {
    const sent = await tg('sendMessage', token, { chat_id: chatId, text });
    if (!sent.ok) {
      console.error('Telegram sendMessage failed:', sent.status, JSON.stringify(sent.body));
      return { statusCode: 502, body: 'Telegram error' };
    }
  } catch (e) {
    console.error('Telegram request failed:', e);
    return { statusCode: 502, body: 'Telegram unreachable' };
  }
  return { statusCode: 200, body: 'ok' };
};
