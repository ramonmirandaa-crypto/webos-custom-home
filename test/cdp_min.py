"""Minimal CDP WebSocket client (no third-party deps)."""
import base64, json, os, socket, struct, urllib.request

def ws_connect(url):
    rest = url[5:]
    hostport, path = rest.split('/', 1)
    path = '/' + path
    host, port = hostport.rsplit(':', 1)
    s = socket.create_connection((host, int(port)), timeout=25)
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall((f"GET {path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\n"
               f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
    buf = b''
    while b'\r\n\r\n' not in buf:
        buf += s.recv(4096)
    if b'101' not in buf.split(b'\r\n')[0]:
        raise RuntimeError('handshake failed')
    return s

def send(s, payload):
    data = json.dumps(payload).encode()
    h = bytearray([0x81]); n = len(data)
    if n < 126: h.append(0x80 | n)
    elif n < (1 << 16): h.append(0x80 | 126); h += struct.pack('>H', n)
    else: h.append(0x80 | 127); h += struct.pack('>Q', n)
    mask = os.urandom(4); h += mask
    s.sendall(bytes(h) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

def recv(s):
    def rd(n):
        out = b''
        while len(out) < n:
            c = s.recv(n - len(out))
            if not c: raise RuntimeError('closed')
            out += c
        return out
    while True:
        b1, b2 = rd(2)
        op = b1 & 0x0F; ln = b2 & 0x7F
        if ln == 126: ln = struct.unpack('>H', rd(2))[0]
        elif ln == 127: ln = struct.unpack('>Q', rd(8))[0]
        payload = rd(ln)
        if op == 0x1: return json.loads(payload.decode())
        if op == 0x8: raise RuntimeError('server closed')

class Conn:
    def __init__(self, ws): self.s, self.mid = ws, 0
    def call(self, method, params=None):
        self.mid += 1
        send(self.s, {'id': self.mid, 'method': method, 'params': params or {}})
        while True:
            m = recv(self.s)
            if m.get('id') == self.mid:
                if 'error' in m: raise RuntimeError(m['error'])
                return m.get('result', {})
    def ev(self, expr, awaitp=True):
        r = self.call('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': awaitp})
        if 'exceptionDetails' in r:
            return 'EXC: ' + json.dumps(r['exceptionDetails'])[:300]
        return r.get('result', {}).get('value')

def attach(port, target):
    listing = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list', timeout=10))
    t = next((p for p in listing if p.get('description') == target), None)
    if not t:
        raise SystemExit('target not found: ' + repr([p.get('description') for p in listing]))
    return Conn(ws_connect(t['webSocketDebuggerUrl']))
