<?php
// Приём формы «Свяжитесь с нами»: серверная проверка, антиспам, журнал согласий, письмо на info@bollfilter.ru.
// Требования — юридический пакет, «Техническое задание разработчику», п. 2.
//
// Секретов в этом файле нет. Пароль ящика лежит на сервере ВНЕ веб-корня: ../private/smtp-secret.php.
// Там же: form-mode.txt (выключатель), журнал согласий consent-log/, счётчики частоты rate/.
//
// Режимы (../private/form-mode.txt, строка mode=…; нет файла или непонятное значение — closed):
//   closed — форма ничего не принимает и ничего не отправляет;
//   test   — только для запросов с тестовым ключом (заголовок X-Form-Test, его sha256 — test_key_sha256=…):
//            вся обработка и журнал, но письмо не уходит; настоящее письмо — только при test_send=1,
//            и то лишь по HTTPS на bollfilter.ru. Обычный посетитель в режиме test видит closed;
//   live   — для всех, но письмо уходит только по HTTPS на bollfilter.ru; иначе — как closed.

declare(strict_types=1);

// Предупреждения PHP не должны попадать в ответ (он читается как JSON) и показывать пути сервера
ini_set('display_errors', '0');

const PRIVATE_DIR     = __DIR__ . '/../private';
const PRODUCTION_HOST = 'bollfilter.ru';
const MAIL_TO         = 'info@bollfilter.ru';
const MAIL_FROM       = 'info@bollfilter.ru';
const SMTP_HOST       = 'mail.nic.ru';          // сертификат *.nic.ru — проверка имени проходит (журнал, 24.09.2026)
const SMTP_PORT       = 465;                    // TLS сразу при подключении
const SMTP_USER       = 'info@bollfilter.ru';
const CONSENT_VERSION = '1.0';
const CONSENT_TITLE   = 'Согласие на обработку персональных данных, версия 1.0 от 15.09.2026';
const MIN_FILL_MS     = 3000;                   // быстрее — бот
const LIMIT_PER_HOUR  = 5;                      // с одного адреса (в form-mode.txt можно задать limit_per_hour=…)
const LIMIT_PER_DAY   = 50;                     // на весь сайт (limit_per_day=…)
const MAX_BODY_BYTES  = 16384;

// Тексты — те же, что в js/main.js (тексты про контакт и согласие — дословно из юридического пакета)
const MESSAGES = [
    'name'    => 'Укажите имя.',
    'contact' => 'Укажите e-mail или телефон, по которому можно ответить на обращение.',
    'email'   => 'Проверьте адрес e-mail.',
    'phone'   => 'Проверьте номер телефона: цифры, пробелы и знаки + ( ) -.',
    'consent' => 'Для отправки формы подтвердите согласие на обработку персональных данных.',
    'long'    => 'Слишком длинный текст.',
];
const MAX_LEN = ['name' => 100, 'surname' => 100, 'email' => 254, 'phone' => 30, 'message' => 2000];

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$isFetch = ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'fetch';

// --- Ответы ---

function answer(int $status, array $data): never
{
    global $isFetch;
    http_response_code($status);
    if ($isFetch) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }
    // Без JavaScript: короткая страница вместо JSON. Данные формы в неё не подставляются.
    header('Content-Type: text/html; charset=utf-8');
    $text = ($data['ok'] ?? false)
        ? 'Спасибо. Ваше обращение отправлено. Мы свяжемся с вами по указанным контактам.'
        : 'Не удалось отправить сообщение. Позвоните по телефону +7(812) 364-61-80 или напишите на info@bollfilter.ru.';
    echo '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1"><title>БОЛЛФИЛТЕР</title></head>'
        . '<body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.5">'
        . '<p>' . htmlspecialchars($text) . '</p><p><a href="./">Вернуться на сайт</a></p></body></html>';
    exit;
}

function closed(): never
{
    answer(503, ['ok' => false, 'code' => 'closed']);
}

// --- Настройки на сервере ---

function readMode(): array
{
    $cfg = ['mode' => 'closed', 'test_key_sha256' => '', 'test_send' => '0',
        'limit_per_hour' => (string) LIMIT_PER_HOUR, 'limit_per_day' => (string) LIMIT_PER_DAY];
    $file = PRIVATE_DIR . '/form-mode.txt';
    if (!is_readable($file)) return $cfg;
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
        [$k, $v] = array_map('trim', explode('=', $line, 2));
        if (array_key_exists($k, $cfg)) $cfg[$k] = $v;
    }
    if (!in_array($cfg['mode'], ['closed', 'test', 'live'], true)) $cfg['mode'] = 'closed';
    return $cfg;
}

