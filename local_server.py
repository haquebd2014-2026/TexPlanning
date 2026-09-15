import http.server
import socketserver
import urllib.request
import urllib.error
import os

PORT = 5000
BACKEND_URL = 'https://texplanning.onrender.com'
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class ERPLocalHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_HEAD(self):
        if self.path.startswith('/api/'):
            self.proxy_api('HEAD')
        else:
            super().do_HEAD()

    def do_GET(self):
        if self.path.startswith('/api/'):
            self.proxy_api('GET')
        else:
            if self.path == '/' or self.path == '':
                self.path = '/index.html'
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/'):
            self.proxy_api('POST')
        else:
            self.send_error(405, 'Method Not Allowed')

    def do_PUT(self):
        if self.path.startswith('/api/'):
            self.proxy_api('PUT')
        else:
            self.send_error(405, 'Method Not Allowed')

    def do_DELETE(self):
        if self.path.startswith('/api/'):
            self.proxy_api('DELETE')
        else:
            self.send_error(405, 'Method Not Allowed')

    def proxy_api(self, method):
        target_url = BACKEND_URL + self.path
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        req_headers = {}
        for key, val in self.headers.items():
            if key.lower() not in ['host', 'content-length']:
                req_headers[key] = val

        req = urllib.request.Request(target_url, data=body, headers=req_headers, method=method)

        try:
            with urllib.request.urlopen(req) as response:
                self.send_response(response.status)
                for header, value in response.getheaders():
                    if header.lower() not in ['transfer-encoding', 'content-encoding', 'content-length']:
                        self.send_header(header, value)
                res_body = response.read()
                self.send_header('Content-Length', str(len(res_body)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(res_body)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for header, value in e.headers.items():
                if header.lower() not in ['transfer-encoding', 'content-encoding', 'content-length']:
                    self.send_header(header, value)
            err_body = e.read()
            self.send_header('Content-Length', str(len(err_body)))
            self.end_headers()
            self.wfile.write(err_body)
        except Exception as err:
            self.send_error(502, f'Bad Gateway: {err}')

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    with ReusableTCPServer(('', PORT), ERPLocalHandler) as httpd:
        print(f'TexPlanning local server started on http://localhost:{PORT}', flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