// HTTPS и боевой адрес. Прокси хостинга (openresty) может сообщать протокол заголовком — проверить после SSL.
function isProduction(): bool
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['SERVER_PORT'] ?? '') === '443'
        || strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $host = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''));
    return $https && $host === PRODUCTION_HOST;
}

function privatePath(string $sub): string
{
    $dir = PRIVATE_DIR . '/' . $sub;
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException('нет доступа к private/' . $sub);
    }
    return $dir;
}

// Соль для хэшей адресов: создаётся сама при первом обращении, лежит вне веб-корня
function salt(): string
{
    $file = PRIVATE_DIR . '/rate-salt';
    if (!is_readable($file)) {
        privatePath('rate');
        @file_put_contents($file, bin2hex(random_bytes(32)), LOCK_EX);
        @chmod($file, 0600);
    }
    $s = @file_get_contents($file);
    if (!$s) throw new RuntimeException('нет соли');
    return trim($s);
}

// --- Журнал согласий: без данных формы и без IP; связь с письмом — по номеру обращения ---

function logConsent(string $id, string $formUrl, bool $consent, string $result, string $mode): void
{
    $line = json_encode([
        'id'              => $id,
        'time_utc'        => gmdate('Y-m-d\TH:i:s\Z'),
        'consent_version' => CONSENT_VERSION,
        'form_url'        => $formUrl,
        'consent'         => $consent,
        'result'          => $result,
        'mode'            => $mode,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    $file = privatePath('consent-log') . '/' . gmdate('Y-m') . '.jsonl';
    if (@file_put_contents($file, $line, FILE_APPEND | LOCK_EX) === false) {
        throw new RuntimeException('журнал согласий не пишется');
    }
    @chmod($file, 0600);
}

// Технические сбои — без данных посетителя и без паролей
function logError(string $text): void
{
    $file = PRIVATE_DIR . '/error.log';
    if (@file_put_contents($file, gmdate('c') . ' ' . $text . "\n", FILE_APPEND | LOCK_EX) !== false) {
        @chmod($file, 0600);
    }
}

// --- Частота: не больше LIMIT_PER_HOUR с адреса и LIMIT_PER_DAY на сайт. Адрес — только в виде хэша ---

function rateLimited(array $cfg): bool
{
    $dir = privatePath('rate');
    $now = time();
    // Уборка: файлы старше суток удаляются
    foreach (glob($dir . '/*.json') ?: [] as $f) {
        if ($now - (int) @filemtime($f) > 86400) @unlink($f);
    }
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $key = hash('sha256', salt() . '|' . gmdate('Y-m-d') . '|' . $ip);
    return !countHit($dir . '/ip-' . $key . '.json', 3600, max(1, (int) $cfg['limit_per_hour']), $now)
        || !countHit($dir . '/day-' . gmdate('Y-m-d') . '.json', 86400, max(1, (int) $cfg['limit_per_day']), $now);
}

function countHit(string $file, int $window, int $limit, int $now): bool
{
    $h = @fopen($file, 'c+');
    if (!$h) throw new RuntimeException('счётчик частоты не открывается');
    flock($h, LOCK_EX);
    $hits = json_decode((string) stream_get_contents($h), true);
    $hits = array_values(array_filter(is_array($hits) ? $hits : [], fn($t) => is_int($t) && $now - $t < $window));
    $ok = count($hits) < $limit;
    if ($ok) $hits[] = $now;
    ftruncate($h, 0); rewind($h);
    fwrite($h, json_encode($hits));
    flock($h, LOCK_UN); fclose($h);
    @chmod($file, 0600);
    return $ok;
}

// --- Проверка полей ---

function field(string $name): string
{
    $v = $_POST[$name] ?? '';
    if (!is_string($v)) return '';
    if (!preg_match('//u', $v)) return '';            // не UTF-8 — считаем пустым
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    // Управляющие символы убираем; перевод строки оставляем только в сообщении
    $v = preg_replace($name === 'message' ? '/[\x00-\x09\x0B-\x1F\x7F]/u' : '/[\x00-\x1F\x7F]/u', '', $v);
    return trim($v);
}

function len(string $s): int
{
    return preg_match_all('/./us', $s);
}

function validate(array $d): array
{
    $e = [];
    foreach (MAX_LEN as $k => $max) {
        if (len($d[$k]) > $max) $e[$k === 'surname' ? 'name' : $k] = MESSAGES['long'];
    }
    if ($d['name'] === '') $e['name'] = MESSAGES['name'];
    if ($d['email'] === '' && $d['phone'] === '') {
        $e['email'] = MESSAGES['contact'];
    } else {
        if ($d['email'] !== '' && (filter_var($d['email'], FILTER_VALIDATE_EMAIL) === false
                || !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $d['email']))) {
            $e['email'] = MESSAGES['email'];
        }
        if ($d['phone'] !== '' && (!preg_match('/^[0-9+()\-\s]+$/', $d['phone'])
                || strlen(preg_replace('/\D/', '', $d['phone'])) < 10)) {
            $e['phone'] = MESSAGES['phone'];
        }
    }
    if (!$d['consent']) $e['consent'] = MESSAGES['consent'];
    return $e;
}

// Адрес страницы формы: только схема, хост и путь — без параметров, чтобы в журнал ничего лишнего не попало
function formUrl(): string
{
    $ref = $_SERVER['HTTP_REFERER'] ?? '';
    $p = parse_url($ref);
    if (!$p || empty($p['host'])) return '';
    return ($p['scheme'] ?? 'http') . '://' . $p['host'] . ($p['path'] ?? '/');
}

// Запрос пришёл со страницы этого же сайта. Только ДОПОЛНИТЕЛЬНЫЙ фильтр от случайных чужих запросов:
// Origin и Referer присылает клиент, подделать их легко. Этой проверке ничего не доверено — выключатель,
// валидация, антиспам и запрет отправки работают одинаково, какими бы ни были эти заголовки.
function sameSite(): bool
{
    $host = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''));
    $src = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
    $srcHost = strtolower((string) parse_url($src, PHP_URL_HOST));
    return $host !== '' && $srcHost === $host;
}

// --- Письмо ---

function encodeHeader(string $s): string
{
    return '=?UTF-8?B?' . base64_encode($s) . '?=';
}

function buildMessage(string $id, array $d, string $formUrl): string
{
    $msk = new DateTime('now', new DateTimeZone('Europe/Moscow'));
    $body = "Заявка с сайта bollfilter.ru\n\n"
        . "Номер обращения: $id\n"
        . 'Дата и время: ' . $msk->format('d.m.Y H:i') . " (МСК)\n\n"
        . "Имя: {$d['name']}\n"
        . 'Фамилия: ' . ($d['surname'] !== '' ? $d['surname'] : '—') . "\n"
        . 'Email: ' . ($d['email'] !== '' ? $d['email'] : '—') . "\n"
        . 'Телефон: ' . ($d['phone'] !== '' ? $d['phone'] : '—') . "\n\n"
        . "Сообщение:\n" . ($d['message'] !== '' ? $d['message'] : '—') . "\n\n"
        . '---' . "\n"
        . 'Согласие на обработку персональных данных: отмечено (' . CONSENT_TITLE . ")\n"
        . 'Страница формы: ' . ($formUrl !== '' ? $formUrl : '—') . "\n";

    $headers = [
        'Date: ' . date(DATE_RFC2822),
        'From: ' . encodeHeader('Сайт bollfilter.ru') . ' <' . MAIL_FROM . '>',
        'To: <' . MAIL_TO . '>',
        'Subject: ' . encodeHeader('Заявка с сайта bollfilter.ru'),
        'Message-ID: <' . strtolower($id) . '.' . bin2hex(random_bytes(4)) . '@bollfilter.ru>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ];
    // Reply-To — только проверенный адрес посетителя; переводов строк в нём быть не может (field + validate)
    if ($d['email'] !== '') $headers[] = 'Reply-To: <' . $d['email'] . '>';

    return implode("\r\n", $headers) . "\r\n\r\n"
        . rtrim(chunk_split(base64_encode(str_replace("\n", "\r\n", $body)), 76, "\r\n")) . "\r\n";
}

// Небольшой SMTP-клиент: TLS сразу, полная проверка сертификата, AUTH LOGIN, одно письмо
function smtpSend(string $message): void
{
    $secretFile = PRIVATE_DIR . '/smtp-secret.php';
    $secret = is_readable($secretFile) ? require $secretFile : null;
    $password = is_array($secret) ? (string) ($secret['password'] ?? '') : '';
    if ($password === '') throw new RuntimeException('нет пароля SMTP в private/smtp-secret.php');

    $ctx = stream_context_create(['ssl' => [
        'verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => SMTP_HOST, 'allow_self_signed' => false,
    ]]);
    $s = @stream_socket_client('ssl://' . SMTP_HOST . ':' . SMTP_PORT, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$s) throw new RuntimeException("SMTP: нет соединения ($errno)");
    stream_set_timeout($s, 20);

    $read = function () use ($s): string {
        $out = '';
        while (($line = fgets($s, 1024)) !== false) {
            $out .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') break;
        }
        return $out;
    };
    // $hide — не писать в журнал ответ сервера (шаги входа)
    $step = function (?string $cmd, string $expect, string $name, bool $hide = false) use ($s, $read): void {
        if ($cmd !== null) fwrite($s, $cmd . "\r\n");
        $r = $read();
        if (strncmp($r, $expect, 3) !== 0) {
            throw new RuntimeException("SMTP: шаг $name, ответ " . ($hide ? substr($r, 0, 3) : trim(substr($r, 0, 120))));
        }
    };

    try {
        $step(null, '220', 'приветствие');
        $step('EHLO bollfilter.ru', '250', 'EHLO');
        $step('AUTH LOGIN', '334', 'AUTH', true);
        $step(base64_encode(SMTP_USER), '334', 'логин', true);
        $step(base64_encode($password), '235', 'пароль', true);
        $step('MAIL FROM:<' . MAIL_FROM . '>', '250', 'MAIL FROM');
        $step('RCPT TO:<' . MAIL_TO . '>', '250', 'RCPT TO');
        $step('DATA', '354', 'DATA');
        // Строки, начинающиеся с точки, удваиваются (правило SMTP)
        $data = preg_replace('/^\./m', '..', $message);
        $step(rtrim($data, "\r\n") . "\r\n.", '250', 'письмо');
        fwrite($s, "QUIT\r\n");
    } finally {
        fclose($s);
    }
}

// === Обработка запроса ===

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    answer(405, ['ok' => false, 'code' => 'method']);
}

$cfg = readMode();
$testKey = $_SERVER['HTTP_X_FORM_TEST'] ?? '';
$isTest = $cfg['mode'] === 'test' && $cfg['test_key_sha256'] !== '' && $testKey !== ''
    && hash_equals(strtolower($cfg['test_key_sha256']), hash('sha256', $testKey));

// Выключатель: closed — всегда закрыто; test — только с ключом; live — только HTTPS на bollfilter.ru
if ($cfg['mode'] === 'closed') closed();
if ($cfg['mode'] === 'test' && !$isTest) closed();
if ($cfg['mode'] === 'live' && !isProduction()) closed();

// Без JavaScript форма не обрабатывается: честная страница с телефоном и почтой
if (!$isFetch) answer(400, ['ok' => false, 'code' => 'nojs']);

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_BODY_BYTES) answer(413, ['ok' => false, 'code' => 'error']);
if (!sameSite()) answer(403, ['ok' => false, 'code' => 'error']);

try {
    // Ловушка и время заполнения: боту — «успех», без письма и без записи в журнал согласий
    if (field('bf_hp') !== '') answer(200, ['ok' => true]);
    $filled = (int) ($_POST['t'] ?? 0);
    if ($filled < MIN_FILL_MS) answer(200, ['ok' => true]);

    if (rateLimited($cfg)) answer(429, ['ok' => false, 'code' => 'error']);

    $d = [
        'name'    => field('name'),
        'surname' => field('surname'),
        'email'   => field('email'),
        'phone'   => field('phone'),
        'message' => field('message'),
        'consent' => ($_POST['consent'] ?? '') === 'on',
    ];
    $id = 'BF-' . gmdate('Ymd') . '-' . bin2hex(random_bytes(3));
    $url = formUrl();
    $mode = $isTest ? 'test' : 'live';

    $errors = validate($d);
    if ($errors) {
        logConsent($id, $url, $d['consent'], 'invalid', $mode);
        answer(422, ['ok' => false, 'code' => 'invalid', 'errors' => $errors]);
    }

    // Настоящее письмо: live, либо test с test_send=1 — и в обоих случаях только HTTPS на bollfilter.ru
    $send = isProduction() && ($mode === 'live' || $cfg['test_send'] === '1');
    if (!$send) {
        logConsent($id, $url, true, 'dry_run', $mode);
        answer(200, ['ok' => true, 'id' => $id, 'dry_run' => true]);
    }

    try {
        smtpSend(buildMessage($id, $d, $url));
    } catch (Throwable $e) {
        logError($id . ' ' . $e->getMessage());
        logConsent($id, $url, true, 'smtp_error', $mode);
        answer(502, ['ok' => false, 'code' => 'error']);
    }
    logConsent($id, $url, true, 'sent', $mode);
    answer(200, ['ok' => true, 'id' => $id]);
} catch (Throwable $e) {
    logError('обработка: ' . $e->getMessage());
    answer(500, ['ok' => false, 'code' => 'error']);
}
